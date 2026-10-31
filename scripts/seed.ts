// Resets the database and seeds "Sunrise Co-Living".
// Meal history runs from the start of SEED_MONTH (default: last month) through yesterday in the
// property's timezone; today has votes only (the cook logs today), and some tenants have
// already voted for tomorrow.
// Usage: npm run seed
//        SEED_MONTH=2026-10 npm run seed
import { rmSync } from "node:fs";
import { DB_PATH, getDb, schema } from "../lib/db";
import { MEALS } from "../lib/db/schema";
import { addDays, localDate } from "../lib/meals";

const TIMEZONE = "Asia/Kolkata";
const VOTE_CUTOFF = "21:00";

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

function previousMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

function main() {
  const today = localDate(new Date(), TIMEZONE);
  const tomorrow = addDays(today, 1);
  const month = process.env.SEED_MONTH ?? previousMonth(today);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`SEED_MONTH must be YYYY-MM, got ${month}`);
  if (`${month}-01` > today) throw new Error(`SEED_MONTH ${month} is in the future`);
  const history = datesBetween(`${month}-01`, addDays(today, -1));
  const historyMonths = [...new Set(history.map((d) => d.slice(0, 7)))];
  const email = process.env.PAYPAL_BUYER_EMAIL;
  if (!email) throw new Error("Missing env var PAYPAL_BUYER_EMAIL (all seeded tenants use the sandbox buyer)");

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
        graceDays: 2,
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
        for (const m of historyMonths) {
          tx.insert(schema.utilityCharges).values({ tenantId, month: m, label: "AC share", amount: t.ac }).run();
        }
      }
    }
  });

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
  console.log(`Billing summary for ${month}:`);
  console.table(rows);
  console.log(`Votes for today (${today}) and tomorrow (${tomorrow}):`);
  console.table([...votesOn(today).map((r) => ({ day: "today", ...(r as object) })), ...votesOn(tomorrow).map((r) => ({ day: "tomorrow", ...(r as object) }))]);
}

main();
