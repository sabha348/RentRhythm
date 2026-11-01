// Loads the owner calendar from the DB (see lib/calendar.ts for the rules).
import { eq } from "drizzle-orm";
import { buildCalendar, type CalendarData } from "./calendar";
import { loadCollections } from "./collections-db";
import { type DB, getDb, schema } from "./db";
import { headcount } from "./meals";
import { getVotingWindow, loadDay } from "./meals-db";

export function loadCalendar(db: DB = getDb()): CalendarData & { today: string } {
  const { today, tenants: collections } = loadCollections(db);
  const flags = new Map(collections.map((c) => [c.tenantId, c]));
  const tenants = db.select().from(schema.tenants).where(eq(schema.tenants.active, true)).all();

  // Meal voting runs on the real clock (the cutoff depends on the time of day), so "tomorrow" here
  // is the real tomorrow even when DEMO_TODAY pins the collections date.
  const { tomorrow } = getVotingWindow(new Date(), db);
  const day = loadDay(tomorrow, db);
  const counts = headcount(day.tenants, day.votes, tomorrow);
  const first = (p: { name: string }) => p.name.split(" ")[0];

  return {
    today,
    ...buildCalendar({
      today,
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        room: t.room,
        paydayDay: t.paydayDay,
        repeatLatePayer: flags.get(t.id)?.repeatLatePayer ?? false,
        lateSummary: flags.get(t.id)?.lateSummary ?? "",
      })),
      invoices: db.select().from(schema.invoices).all(),
      tomorrowHeadcount: {
        date: tomorrow,
        lunch: { going: counts.lunch.going.map(first), notVoted: counts.lunch.notVoted.map(first) },
        dinner: { going: counts.dinner.going.map(first), notVoted: counts.dinner.notVoted.map(first) },
      },
    }),
  };
}
