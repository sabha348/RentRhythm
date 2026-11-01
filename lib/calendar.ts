// Owner calendar data: one event per invoice on its due date, plus tomorrow's meal headcount.
// Pure functions only; the page loads data from the DB and the client hands this to Bryntum.
import { addDays } from "./meals";
import { paydayFor } from "./billing";
import { PAID_STATUSES, UNPAID_STATUSES } from "./collections";

export type CalendarTenant = { id: number; name: string; room: string; paydayDay: number; repeatLatePayer: boolean; lateSummary: string };

export type CalendarInvoice = {
  tenantId: number;
  month: string;
  invoiceNumber: string;
  status: string;
  total: number;
  dueDate: string;
  paidAt: string | null;
  source: string;
};

export type BillState = "paid" | "upcoming" | "payday-passed" | "overdue";

// Bryntum event colour names.
export const STATE_COLORS: Record<BillState, string> = {
  paid: "green",
  upcoming: "blue",
  "payday-passed": "amber",
  overdue: "red",
};

const STATE_LABELS: Record<BillState, string> = {
  paid: "Paid",
  upcoming: "Not due yet",
  "payday-passed": "Payday passed, unpaid",
  overdue: "Overdue",
};

// Distinct, status-neutral colours for the tenant filter list (status colours are for events).
const TENANT_COLORS = ["indigo", "teal", "purple", "cyan", "pink", "deep-orange", "lime", "violet"];
export const KITCHEN_RESOURCE_ID = 0;

export type CalendarEvent = {
  id: string;
  resourceId: number;
  name: string;
  startDate: string;
  endDate: string; // exclusive: all-day events need an end date to be drawn
  allDay: true;
  eventColor: string;
  // Shown in the click tooltip (plain text; the client HTML-encodes it).
  details: { title: string; lines: string[]; link?: { href: string; label: string } };
};

export type CalendarData = {
  resources: { id: number; name: string; eventColor: string }[];
  events: CalendarEvent[];
};

const ordinal = (n: number) =>
  n % 100 >= 11 && n % 100 <= 13 ? `${n}th` : `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Where an invoice stands today; null for never-sent or cancelled invoices (not shown). */
export function billState(invoice: CalendarInvoice, paydayDay: number, today: string): BillState | null {
  if (PAID_STATUSES.includes(invoice.status)) return "paid";
  if (!UNPAID_STATUSES.includes(invoice.status)) return null;
  if (today > invoice.dueDate) return "overdue";
  return paydayFor(invoice.month, paydayDay) <= today ? "payday-passed" : "upcoming";
}

export function invoiceEvent(invoice: CalendarInvoice, tenant: CalendarTenant, today: string): CalendarEvent | null {
  const state = billState(invoice, tenant.paydayDay, today);
  if (!state) return null;
  const firstName = tenant.name.split(" ")[0];
  const amount = `$${Math.round(invoice.total)}`;

  const lines = [
    `${STATE_LABELS[state]} · $${invoice.total.toFixed(2)} for ${invoice.month}`,
    `Payday ${ordinal(tenant.paydayDay)} → due ${invoice.dueDate}`,
  ];
  if (state === "paid" && invoice.paidAt) {
    const late = daysBetween(invoice.dueDate, invoice.paidAt.slice(0, 10));
    lines.push(`Paid ${invoice.paidAt.slice(0, 10)}${late > 0 ? ` (${days(late)} late)` : ""}`);
  }
  if (state === "overdue") lines.push(`Overdue by ${days(daysBetween(invoice.dueDate, today))}`);
  if (tenant.repeatLatePayer) lines.push(`⚠ Repeat late payer: ${tenant.lateSummary}`);
  lines.push(invoice.source === "seed" ? "Demo payment history" : `PayPal invoice ${invoice.invoiceNumber}`);

  return {
    id: `invoice-${invoice.invoiceNumber}`,
    resourceId: tenant.id,
    // Short enough for a month cell; the details are in the tooltip.
    name: `${tenant.repeatLatePayer ? "⚠ " : ""}${firstName} · ${amount}`,
    startDate: invoice.dueDate,
    endDate: addDays(invoice.dueDate, 1),
    allDay: true,
    eventColor: STATE_COLORS[state],
    details: {
      title: `${tenant.name} · room ${tenant.room}`,
      lines,
      link: { href: `/owner?month=${invoice.month}`, label: "Open in owner dashboard" },
    },
  };
}

export type TomorrowHeadcount = {
  date: string;
  lunch: { going: string[]; notVoted: string[] };
  dinner: { going: string[]; notVoted: string[] };
};

export function headcountEvent(h: TomorrowHeadcount): CalendarEvent {
  const notVoted = new Set([...h.lunch.notVoted, ...h.dinner.notVoted]);
  return {
    id: `meals-${h.date}`,
    resourceId: KITCHEN_RESOURCE_ID,
    name: `🍽 Lunch ${h.lunch.going.length} · Dinner ${h.dinner.going.length}`,
    startDate: h.date,
    endDate: addDays(h.date, 1),
    allDay: true,
    eventColor: "gray",
    details: {
      title: `Meals tomorrow (${h.date})`,
      lines: [
        `Lunch: ${h.lunch.going.length} going${h.lunch.going.length ? ` (${h.lunch.going.join(", ")})` : ""}`,
        `Dinner: ${h.dinner.going.length} going${h.dinner.going.length ? ` (${h.dinner.going.join(", ")})` : ""}`,
        notVoted.size ? `Not voted yet: ${[...notVoted].join(", ")}` : "Everyone has voted",
      ],
      link: { href: "/cook", label: "Open kitchen view" },
    },
  };
}

export function buildCalendar(input: {
  tenants: CalendarTenant[];
  invoices: CalendarInvoice[];
  today: string;
  tomorrowHeadcount: TomorrowHeadcount;
}): CalendarData {
  const byId = new Map(input.tenants.map((t) => [t.id, t]));
  const events = input.invoices
    .map((inv) => {
      const tenant = byId.get(inv.tenantId);
      return tenant ? invoiceEvent(inv, tenant, input.today) : null;
    })
    .filter((e): e is CalendarEvent => e !== null);
  events.push(headcountEvent(input.tomorrowHeadcount));

  return {
    resources: [
      ...input.tenants.map((t, i) => ({ id: t.id, name: t.name, eventColor: TENANT_COLORS[i % TENANT_COLORS.length] })),
      { id: KITCHEN_RESOURCE_ID, name: "Kitchen (meals)", eventColor: "gray" },
    ],
    events,
  };
}
