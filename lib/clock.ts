// "Today" for collections and the agent, in the property's timezone.
import { localDate } from "./meals";

/**
 * DEMO_TODAY=YYYY-MM-DD pins the collections date for rehearsals (e.g. "recording day" while
 * building). Meal voting always uses the real clock, since the cutoff depends on the time of day.
 */
export function collectionsToday(timezone: string, now = new Date()): string {
  const pinned = process.env.DEMO_TODAY;
  if (pinned) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pinned)) throw new Error(`DEMO_TODAY must be YYYY-MM-DD, got ${pinned}`);
    return pinned;
  }
  return localDate(now, timezone);
}
