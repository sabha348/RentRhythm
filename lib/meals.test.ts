import { describe, expect, it } from "vitest";
import { addDays, headcount, localDate, localTime, servingList, votingWindow } from "./meals";

const IST = "Asia/Kolkata"; // UTC+5:30

describe("local date and time", () => {
  it("uses the property's timezone, not the server's", () => {
    const now = new Date("2026-10-31T20:00:00Z"); // 01:30 on Nov 1 in India
    expect(localDate(now, IST)).toBe("2026-11-01");
    expect(localTime(now, IST)).toBe("01:30");
    expect(localDate(now, "America/New_York")).toBe("2026-10-31");
  });

  it("formats midnight as 00:00", () => {
    expect(localTime(new Date("2026-10-31T18:30:00Z"), IST)).toBe("00:00");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("votingWindow", () => {
  it("is open for tomorrow before the cutoff", () => {
    const w = votingWindow(new Date("2026-10-31T15:29:00Z"), IST, "21:00"); // 20:59 IST
    expect(w).toEqual({ today: "2026-10-31", tomorrow: "2026-11-01", open: true, cutoff: "21:00" });
  });

  it("closes at the cutoff", () => {
    expect(votingWindow(new Date("2026-10-31T15:30:00Z"), IST, "21:00").open).toBe(false); // 21:00 IST
  });

  it("reopens after midnight for the next day", () => {
    const w = votingWindow(new Date("2026-10-31T18:31:00Z"), IST, "21:00"); // 00:01 IST Nov 1
    expect(w).toMatchObject({ today: "2026-11-01", tomorrow: "2026-11-02", open: true });
  });
});

const tenants = [
  { id: 1, name: "Aarav", room: "101" },
  { id: 2, name: "Sofia", room: "102" },
  { id: 3, name: "Daniel", room: "103" },
  { id: 4, name: "Priya", room: "201" },
];
const D = "2026-11-01";

describe("headcount", () => {
  it("splits tenants into going, not going and not voted per meal", () => {
    const votes = [
      { tenantId: 1, date: D, meal: "lunch" as const, going: true },
      { tenantId: 1, date: D, meal: "dinner" as const, going: false },
      { tenantId: 2, date: D, meal: "lunch" as const, going: true },
      { tenantId: 3, date: "2026-10-31", meal: "lunch" as const, going: true }, // another day
    ];
    const hc = headcount(tenants, votes, D);
    expect(hc.lunch.going.map((p) => p.name)).toEqual(["Aarav", "Sofia"]);
    expect(hc.lunch.notVoted.map((p) => p.name)).toEqual(["Daniel", "Priya"]);
    expect(hc.dinner.notGoing.map((p) => p.name)).toEqual(["Aarav"]);
    expect(hc.dinner.notVoted).toHaveLength(3);
  });
});

describe("servingList", () => {
  const votes = [
    { tenantId: 1, date: D, meal: "lunch" as const, going: true },
    { tenantId: 2, date: D, meal: "lunch" as const, going: true },
    { tenantId: 3, date: D, meal: "lunch" as const, going: false },
  ];

  it("pre-ticks voters and lists everyone else as possible walk-ins", () => {
    const list = servingList(tenants, votes, [], D, "lunch");
    expect(list.voters.map((r) => [r.name, r.ate, r.logged])).toEqual([
      ["Aarav", true, false],
      ["Sofia", true, false],
    ]);
    expect(list.walkIns).toEqual([]);
    expect(list.others.map((p) => p.name)).toEqual(["Daniel", "Priya"]);
  });

  it("reflects logged no-shows and walk-ins (including voted-not-going who ate)", () => {
    const attendance = [
      { tenantId: 2, date: D, meal: "lunch" as const, ate: false }, // voter no-show
      { tenantId: 3, date: D, meal: "lunch" as const, ate: true }, // voted not going, ate
      { tenantId: 4, date: D, meal: "dinner" as const, ate: true }, // other meal
    ];
    const list = servingList(tenants, votes, attendance, D, "lunch");
    expect(list.voters.find((r) => r.name === "Sofia")).toMatchObject({ ate: false, logged: true });
    expect(list.walkIns.map((r) => r.name)).toEqual(["Daniel"]);
    expect(list.others.map((p) => p.name)).toEqual(["Priya"]);
  });
});
