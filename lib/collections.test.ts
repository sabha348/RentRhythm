import { describe, expect, it } from "vitest";
import { type InvoiceRecord, outcome, tenantCollections, weekRange } from "./collections";

const inv = (month: string, status: string, dueDate: string, paidAt: string | null = null): InvoiceRecord => ({
  month,
  invoiceNumber: `RR-${month}`,
  paypalInvoiceId: status === "DRAFT" ? null : `INV2-${month}`,
  status,
  total: 300,
  dueDate,
  paidAt,
});

describe("outcome", () => {
  const due = "2026-10-09";
  it("classifies paid invoices by the paid date against the due date", () => {
    expect(outcome(inv("2026-09", "PAID", due, "2026-10-09 18:00:00"), "2026-11-10")).toEqual({ kind: "on-time" });
    expect(outcome(inv("2026-09", "PAID", due, "2026-10-13T08:00:00Z"), "2026-11-10")).toEqual({ kind: "late", daysLate: 4 });
    expect(outcome(inv("2026-09", "MARKED_AS_PAID", due, null), "2026-11-10")).toEqual({ kind: "on-time" });
  });

  it("classifies unpaid invoices as open until the due date, then overdue", () => {
    expect(outcome(inv("2026-09", "SENT", due), "2026-10-09")).toEqual({ kind: "open" });
    expect(outcome(inv("2026-09", "UNPAID", due), "2026-10-12")).toEqual({ kind: "overdue", daysOverdue: 3 });
  });

  it("treats never-sent and cancelled invoices as void", () => {
    expect(outcome(inv("2026-09", "DRAFT", due), "2026-11-10").kind).toBe("void");
    expect(outcome(inv("2026-09", "CANCELLED", due), "2026-11-10").kind).toBe("void");
  });
});

// Recording day: Nov 10. October bills are due on payday in November + 2 grace days.
const TODAY = "2026-11-10";

describe("tenantCollections", () => {
  it("reminds and flags a repeat late payer whose payday has passed (Daniel)", () => {
    const c = tenantCollections(
      {
        id: 3,
        name: "Daniel Kim",
        room: "103",
        paydayDay: 7,
        invoices: [
          inv("2026-08", "PAID", "2026-09-09", "2026-09-14"),
          inv("2026-09", "PAID", "2026-10-09", "2026-10-15"),
          inv("2026-10", "SENT", "2026-11-09"),
        ],
      },
      TODAY,
    );
    expect(c.current).toMatchObject({
      month: "2026-10",
      payday: "2026-11-07",
      paydayPassed: true,
      dueInDays: -1,
      unpaid: true,
    });
    expect(c.history).toEqual([
      { month: "2026-10", outcome: "overdue", days: 1 },
      { month: "2026-09", outcome: "late", days: 6 },
      { month: "2026-08", outcome: "late", days: 5 },
    ]);
    expect(c.lateCount).toBe(3);
    expect(c.repeatLatePayer).toBe(true);
    expect(c.suggestedAction).toBe("remind");
    expect(c.reason).toBe("Unpaid $300.00 bill for 2026-10 (RR-2026-10); payday 2026-11-07 has passed; overdue by 1 day.");
    expect(c.lateSummary).toBe("late 3 of the last 3 months");
  });

  it("waits for a tenant whose payday hasn't come yet (Lucas, 15th)", () => {
    const c = tenantCollections(
      { id: 5, name: "Lucas", room: "202", paydayDay: 15, invoices: [inv("2026-10", "SENT", "2026-11-17")] },
      TODAY,
    );
    expect(c.current).toMatchObject({ payday: "2026-11-15", paydayPassed: false, dueInDays: 7 });
    expect(c.history).toEqual([]); // the open invoice isn't decided yet
    expect(c.suggestedAction).toBe("wait");
    expect(c.reason).toBe("Unpaid $300.00 bill for 2026-10 (RR-2026-10), due 2026-11-17. Payday 2026-11-15 hasn't come yet, so wait.");
    expect(c.lateSummary).toBe("no payment history yet");
  });

  it("reminds on payday itself, before the due date", () => {
    const c = tenantCollections(
      { id: 4, name: "Priya", room: "201", paydayDay: 10, invoices: [inv("2026-10", "SENT", "2026-11-12")] },
      TODAY,
    );
    expect(c.current).toMatchObject({ paydayPassed: true, dueInDays: 2 });
    expect(c.suggestedAction).toBe("remind");
    expect(c.reason).toContain("payday 2026-11-10 has passed; due in 2 days (2026-11-12)");
  });

  it("needs nothing from a tenant who paid; one late month is not a pattern", () => {
    const c = tenantCollections(
      {
        id: 1,
        name: "Aarav",
        room: "101",
        paydayDay: 1,
        invoices: [
          inv("2026-08", "PAID", "2026-09-03", "2026-09-06"), // late once
          inv("2026-09", "PAID", "2026-10-03", "2026-10-02"),
          inv("2026-10", "PAID", "2026-11-03", "2026-11-01"),
        ],
      },
      TODAY,
    );
    expect(c.suggestedAction).toBe("none");
    expect(c.reason).toBe("Nothing owed: the latest bill (2026-10) is PAID.");
    expect(c.lateCount).toBe(1);
    expect(c.repeatLatePayer).toBe(false);
  });

  it("only looks at the last 3 decided months and ignores drafts and cancelled invoices", () => {
    const c = tenantCollections(
      {
        id: 2,
        name: "Sofia",
        room: "102",
        paydayDay: 5,
        invoices: [
          inv("2026-06", "PAID", "2026-07-07", "2026-07-20"), // late, but outside the window
          inv("2026-07", "PAID", "2026-08-07", "2026-08-20"), // late, inside the window
          inv("2026-08", "PAID", "2026-09-07", "2026-09-05"),
          inv("2026-09", "PAID", "2026-10-07", "2026-10-06"),
          inv("2026-10", "CANCELLED", "2026-11-07"),
          inv("2026-11", "DRAFT", "2026-12-07"),
        ],
      },
      TODAY,
    );
    expect(c.history.map((h) => h.month)).toEqual(["2026-09", "2026-08", "2026-07"]);
    expect(c.lateCount).toBe(1);
    expect(c.repeatLatePayer).toBe(false);
    expect(c.current?.month).toBe("2026-09"); // latest sent, not the draft or the cancelled one
  });

  it("handles a tenant with no invoices", () => {
    const c = tenantCollections({ id: 6, name: "Emma", room: "203", paydayDay: 28, invoices: [] }, TODAY);
    expect(c).toMatchObject({ current: null, history: [], lateCount: 0, repeatLatePayer: false, suggestedAction: "none" });
    expect(c.reason).toBe("No bill has been sent yet.");
  });
});

describe("weekRange", () => {
  it("is today through the next 6 days", () => {
    expect(weekRange("2026-11-28")).toEqual({ from: "2026-11-28", to: "2026-12-04" });
  });
});
