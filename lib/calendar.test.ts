import { describe, expect, it } from "vitest";
import { billState, buildCalendar, type CalendarInvoice, type CalendarTenant, headcountEvent, invoiceEvent } from "./calendar";

const TODAY = "2026-11-10";

const tenant = (overrides: Partial<CalendarTenant> = {}): CalendarTenant => ({
  id: 1,
  name: "Aarav Mehta",
  room: "101",
  paydayDay: 1,
  repeatLatePayer: false,
  lateSummary: "late 0 of the last 2 months",
  ...overrides,
});

const invoice = (overrides: Partial<CalendarInvoice> = {}): CalendarInvoice => ({
  tenantId: 1,
  month: "2026-10",
  invoiceNumber: "RR-202610-T1-X",
  status: "SENT",
  total: 358,
  dueDate: "2026-11-03",
  paidAt: null,
  source: "paypal",
  ...overrides,
});

describe("billState", () => {
  it("is paid, upcoming, payday-passed or overdue", () => {
    expect(billState(invoice({ status: "PAID" }), 1, TODAY)).toBe("paid");
    expect(billState(invoice({ status: "MARKED_AS_PAID" }), 1, TODAY)).toBe("paid");
    expect(billState(invoice({ dueDate: "2026-11-17" }), 15, TODAY)).toBe("upcoming"); // payday Nov 15
    expect(billState(invoice({ dueDate: "2026-11-12" }), 10, TODAY)).toBe("payday-passed"); // payday is today
    expect(billState(invoice({ dueDate: "2026-11-09" }), 7, TODAY)).toBe("overdue");
  });

  it("hides never-sent and cancelled invoices", () => {
    expect(billState(invoice({ status: "DRAFT" }), 1, TODAY)).toBeNull();
    expect(billState(invoice({ status: "CANCELLED" }), 1, TODAY)).toBeNull();
    expect(invoiceEvent(invoice({ status: "CANCELLED" }), tenant(), TODAY)).toBeNull();
  });
});

describe("invoiceEvent", () => {
  it("puts a short, coloured all-day event on the due date", () => {
    const e = invoiceEvent(invoice({ status: "PAID", paidAt: "2026-11-01 11:30:14" }), tenant(), TODAY)!;
    expect(e).toMatchObject({
      id: "invoice-RR-202610-T1-X",
      resourceId: 1,
      name: "Aarav · $358",
      startDate: "2026-11-03",
      endDate: "2026-11-04",
      allDay: true,
      eventColor: "green",
    });
    expect(e.details.title).toBe("Aarav Mehta · room 101");
    expect(e.details.lines).toEqual([
      "Paid · $358.00 for 2026-10",
      "Payday 1st → due 2026-11-03",
      "Paid 2026-11-01",
      "PayPal invoice RR-202610-T1-X",
    ]);
    expect(e.details.link).toEqual({ href: "/owner?month=2026-10", label: "Open in owner dashboard" });
  });

  it("flags repeat late payers and shows how late or overdue", () => {
    const daniel = tenant({ id: 3, name: "Daniel Kim", room: "103", paydayDay: 7, repeatLatePayer: true, lateSummary: "late 3 of the last 3 months" });
    const overdue = invoiceEvent(invoice({ tenantId: 3, total: 422, dueDate: "2026-11-09" }), daniel, TODAY)!;
    expect(overdue.name).toBe("⚠ Daniel · $422");
    expect(overdue.eventColor).toBe("red");
    expect(overdue.details.lines).toContain("Overdue by 1 day");
    expect(overdue.details.lines).toContain("⚠ Repeat late payer: late 3 of the last 3 months");

    const paidLate = invoiceEvent(
      invoice({ tenantId: 3, month: "2026-09", status: "PAID", dueDate: "2026-10-09", paidAt: "2026-10-15 10:00:00", source: "seed" }),
      daniel,
      TODAY,
    )!;
    expect(paidLate.eventColor).toBe("green");
    expect(paidLate.details.lines).toContain("Paid 2026-10-15 (6 days late)");
    expect(paidLate.details.lines).toContain("Demo payment history");
  });

  it("uses amber when the payday has passed but the bill isn't due yet, blue before payday", () => {
    expect(invoiceEvent(invoice({ dueDate: "2026-11-12" }), tenant({ paydayDay: 10 }), TODAY)!.eventColor).toBe("amber");
    expect(invoiceEvent(invoice({ dueDate: "2026-11-17" }), tenant({ paydayDay: 15 }), TODAY)!.eventColor).toBe("blue");
  });
});

describe("headcountEvent", () => {
  it("summarises tomorrow's meals and who hasn't voted", () => {
    const e = headcountEvent({
      date: "2026-11-11",
      lunch: { going: ["Aarav", "Sofia", "Lucas", "Priya"], notVoted: ["Daniel", "Emma"] },
      dinner: { going: ["Aarav", "Lucas"], notVoted: ["Daniel", "Emma"] },
    });
    expect(e).toMatchObject({ name: "🍽 Lunch 4 · Dinner 2", startDate: "2026-11-11", endDate: "2026-11-12", resourceId: 0 });
    expect(e.details.lines.at(-1)).toBe("Not voted yet: Daniel, Emma");
    expect(e.details.link?.href).toBe("/cook");
  });
});

describe("buildCalendar", () => {
  it("returns tenants plus a kitchen resource, invoice events and the headcount event", () => {
    const data = buildCalendar({
      tenants: [tenant(), tenant({ id: 2, name: "Sofia Rossi", room: "102", paydayDay: 5 })],
      invoices: [
        invoice(),
        invoice({ tenantId: 2, invoiceNumber: "RR-202610-T2-Y", dueDate: "2026-11-07", total: 404 }),
        invoice({ tenantId: 2, invoiceNumber: "RR-202611-T2-Z", month: "2026-11", status: "DRAFT" }),
        invoice({ tenantId: 99, invoiceNumber: "RR-OTHER" }), // unknown tenant
      ],
      today: TODAY,
      tomorrowHeadcount: { date: "2026-11-11", lunch: { going: [], notVoted: [] }, dinner: { going: [], notVoted: [] } },
    });
    expect(data.resources.map((r) => r.name)).toEqual(["Aarav Mehta", "Sofia Rossi", "Kitchen (meals)"]);
    expect(new Set(data.resources.map((r) => r.eventColor)).size).toBe(3);
    expect(data.events.map((e) => e.id)).toEqual(["invoice-RR-202610-T1-X", "invoice-RR-202610-T2-Y", "meals-2026-11-11"]);
  });
});
