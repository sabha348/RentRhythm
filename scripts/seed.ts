// Resets the database and seeds "Sunrise Co-Living".
// Meal history runs from the start of SEED_MONTH (default: 3 months ago) through yesterday in the
// property's timezone; today has votes only (the cook logs today), and some tenants have
// already voted for tomorrow. The 2 months before last month get paid invoice history
// (source "seed", no PayPal invoice behind it): Daniel paid late both times.
// Usage: npm run seed
//        SEED_MONTH=2026-10 npm run seed
// Existing real invoice records (source "paypal") are kept, since they mirror PayPal sandbox
// invoices; set SEED_RESET_INVOICES=1 to drop them too. On a fresh disk (e.g. a Render free
// instance after a restart) they are rebuilt from PayPal by invoice number (RR-YYYYMM-T<id>-...).
// --if-empty: do nothing if the DB already has data (used on every server start).
import { existsSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { DB_PATH, getDb, schema } from "../lib/db";
import { dueDateFor, nextMonth } from "../lib/billing";
import { MEALS } from "../lib/db/schema";
import { getInvoice, listAllInvoices, type PayPalInvoice } from "../lib/paypal";
import { previewMonthlyBill } from "../lib/invoicing";
import { addDays, localDate } from "../lib/meals";

const TIMEZONE = "Asia/Kolkata";
const VOTE_CUTOFF = "21:00";
const GRACE_DAYS = 2;

// When each tenant paid seeded history invoices, in days after the due date (<= 0 is on time),
// oldest month first. Daniel is the repeat late payer; Lucas was late once (not a pattern).
const PAYMENT_HISTORY: Record<string, [number, number]> = {
  "Aarav Mehta": [-1, -2],
  "Sofia Rossi": [-2, -1],
  "Daniel Kim": [5, 6],
  "Priya Nair": [0, -1],
  "Lucas Martin": [3, -1],
  "Emma Okafor": [-2, -2],
};

type Habit = "reliable" | "walk-in" | "votes-but-skips" | "rarely-eats";

const TENANTS: {
  name: string;
  room: string;
  monthlyRent: number;
  paydayDay: number;
  habit: Habit;
  ac?: number;
}[] = [
  { name: "Aarav Mehta", room: "101", monthlyRent: 220, paydayDay: 1, habit: "reliable", ac: 15 },
  { name: "Sofia Rossi", room: "102", monthlyRent: 240, paydayDay: 5, habit: "reliable", ac: 15 },
  { name: "Daniel Kim", room: "103", monthlyRent: 200, paydayDay: 7, habit: "walk-in" },
  { name: "Priya Nair", room: "201", monthlyRent: 180, paydayDay: 10, habit: "walk-in", ac: 12 },
  { name: "Lucas Martin", room: "202", monthlyRent: 260, paydayDay: 15, habit: "votes-but-skips", ac: 20 },
  { name: "Emma Okafor", room: "203", monthlyRent: 190, paydayDay: 28, habit: "rarely-eats" },
];

// Per meal: chance of casting a vote, chance the vote is "going", chance of eating
// (given voted going / otherwise).
const HABITS: Record<Habit, { vote: number; going: number; eatIfGoing: number; eatOtherwise: number }> = {
  reliable: { vote: 1.0, going: 0.8, eatIfGoing: 0.97, eatOtherwise: 0.03 },
  "walk-in": { vote: 0.3, going: 0.8, eatIfGoing: 0.95, eatOtherwise: 0.8 },
  "votes-but-skips": { vote: 0.95, going: 0.9, eatIfGoing: 0.55, eatOtherwise: 0.05 },
  "rarely-eats": { vote: 0.15, going: 0.4, eatIfGoing: 0.9, eatOtherwise: 0.08 },
};

// Deterministic PRNG so every seed produces the same demo data.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function monthsBefore(today: string, n: number): string {
  const [y, m] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 7);
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

type SavedInvoice = Omit<typeof schema.invoices.$inferSelect, "id" | "tenantId"> & { tenantName: string };

// Read invoice rows (with tenant names, since tenant IDs are regenerated) before the DB is reset.
function saveInvoices(): SavedInvoice[] {
  if (process.env.SEED_RESET_INVOICES === "1" || !existsSync(DB_PATH)) return [];
  const old = new Database(DB_PATH, { readonly: true });
  try {
    return old
      .prepare(
        `SELECT t.name AS tenantName, i.month, i.paypal_invoice_id AS paypalInvoiceId,
                i.invoice_number AS invoiceNumber, i.status, i.total, i.due_date AS dueDate,
                i.paid_at AS paidAt, i.created_at AS createdAt, 'paypal' AS source
         FROM invoices i JOIN tenants t ON t.id = i.tenant_id
         ${hasSourceColumn(old) ? "WHERE i.source = 'paypal'" : ""}`,
      )
      .all() as SavedInvoice[];
  } catch {
    return []; // older or empty DB without these tables
  } finally {
    old.close();
  }
}

function hasSourceColumn(db: Database.Database): boolean {
  return (db.prepare("PRAGMA table_info(invoices)").all() as { name: string }[]).some((c) => c.name === "source");
}

const VOID_STATUSES = ["DRAFT", "CANCELLED"];

/**
 * Rebuilds real invoice records from PayPal: our invoice numbers encode the month and tenant
 * (RR-202610-T4-8489EE), and tenant IDs follow TENANTS order. Best effort: returns [] if PayPal
 * can't be reached, so the app still starts.
 */
async function restoreInvoicesFromPayPal(): Promise<SavedInvoice[]> {
  let invoices: PayPalInvoice[];
  try {
    invoices = await listAllInvoices();
  } catch (err) {
    console.warn(`Couldn't list PayPal invoices, starting without them: ${(err as Error).message}`);
    return [];
  }
  const latest = new Map<string, PayPalInvoice>(); // tenant+month -> newest non-void invoice
  for (const inv of invoices) {
    const m = inv.detail.invoice_number.match(/^RR-(\d{4})(\d{2})-T(\d+)-/);
    const tenant = m && TENANTS[Number(m[3]) - 1];
    if (!m || !tenant || VOID_STATUSES.includes(inv.status)) continue;
    const key = `${tenant.name}|${m[1]}-${m[2]}`;
    const prev = latest.get(key);
    if (!prev || (inv.detail.invoice_date ?? "") > (prev.detail.invoice_date ?? "")) latest.set(key, inv);
  }
  const restored: SavedInvoice[] = [];
  for (const [key, inv] of latest) {
    const [tenantName, month] = key.split("|");
    const paid = inv.status === "PAID" || inv.status === "MARKED_AS_PAID";
    // The list omits payment details, so fetch paid invoices for their payment date.
    const paidDate = paid
      ? ((await getInvoice(inv.id)).payments?.transactions ?? []).map((t) => t.payment_date).filter(Boolean).sort().at(-1)
      : undefined;
    restored.push({
      tenantName,
      month,
      paypalInvoiceId: inv.id,
      invoiceNumber: inv.detail.invoice_number,
      status: inv.status,
      total: Number(inv.amount?.value ?? 0),
      dueDate: inv.detail.payment_term?.due_date ?? "",
      paidAt: paid ? (paidDate?.slice(0, 10) ?? null) : null,
      source: "paypal",
      createdAt: `${inv.detail.invoice_date ?? month + "-01"} 00:00:00`,
    });
  }
  return restored;
}

function hasData(): boolean {
  if (!existsSync(DB_PATH)) return false;
  const db = new Database(DB_PATH, { readonly: true });
  try {
    return Boolean(db.prepare("SELECT 1 FROM properties LIMIT 1").get());
  } catch {
    return false;
  } finally {
    db.close();
  }
}

async function main() {
  if (process.argv.includes("--if-empty") && hasData()) {
    console.log(`${DB_PATH} already has data; not reseeding.`);
    return;
  }
  const today = localDate(new Date(), TIMEZONE);
  const tomorrow = addDays(today, 1);
  // Seeded payment history covers the 2 months before last month (last month is the live one).
  const paidHistoryMonths = [monthsBefore(today, 3), monthsBefore(today, 2)];
  const month = process.env.SEED_MONTH ?? paidHistoryMonths[0];
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`SEED_MONTH must be YYYY-MM, got ${month}`);
  if (`${month}-01` > today) throw new Error(`SEED_MONTH ${month} is in the future`);
  const history = datesBetween(`${month}-01`, addDays(today, -1));
  const historyMonths = [...new Set(history.map((d) => d.slice(0, 7)))];
  const email = process.env.PAYPAL_BUYER_EMAIL;
  if (!email) throw new Error("Missing env var PAYPAL_BUYER_EMAIL (all seeded tenants use the sandbox buyer)");

  let savedInvoices = saveInvoices();
  let restoredFromPayPal = false;
  if (!savedInvoices.length && process.env.SEED_RESET_INVOICES !== "1") {
    savedInvoices = await restoreInvoicesFromPayPal();
    restoredFromPayPal = savedInvoices.length > 0;
  }
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB_PATH + suffix, { force: true });
  const db = getDb();
  const rand = mulberry32(20261028);

  db.transaction((tx) => {
    tx.insert(schema.properties)
      .values({
        name: "Sunrise Co-Living",
        currency: "USD",
        mealPriceVoted: 3,
        mealPriceWalkIn: 5,
        graceDays: GRACE_DAYS,
        timezone: TIMEZONE,
        voteCutoff: VOTE_CUTOFF,
      })
      .run();

    for (const t of TENANTS) {
      const { id: tenantId } = tx
        .insert(schema.tenants)
        .values({ name: t.name, email, room: t.room, monthlyRent: t.monthlyRent, paydayDay: t.paydayDay })
        .returning({ id: schema.tenants.id })
        .get();

      const habit = HABITS[t.habit];
      const vote = (date: string, meal: (typeof MEALS)[number]) => {
        const voted = rand() < habit.vote;
        const going = voted && rand() < habit.going;
        if (voted) tx.insert(schema.mealVotes).values({ tenantId, date, meal, going }).run();
        return going;
      };

      for (const date of history) {
        for (const meal of MEALS) {
          const going = vote(date, meal);
          const ate = rand() < (going ? habit.eatIfGoing : habit.eatOtherwise);
          tx.insert(schema.mealAttendance).values({ tenantId, date, meal, ate }).run();
        }
      }
      // Today: votes were cast yesterday; the cook logs who actually ate.
      // Tomorrow: voting is still open, so only some tenants have voted yet.
      for (const meal of MEALS) vote(today, meal);
      for (const meal of MEALS) if (t.habit === "reliable" || t.habit === "votes-but-skips") vote(tomorrow, meal);

      if (t.ac) {
        for (const m of new Set([...historyMonths, ...paidHistoryMonths])) {
          tx.insert(schema.utilityCharges).values({ tenantId, month: m, label: "AC share", amount: t.ac }).run();
        }
      }
    }

    const tenantIds = new Map(tx.select().from(schema.tenants).all().map((t) => [t.name, t.id]));
    for (const { tenantName, ...invoice } of savedInvoices) {
      const tenantId = tenantIds.get(tenantName);
      if (tenantId) tx.insert(schema.invoices).values({ ...invoice, tenantId }).run();
      else console.warn(`Dropping invoice ${invoice.invoiceNumber}: tenant ${tenantName} no longer seeded`);
    }
  });

  // Paid invoice history (after the transaction, so bills are computed from the seeded meals).
  let seededInvoices = 0;
  for (const t of db.select().from(schema.tenants).all()) {
    paidHistoryMonths.forEach((m, i) => {
      if (savedInvoices.some((inv) => inv.tenantName === t.name && inv.month === m)) return; // real one kept
      const dueDate = dueDateFor(m, t.paydayDay, GRACE_DAYS);
      db.insert(schema.invoices)
        .values({
          tenantId: t.id,
          month: m,
          invoiceNumber: `SEED-${m.replace("-", "")}-T${t.id}`,
          status: "PAID",
          total: previewMonthlyBill(t.id, m, db).bill.total,
          dueDate,
          paidAt: `${addDays(dueDate, PAYMENT_HISTORY[t.name]?.[i] ?? 0)} 10:00:00`,
          source: "seed",
          createdAt: `${nextMonth(m)}-01 00:00:00`,
        })
        .run();
      seededInvoices++;
    });
  }

  // Summary so the seeded behaviour can be eyeballed.
  const rows = db.$client
    .prepare(
      `SELECT t.id, t.name, t.room, t.monthly_rent AS rent, t.payday_day AS payday,
              SUM(v.going = 1 AND a.ate = 1)            AS voted_ate,
              SUM(v.going = 1 AND a.ate = 0)            AS voted_skipped,
              SUM((v.going IS NULL OR v.going = 0) AND a.ate = 1) AS walk_ins,
              SUM(v.id IS NOT NULL)                     AS votes_cast,
              (SELECT COALESCE(SUM(amount), 0) FROM utility_charges u WHERE u.tenant_id = t.id AND u.month = ?) AS utilities
       FROM tenants t
       JOIN meal_attendance a ON a.tenant_id = t.id AND a.date LIKE ?
       LEFT JOIN meal_votes v ON v.tenant_id = a.tenant_id AND v.date = a.date AND v.meal = a.meal
       GROUP BY t.id ORDER BY t.id`,
    )
    .all(month, `${month}-%`);
  const counts = Object.fromEntries(
    ["properties", "tenants", "meal_votes", "meal_attendance", "utility_charges", "invoices"].map((table) => [
      table,
      (db.$client.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
    ]),
  );

  const votesOn = (date: string) =>
    db.$client
      .prepare("SELECT meal, SUM(going) AS going, COUNT(*) AS voted FROM meal_votes WHERE date = ? GROUP BY meal")
      .all(date);

  console.log(`Seeded ${DB_PATH}: history ${history[0]} → ${history.at(-1)} (${TIMEZONE}), today ${today}\n`);
  console.table(counts);
  if (savedInvoices.length) {
    console.log(
      restoredFromPayPal
        ? `Restored ${savedInvoices.length} real invoice records from PayPal.`
        : `Kept ${savedInvoices.length} real invoice records (SEED_RESET_INVOICES=1 drops them).`,
    );
  }
  console.log(`Seeded ${seededInvoices} paid history invoices for ${paidHistoryMonths.join(", ")}.\n`);
  console.log(`Billing summary for ${month}:`);
  console.table(rows);
  console.log(`Votes for today (${today}) and tomorrow (${tomorrow}):`);
  console.table([...votesOn(today).map((r) => ({ day: "today", ...(r as object) })), ...votesOn(tomorrow).map((r) => ({ day: "tomorrow", ...(r as object) }))]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
