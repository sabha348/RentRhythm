import { getDb, schema } from "@/lib/db";
import { MEALS } from "@/lib/db/schema";
import { dayLabel, timeLabel } from "@/lib/format";
import { headcount, servingList } from "@/lib/meals";
import { getVotingWindow, loadDay } from "@/lib/meals-db";
import { AutoRefresh } from "@/components/auto-refresh";
import { ServingLog } from "./serving-log";

export const metadata = { title: "Kitchen" };

export const dynamic = "force-dynamic";

const LABELS = { lunch: "Lunch", dinner: "Dinner" } as const;

export default function CookPage() {
  const property = getDb().select().from(schema.properties).get();
  if (!property) return <p>No property yet. Run <code>npm run seed</code>.</p>;

  const window = getVotingWindow();
  const tomorrowData = loadDay(window.tomorrow);
  const counts = headcount(tomorrowData.tenants, tomorrowData.votes, window.tomorrow);
  const todayData = loadDay(window.today);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto" }}>
      <AutoRefresh seconds={10} />
      <h1>Kitchen</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {property.name} · tomorrow&apos;s headcount from tenants&apos; votes, and today&apos;s serving log.
      </p>

      <h2 style={{ marginBottom: 4 }}>Tomorrow: {dayLabel(window.tomorrow)}</h2>
      <p style={{ marginTop: 0, color: window.open ? "#b45309" : "#15803d" }}>
        {window.open
          ? `Voting is open until ${timeLabel(window.cutoff)}, so these numbers can still change.`
          : `Voting closed at ${timeLabel(window.cutoff)}. These numbers are final.`}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {MEALS.map((meal) => {
          const c = counts[meal];
          return (
            <section key={meal} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--surface)" }}>
              <h3 style={{ margin: 0 }}>{LABELS[meal]}</h3>
              <p style={{ fontSize: 44, fontWeight: 700, margin: "4px 0" }} data-testid={`headcount-${meal}`}>
                {c.going.length}
                <span style={{ fontSize: 16, fontWeight: 400, color: "#555" }}> going</span>
              </p>
              <p style={{ margin: "0 0 6px" }}>{c.going.map((p) => p.name).join(", ") || "No one yet"}</p>
              {c.notVoted.length > 0 && (
                <p style={{ margin: 0, color: "#b45309" }}>
                  ⚠️ {c.notVoted.length} haven&apos;t voted: {c.notVoted.map((p) => p.name).join(", ")}
                </p>
              )}
              {c.notGoing.length > 0 && (
                <p style={{ margin: "4px 0 0", color: "#666" }}>Skipping: {c.notGoing.map((p) => p.name).join(", ")}</p>
              )}
            </section>
          );
        })}
      </div>

      <h2 style={{ marginBottom: 4 }}>Today: {dayLabel(window.today)}</h2>
      <p style={{ marginTop: 0, color: "#555" }}>Log who ate. Walk-ins go on that tenant&apos;s monthly bill.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        {MEALS.map((meal) => (
          <ServingLog
            key={meal}
            date={window.today}
            meal={meal}
            label={LABELS[meal]}
            list={servingList(todayData.tenants, todayData.votes, todayData.attendance, window.today, meal)}
          />
        ))}
      </div>
    </main>
  );
}
