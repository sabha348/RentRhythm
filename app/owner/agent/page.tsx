import Link from "next/link";
import { getDb, schema } from "@/lib/db";
import { collectionsToday } from "@/lib/clock";
import { dayLabel } from "@/lib/format";
import { Chat } from "./chat";

export const dynamic = "force-dynamic";

export default function AgentPage() {
  const property = getDb().select().from(schema.properties).get();
  if (!property) return <p>No property yet. Run <code>npm run seed</code>.</p>;
  const today = collectionsToday(property.timezone);

  return (
    <main style={{ maxWidth: 760, margin: "0 auto" }}>
      <p style={{ margin: 0 }}>
        <Link href="/owner">← Owner dashboard</Link>
      </p>
      <h1 style={{ marginBottom: 4 }}>Collections assistant</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        {property.name} · {dayLabel(today)}
        {process.env.DEMO_TODAY && " (demo date)"}. Ask in plain English. The assistant checks paydays and PayPal
        invoices, sends reminders only to tenants whose payday has passed, and flags repeat late payers.
      </p>
      <Chat />
    </main>
  );
}
