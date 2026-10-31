import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { dayLabel, money, timeLabel } from "@/lib/format";
import { getVotingWindow, tenantVotes } from "@/lib/meals-db";
import { VoteForm } from "./vote-form";

export const dynamic = "force-dynamic";

export default async function TenantVotePage({ params }: { params: Promise<{ tenantId: string }> }) {
  const tenantId = Number((await params).tenantId);
  const db = getDb();
  const property = db.select().from(schema.properties).get();
  const tenant = Number.isInteger(tenantId)
    ? db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).get()
    : undefined;
  if (!property || !tenant?.active) notFound();

  const window = getVotingWindow();
  const votes = Object.fromEntries(tenantVotes(tenant.id, window.tomorrow).map((v) => [v.meal, v.going]));
  const saving = money(property.mealPriceWalkIn - property.mealPriceVoted);

  return (
    <main style={{ maxWidth: 480, margin: "0 auto" }}>
      <p style={{ margin: 0 }}>
        <Link href="/vote">← Not {tenant.name.split(" ")[0]}?</Link>
      </p>
      <h1 style={{ marginBottom: 4 }}>Hi {tenant.name.split(" ")[0]} 👋</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Will you eat at {property.name} on <strong>{dayLabel(window.tomorrow)}</strong>?
      </p>

      <VoteForm tenantId={tenant.id} date={window.tomorrow} initialVotes={votes} open={window.open} />

      <div style={{ marginTop: 20, padding: 12, borderRadius: 10, background: "#f3f7f3", fontSize: 15 }}>
        Vote and pay <strong>{money(property.mealPriceVoted)}</strong> a meal. Eat without voting and it&apos;s a
        walk-in at <strong>{money(property.mealPriceWalkIn)}</strong>. Voting saves you {saving} and tells the cook how
        much to make.
      </div>
      <p style={{ color: "#666", fontSize: 14 }}>
        {window.open
          ? `Voting for tomorrow closes at ${timeLabel(window.cutoff)} tonight. You can change your vote until then.`
          : `Voting for tomorrow closed at ${timeLabel(window.cutoff)}. You can still eat as a walk-in.`}
      </p>
    </main>
  );
}
