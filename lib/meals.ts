// Meal voting rules. Pure functions only: callers pass the clock and the property's timezone.
import { MEALS, type Meal } from "./db/schema";

/** YYYY-MM-DD for `now` in an IANA timezone. */
export function localDate(now: Date, timezone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** HH:MM (24-hour) for `now` in an IANA timezone. */
export function localTime(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type VotingWindow = {
  today: string;
  tomorrow: string; // the only date tenants vote for
  open: boolean; // votes for tomorrow close at the cutoff, so the cook has a fixed number
  cutoff: string; // HH:MM local
};

export function votingWindow(now: Date, timezone: string, cutoff: string): VotingWindow {
  const today = localDate(now, timezone);
  return { today, tomorrow: addDays(today, 1), open: localTime(now, timezone) < cutoff, cutoff };
}

type Person = { tenantId: number; name: string };
type TenantLike = { id: number; name: string; room?: string };
type VoteLike = { tenantId: number; date: string; meal: Meal; going: boolean };
type AttendanceLike = { tenantId: number; date: string; meal: Meal; ate: boolean };

export type MealHeadcount = { going: Person[]; notGoing: Person[]; notVoted: Person[] };

/** Who has voted going / not going / not at all, per meal, for one date. */
export function headcount(tenants: TenantLike[], votes: VoteLike[], date: string): Record<Meal, MealHeadcount> {
  const result = {} as Record<Meal, MealHeadcount>;
  for (const meal of MEALS) {
    const byTenant = new Map(votes.filter((v) => v.date === date && v.meal === meal).map((v) => [v.tenantId, v.going]));
    const entry: MealHeadcount = { going: [], notGoing: [], notVoted: [] };
    for (const t of tenants) {
      const person = { tenantId: t.id, name: t.name };
      const vote = byTenant.get(t.id);
      (vote === undefined ? entry.notVoted : vote ? entry.going : entry.notGoing).push(person);
    }
    result[meal] = entry;
  }
  return result;
}

export type ServingRow = Person & { room?: string; ate: boolean; logged: boolean };

export type ServingList = {
  voters: ServingRow[]; // voted going; pre-ticked as eaten until the cook unticks a no-show
  walkIns: ServingRow[]; // ate without a going vote (billed at the walk-in price)
  others: Person[]; // everyone else, i.e. who can be added as a walk-in
};

/** The cook's serving log for one meal. */
export function servingList(
  tenants: TenantLike[],
  votes: VoteLike[],
  attendance: AttendanceLike[],
  date: string,
  meal: Meal,
): ServingList {
  const going = new Set(votes.filter((v) => v.date === date && v.meal === meal && v.going).map((v) => v.tenantId));
  const logged = new Map(attendance.filter((a) => a.date === date && a.meal === meal).map((a) => [a.tenantId, a.ate]));

  const list: ServingList = { voters: [], walkIns: [], others: [] };
  for (const t of tenants) {
    const row = { tenantId: t.id, name: t.name, room: t.room };
    const ate = logged.get(t.id);
    if (going.has(t.id)) list.voters.push({ ...row, ate: ate ?? true, logged: ate !== undefined });
    else if (ate) list.walkIns.push({ ...row, ate: true, logged: true });
    else list.others.push({ tenantId: t.id, name: t.name });
  }
  return list;
}
