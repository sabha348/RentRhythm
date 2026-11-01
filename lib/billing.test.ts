import { describe, expect, it } from "vitest";
import { type BillingInput, computeBill, dueDateFor, round2 } from "./billing";

const base: BillingInput = {
  month: "2026-09",
  property: { currency: "USD", mealPriceVoted: 3, mealPriceWalkIn: 5, graceDays: 2 },
  tenant: { monthlyRent: 200, paydayDay: 7 },
  votes: [],
  attendance: [],
  utilities: [],
};

const lunch = (date: string) => ({ date, meal: "lunch" as const });
const dinner = (date: string) => ({ date, meal: "dinner" as const });

describe("computeBill", () => {
  it("reproduces the validated $251 invoice: rent + 12 voted meals + AC", () => {
    const days = Array.from({ length: 6 }, (_, i) => `2026-09-0${i + 1}`);
    const slots = days.flatMap((d) => [lunch(d), dinner(d)]);
    const bill = computeBill({
      ...base,
      votes: slots.map((s) => ({ ...s, going: true })),
      attendance: slots.map((s) => ({ ...s, ate: true })),
      utilities: [{ label: "AC share", amount: 15 }],
    });
    expect(bill.lines).toEqual([
      { name: "Monthly rent", quantity: 1, unitAmount: 200, amount: 200 },
      { name: "Meals (12 voted)", quantity: 12, unitAmount: 3, amount: 36 },
      { name: "AC share", quantity: 1, unitAmount: 15, amount: 15 },
    ]);
    expect(bill.total).toBe(251);
  });

  it("charges walk-ins (ate without a going vote) at the walk-in price", () => {
    const bill = computeBill({
      ...base,
      votes: [
        { ...lunch("2026-09-01"), going: true },
        { ...dinner("2026-09-01"), going: false }, // voted not going, then ate anyway
      ],
      attendance: [
        { ...lunch("2026-09-01"), ate: true },
        { ...dinner("2026-09-01"), ate: true },
        { ...lunch("2026-09-02"), ate: true }, // never voted
        { ...dinner("2026-09-02"), ate: false },
      ],
    });
    expect(bill.meals).toEqual({ votedAte: 1, votedAbsent: 0, walkIns: 2 });
    expect(bill.lines.map((l) => [l.name, l.amount])).toEqual([
      ["Monthly rent", 200],
      ["Meals (1 voted)", 3],
      ["Walk-in meals (2, not voted)", 10],
    ]);
    expect(bill.total).toBe(213);
  });

  it("charges voted-but-absent meals at the voted price", () => {
    const bill = computeBill({
      ...base,
      votes: [
        { ...lunch("2026-09-03"), going: true },
        { ...dinner("2026-09-03"), going: true },
        { ...lunch("2026-09-04"), going: true },
      ],
      // Only one attendance row says they ate; a missing row counts as not eaten.
      attendance: [
        { ...lunch("2026-09-03"), ate: true },
        { ...dinner("2026-09-03"), ate: false },
      ],
    });
    expect(bill.meals).toEqual({ votedAte: 1, votedAbsent: 2, walkIns: 0 });
    expect(bill.lines[1]).toEqual({ name: "Meals (3 voted)", quantity: 3, unitAmount: 3, amount: 9 });
    expect(bill.total).toBe(209);
  });

  it("bills rent only when there are no meals or utilities", () => {
    const bill = computeBill({
      ...base,
      votes: [{ ...lunch("2026-09-05"), going: false }],
      attendance: [{ ...lunch("2026-09-05"), ate: false }],
    });
    expect(bill.lines).toEqual([{ name: "Monthly rent", quantity: 1, unitAmount: 200, amount: 200 }]);
    expect(bill.total).toBe(200);
    expect(bill.meals).toEqual({ votedAte: 0, votedAbsent: 0, walkIns: 0 });
  });

  it("ignores votes and attendance outside the billed month", () => {
    const bill = computeBill({
      ...base,
      votes: [{ ...lunch("2026-08-31"), going: true }],
      attendance: [
        { ...lunch("2026-08-31"), ate: true },
        { ...lunch("2026-10-01"), ate: true },
      ],
    });
    expect(bill.lines).toHaveLength(1);
  });

  it("adds one line per utility charge", () => {
    const bill = computeBill({
      ...base,
      utilities: [
        { label: "AC share", amount: 15 },
        { label: "Laundry", amount: 4.5 },
      ],
    });
    expect(bill.lines.map((l) => l.name)).toEqual(["Monthly rent", "AC share", "Laundry"]);
    expect(bill.total).toBe(219.5);
  });

  it("rounds line amounts and totals to 2 decimals", () => {
    const bill = computeBill({
      ...base,
      property: { ...base.property, mealPriceVoted: 2.675 },
      tenant: { ...base.tenant, monthlyRent: 199.999 },
      votes: [1, 2, 3].map((d) => ({ ...lunch(`2026-09-0${d}`), going: true })),
      attendance: [1, 2, 3].map((d) => ({ ...lunch(`2026-09-0${d}`), ate: true })),
      utilities: [
        { label: "AC share", amount: 0.1 },
        { label: "Water", amount: 0.2 },
      ],
    });
    // Unit price rounds first (2.675 -> 2.68), then 3 × 2.68 = 8.04, matching PayPal's own math.
    expect(bill.lines[1]).toMatchObject({ unitAmount: 2.68, amount: 8.04 });
    expect(bill.lines.map((l) => l.amount)).toEqual([200, 8.04, 0.1, 0.2]);
    expect(bill.total).toBe(208.34); // not 208.33999999999997
  });
});

describe("dueDateFor", () => {
  it("is the payday in the following month plus grace days", () => {
    expect(dueDateFor("2026-09", 7, 2)).toBe("2026-10-09");
    expect(dueDateFor("2026-09", 1, 2)).toBe("2026-10-03");
  });

  it("clamps the payday to the last day of a short month", () => {
    expect(dueDateFor("2027-01", 31, 0)).toBe("2027-02-28");
    expect(dueDateFor("2028-01", 30, 0)).toBe("2028-02-29"); // leap year
    expect(dueDateFor("2026-10", 31, 0)).toBe("2026-11-30");
  });

  it("rolls grace days into the next month and year", () => {
    expect(dueDateFor("2026-09", 30, 2)).toBe("2026-11-01");
    expect(dueDateFor("2026-11", 31, 2)).toBe("2027-01-02");
    expect(dueDateFor("2027-01", 31, 2)).toBe("2027-03-02"); // clamp to Feb 28, then +2
  });
});

describe("round2", () => {
  it("rounds half up at the cent", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(8.025)).toBe(8.03);
    expect(round2(-0)).toBe(0);
    expect(round2(0.1 + 0.2 - 0.3)).toBe(0); // 5.55e-17
    expect(round2(1234567.891)).toBe(1234567.89);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
