// Meal votes and attendance in the DB. Rules live in lib/meals.ts; this enforces them on writes.
import { and, eq } from "drizzle-orm";
import { type DB, getDb, schema } from "./db";
import { MEALS, type Meal, type Property } from "./db/schema";
import { localDate, votingWindow } from "./meals";

export class MealError extends Error {}

function getProperty(db: DB): Property {
  const property = db.select().from(schema.properties).get();
  if (!property) throw new MealError("No property found; run npm run seed");
  return property;
}

function assertMeal(meal: string): asserts meal is Meal {
  if (!MEALS.includes(meal as Meal)) throw new MealError(`Unknown meal ${meal}`);
}

function assertActiveTenant(db: DB, tenantId: number) {
  const tenant = db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).get();
  if (!tenant?.active) throw new MealError(`Tenant ${tenantId} not found`);
}

export function getVotingWindow(now = new Date(), db: DB = getDb()) {
  const property = getProperty(db);
  return votingWindow(now, property.timezone, property.voteCutoff);
}

/** Tenant votes for tomorrow's meal. Only allowed for tomorrow, before the cutoff. */
export function castVote(tenantId: number, date: string, meal: string, going: boolean, now = new Date(), db: DB = getDb()) {
  assertMeal(meal);
  assertActiveTenant(db, tenantId);
  const window = getVotingWindow(now, db);
  if (date !== window.tomorrow) throw new MealError(`You can only vote for tomorrow (${window.tomorrow})`);
  if (!window.open) throw new MealError(`Voting for ${date} closed at ${window.cutoff}`);

  db.insert(schema.mealVotes)
    .values({ tenantId, date, meal, going })
    .onConflictDoUpdate({
      target: [schema.mealVotes.tenantId, schema.mealVotes.date, schema.mealVotes.meal],
      set: { going },
    })
    .run();
}

/** Cook logs whether a tenant ate a meal. Allowed for today and earlier, never the future. */
export function logAttendance(tenantId: number, date: string, meal: string, ate: boolean, now = new Date(), db: DB = getDb()) {
  assertMeal(meal);
  assertActiveTenant(db, tenantId);
  const today = localDate(now, getProperty(db).timezone);
  if (date > today) throw new MealError(`Can't log meals for a future date (${date})`);

  db.insert(schema.mealAttendance)
    .values({ tenantId, date, meal, ate })
    .onConflictDoUpdate({
      target: [schema.mealAttendance.tenantId, schema.mealAttendance.date, schema.mealAttendance.meal],
      set: { ate },
    })
    .run();
}

/** Active tenants plus the votes and attendance for one date. */
export function loadDay(date: string, db: DB = getDb()) {
  return {
    tenants: db.select().from(schema.tenants).where(eq(schema.tenants.active, true)).all(),
    votes: db.select().from(schema.mealVotes).where(eq(schema.mealVotes.date, date)).all(),
    attendance: db.select().from(schema.mealAttendance).where(eq(schema.mealAttendance.date, date)).all(),
  };
}

export function tenantVotes(tenantId: number, date: string, db: DB = getDb()) {
  return db
    .select()
    .from(schema.mealVotes)
    .where(and(eq(schema.mealVotes.tenantId, tenantId), eq(schema.mealVotes.date, date)))
    .all();
}
