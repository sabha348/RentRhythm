import Link from "next/link";
import { loadCalendar } from "@/lib/calendar-db";
import { STATE_COLORS } from "@/lib/calendar";
import OwnerCalendar from "./owner-calendar";

export const dynamic = "force-dynamic";

const LEGEND: [keyof typeof STATE_COLORS, string, string][] = [
  ["paid", "Paid", "#16a34a"],
  ["upcoming", "Not due yet", "#2563eb"],
  ["payday-passed", "Payday passed, unpaid", "#f59e0b"],
  ["overdue", "Overdue", "#dc2626"],
];

export default function CalendarPage() {
  const { today, resources, events } = loadCalendar();
  return (
    <main style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 32px)" }}>
      <p style={{ margin: "0 0 8px" }}>
        <Link href="/owner">← Owner dashboard</Link>
      </p>
      <h1 style={{ margin: "0 0 4px" }}>Due-date calendar</h1>
      <p style={{ margin: "0 0 10px", color: "#555", display: "flex", flexWrap: "wrap", gap: 14 }}>
        <span>Each bill is due on the tenant&apos;s own payday + grace days.</span>
        {LEGEND.map(([key, label, color]) => (
          <span key={key}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: color, marginRight: 5 }} />
            {label}
          </span>
        ))}
        <span>⚠ repeat late payer · 🍽 tomorrow&apos;s meals</span>
      </p>
      {/* Bryntum fills its parent, so the parent needs a real height. */}
      <div style={{ flex: 1, minHeight: 480 }}>
        <OwnerCalendar today={today} resources={resources} events={events} />
      </div>
    </main>
  );
}
