// Who owes what, whose payday has passed, and who pays late. Pure functions only.
import { addDays } from "./meals";
import { paydayFor } from "./billing";

export const PAID_STATUSES = ["PAID", "MARKED_AS_PAID"];
// Sent to the tenant and not yet (fully) paid. DRAFT/CREATING were never sent; CANCELLED is void.
export const UNPAID_STATUSES = ["SENT", "UNPAID", "PARTIALLY_PAID", "SCHEDULED"];

/** How many of the most recent decided months to look at, and how many late ones make a pattern. */
export const LATE_WINDOW = 3;
export const REPEAT_LATE_THRESHOLD = 2;

export type InvoiceRecord = {
  month: string; // billed month, YYYY-MM
  invoiceNumber: string;
  paypalInvoiceId: string | null;
  status: string;
  total: number;
  dueDate: string; // YYYY-MM-DD
  paidAt: string | null; // date or datetime; only the date part is compared
};

export type Outcome =
  | { kind: "on-time" }
  | { kind: "late"; daysLate: number } // paid after the due date
  | { kind: "overdue"; daysOverdue: number } // unpaid and past the due date
  | { kind: "open" } // unpaid, not yet due
  | { kind: "void" }; // never sent or cancelled

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function outcome(invoice: InvoiceRecord, today: string): Outcome {
  if (PAID_STATUSES.includes(invoice.status)) {
    // A PAID invoice without a recorded date (e.g. paid before we tracked it) counts as on time.
    const paidOn = invoice.paidAt?.slice(0, 10);
    const late = paidOn ? daysBetween(invoice.dueDate, paidOn) : 0;
    return late > 0 ? { kind: "late", daysLate: late } : { kind: "on-time" };
  }
  if (UNPAID_STATUSES.includes(invoice.status)) {
    const overdue = daysBetween(invoice.dueDate, today);
    return overdue > 0 ? { kind: "overdue", daysOverdue: overdue } : { kind: "open" };
  }
  return { kind: "void" };
}

const isDecided = (o: Outcome) => o.kind === "on-time" || o.kind === "late" || o.kind === "overdue";

export type TenantForCollections = {
  id: number;
  name: string;
  room: string;
  paydayDay: number;
  invoices: InvoiceRecord[];
};

export type TenantCollections = {
  tenantId: number;
  name: string;
  room: string;
  paydayDay: number;
  /** The latest sent invoice, if any. */
  current: {
    month: string;
    invoiceNumber: string;
    paypalInvoiceId: string | null;
    status: string;
    total: number;
    payday: string;
    paydayPassed: boolean; // payday is today or earlier
    dueDate: string;
    dueInDays: number; // negative = overdue by that many days
    unpaid: boolean;
  } | null;
  /** Most recent decided months first (paid, or unpaid past due). */
  history: { month: string; outcome: Outcome["kind"]; days: number }[];
  lateCount: number;
  repeatLatePayer: boolean;
  /** Remind = unpaid and the tenant's payday has passed, so they should have the money. */
  suggestedAction: "remind" | "wait" | "none";
};

export function tenantCollections(tenant: TenantForCollections, today: string): TenantCollections {
  const sent = tenant.invoices
    .filter((i) => outcome(i, today).kind !== "void")
    .sort((a, b) => b.month.localeCompare(a.month));

  const latest = sent[0];
  let current: TenantCollections["current"] = null;
  if (latest) {
    const payday = paydayFor(latest.month, tenant.paydayDay);
    current = {
      month: latest.month,
      invoiceNumber: latest.invoiceNumber,
      paypalInvoiceId: latest.paypalInvoiceId,
      status: latest.status,
      total: latest.total,
      payday,
      paydayPassed: payday <= today,
      dueDate: latest.dueDate,
      dueInDays: daysBetween(today, latest.dueDate),
      unpaid: UNPAID_STATUSES.includes(latest.status),
    };
  }

  const history = sent
    .map((i) => ({ month: i.month, outcome: outcome(i, today) }))
    .filter((h) => isDecided(h.outcome))
    .slice(0, LATE_WINDOW)
    .map(({ month, outcome: o }) => ({
      month,
      outcome: o.kind,
      days: o.kind === "late" ? o.daysLate : o.kind === "overdue" ? o.daysOverdue : 0,
    }));
  const lateCount = history.filter((h) => h.outcome === "late" || h.outcome === "overdue").length;

  return {
    tenantId: tenant.id,
    name: tenant.name,
    room: tenant.room,
    paydayDay: tenant.paydayDay,
    current,
    history,
    lateCount,
    repeatLatePayer: lateCount >= REPEAT_LATE_THRESHOLD,
    suggestedAction: !current?.unpaid ? "none" : current.paydayPassed ? "remind" : "wait",
  };
}

/** The window "this week" means for the owner: today through the next 6 days. */
export function weekRange(today: string): { from: string; to: string } {
  return { from: today, to: addDays(today, 6) };
}
