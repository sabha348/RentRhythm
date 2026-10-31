import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { dayLabel } from "@/lib/format";
import { getVotingWindow } from "@/lib/meals-db";

export const dynamic = "force-dynamic";

export default function VotePickerPage() {
  const db = getDb();
  const property = db.select().from(schema.properties).get();
  if (!property) return <p>No property yet. Run <code>npm run seed</code>.</p>;
  const tenants = db.select().from(schema.tenants).where(eq(schema.tenants.active, true)).all();
  const { tomorrow } = getVotingWindow();

  return (
    <main style={{ maxWidth: 480, margin: "0 auto" }}>
      <p style={{ color: "#666", margin: 0 }}>{property.name}</p>
      <h1 style={{ marginTop: 4 }}>Meals for {dayLabel(tomorrow)}</h1>
      <p>Who are you?</p>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {tenants.map((t) => (
          <li key={t.id}>
            <Link
              href={`/vote/${t.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "14px 16px",
                border: "1px solid #ccc",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
                fontSize: 18,
              }}
            >
              <span>{t.name}</span>
              <span style={{ color: "#888" }}>Room {t.room}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
