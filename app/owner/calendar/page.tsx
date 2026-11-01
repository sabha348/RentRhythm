import Link from "next/link";
import OwnerCalendar from "./owner-calendar";

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return (
    <main style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 32px)" }}>
      <p style={{ margin: "0 0 8px" }}>
        <Link href="/owner">← Owner dashboard</Link>
      </p>
      <h1 style={{ margin: "0 0 12px" }}>Due-date calendar</h1>
      {/* Bryntum fills its parent, so the parent needs a real height. */}
      <div style={{ flex: 1, minHeight: 480 }}>
        <OwnerCalendar />
      </div>
    </main>
  );
}
