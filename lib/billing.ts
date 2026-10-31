// Monthly bill calculation. Pure functions only: no DB, no PayPal, no clock.
import type { Meal } from "./db/schema";

/**
 * Policy: a tenant who voted "going" but didn't eat is still charged at the voted price,
 * because the food was cooked for them. Flip this to stop charging no-shows.
 */
export const CHARGE_VOTED_BUT_ABSENT = true;

export type BillingInput = {
  month: string; // YYYY-MM: the month being billed (meals and utilities used in it)
  property: { currency: string; mealPriceVoted: number; mealPriceWalkIn: number; graceDays: number };
  tenant: { monthlyRent: number; paydayDay: number };
  votes: { date: string; meal: Meal; going: boolean }[];
  attendance: { date: string; meal: Meal; ate: boolean }[];
  utilities: { label: string; amount: number }[];
};

export type BillLine = { name: string; quantity: number; unitAmount: number; amount: number };

export type Bill = {
  month: string;
  currency: string;
  lines: BillLine[];
  total: number;
  dueDate: string; // YYYY-MM-DD
  meals: { votedAte: number; votedAbsent: number; walkIns: number };
};

/** Rounds half up to cents using the decimal value (so 2.675 -> 2.68, not 2.67 from float error). */
export function round2(n: number): number {
  // toFixed(8) avoids exponent notation (e.g. 5.5e-17) before shifting the decimal point.
  return Number(`${Math.round(Number(`${n.toFixed(8)}e2`))}e-2`) || 0;
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** The month after a YYYY-MM month. */
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

/**
 * The tenant's payday in the month after `month` (when that month's bill falls due). Paydays past
 * the month's end (e.g. 31 in February) clamp to its last day.
 */
export function paydayFor(month: string, paydayDay: number): string {
  const [y, m] = nextMonth(month).split("-").map(Number);
  const payday = Math.min(Math.max(1, paydayDay), daysInMonth(y, m));
  return new Date(Date.UTC(y, m - 1, payday)).toISOString().slice(0, 10);
}

/**
 * A bill for `month` is sent when that month ends, so it is due on the tenant's payday in the
 * FOLLOWING month plus grace days.
 */
export function dueDateFor(month: string, paydayDay: number, graceDays: number): string {
  const [y, m, d] = paydayFor(month, paydayDay).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + graceDays)).toISOString().slice(0, 10);
}

// PayPal computes each line as quantity × the 2-decimal unit price, so do the same.
function line(name: string, quantity: number, unitAmount: number): BillLine {
  const unit = round2(unitAmount);
  return { name, quantity, unitAmount: unit, amount: round2(quantity * unit) };
}

export function computeBill(input: BillingInput): Bill {
  const { month, property, tenant } = input;
  const inMonth = (date: string) => date.startsWith(`${month}-`);
  const key = (date: string, meal: Meal) => `${date}|${meal}`;

  const goingVotes = new Set(
    input.votes.filter((v) => v.going && inMonth(v.date)).map((v) => key(v.date, v.meal)),
  );
  const ate = new Set(
    input.attendance.filter((a) => a.ate && inMonth(a.date)).map((a) => key(a.date, a.meal)),
  );

  let votedAte = 0;
  let votedAbsent = 0;
  for (const k of goingVotes) (ate.has(k) ? votedAte++ : votedAbsent++);
  // Ate without a "going" vote (no vote, or voted not going) = walk-in.
  const walkIns = [...ate].filter((k) => !goingVotes.has(k)).length;

  const votedMeals = votedAte + (CHARGE_VOTED_BUT_ABSENT ? votedAbsent : 0);

  const lines: BillLine[] = [line("Monthly rent", 1, tenant.monthlyRent)];
  if (votedMeals > 0) lines.push(line(`Meals (${votedMeals} voted)`, votedMeals, property.mealPriceVoted));
  if (walkIns > 0) lines.push(line(`Walk-in meals (${walkIns}, not voted)`, walkIns, property.mealPriceWalkIn));
  for (const u of input.utilities) lines.push(line(u.label, 1, u.amount));

  return {
    month,
    currency: property.currency,
    lines,
    total: round2(lines.reduce((sum, l) => sum + l.amount, 0)),
    dueDate: dueDateFor(month, tenant.paydayDay, property.graceDays),
    meals: { votedAte, votedAbsent, walkIns },
  };
}
