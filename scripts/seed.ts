// Resets the database and seeds "Sunrise Co-Living".
// Usage: npm run seed            (meals for the previous full month)
//        SEED_MONTH=2026-10 npm run seed
import { rmSync } from "node:fs";
import { DB_PATH, getDb, schema } from "../lib/db";
import type { Meal } from "../lib/db/schema";

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

function previousMonth(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

function datesInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function main() {
  const month = process.env.SEED_MONTH ?? previousMonth();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`SEED_MONTH must be YYYY-MM, got ${month}`);
  const email = process.env.PAYPAL_BUYER_EMAIL;
  if (!email) throw new Error("Missing env var PAYPAL_BUYER_EMAIL (all seeded tenants use the sandbox buyer)");

  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB_PATH + suffix, { force: true });
  const db = getDb();
  const rand = mulberry32(20261028);
  const meals: Meal[] = ["lunch", "dinner"];

  db.transaction((tx) => {
    tx.insert(schema.properties)
      .values({ name: "Sunrise Co-Living", currency: "USD", mealPriceVoted: 3, mealPriceWalkIn: 5, graceDays: 2 })
      .run();

    for (const t of TENANTS) {
      const { id: tenantId } = tx
        .insert(schema.tenants)
        .values({ name: t.name, email, room: t.room, monthlyRent: t.monthlyRent, paydayDay: t.paydayDay })
        .returning({ id: schema.tenants.id })
        .get();

      const habit = HABITS[t.habit];
      for (const date of datesInMonth(month)) {
        for (const meal of meals) {
          const voted = rand() < habit.vote;
          const going = voted && rand() < habit.going;
          if (voted) tx.insert(schema.mealVotes).values({ tenantId, date, meal, going }).run();
          const ate = rand() < (going ? habit.eatIfGoing : habit.eatOtherwise);
          tx.insert(schema.mealAttendance).values({ tenantId, date, meal, ate }).run();
        }
      }

      if (t.ac) {
        tx.insert(schema.utilityCharges).values({ tenantId, month, label: "AC share", amount: t.ac }).run();
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
              (SELECT COALESCE(SUM(amount), 0) FROM utility_charges u WHERE u.tenant_id = t.id) AS utilities
       FROM tenants t
       JOIN meal_attendance a ON a.tenant_id = t.id
       LEFT JOIN meal_votes v ON v.tenant_id = a.tenant_id AND v.date = a.date AND v.meal = a.meal
       GROUP BY t.id ORDER BY t.id`,
    )
    .all();
  const counts = Object.fromEntries(
    ["properties", "tenants", "meal_votes", "meal_attendance", "utility_charges", "invoices"].map((table) => [
      table,
      (db.$client.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
    ]),
  );

  console.log(`Seeded ${DB_PATH} with meals for ${month}\n`);
  console.table(counts);
  console.table(rows);
}

main();
