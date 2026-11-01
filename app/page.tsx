import Link from "next/link";

const TOUR = [
  { href: "/owner/calendar", title: "Due-date calendar", text: "Every tenant's bill falls due on their own payday, not one fixed date. Colours show paid, upcoming, payday passed and overdue." },
  { href: "/vote", title: "Vote for tomorrow's meals", text: "Tenants tap Lunch ✅ / Dinner ❌ on their phone. Voting costs $3 a meal; eating without voting is a $5 walk-in." },
  { href: "/cook", title: "Kitchen", text: "The cook sees tomorrow's headcount and who hasn't voted, and logs today's walk-ins." },
  { href: "/owner", title: "Monthly bills", text: "One PayPal invoice per tenant: rent + meals eaten + walk-ins + AC share. Status turns PAID live from PayPal's webhook." },
  { href: "/owner/agent", title: "Collections assistant", text: "Ask “Who's due this week? Remind anyone whose payday has passed.” Gemini + the PayPal Agent Toolkit remind only the right tenants and flag repeat late payers." },
  { href: "/owner", title: "Pay at the desk", text: "Open any unpaid bill's “Show pay QR”: the tenant scans it and pays with PayPal on their phone; the screen flips to Paid." },
];

export default function Home() {
  return (
    <main>
      <section style={{ padding: "16px 0 8px" }}>
        <p className="muted" style={{ margin: 0, fontWeight: 600, letterSpacing: "0.03em" }}>
          FOR CO-LIVING SPACES, HOSTELS AND STUDENT HOUSING
        </p>
        <h1 style={{ fontSize: "2.2rem", margin: "6px 0 10px" }}>Rent that follows payday. Meals that follow votes.</h1>
        <p style={{ fontSize: "1.1rem", maxWidth: 760, margin: 0 }}>
          Owners we spoke to give every tenant until the 15th and still chase rent all month, because salaries land on
          different days. And most tenants never say whether they&apos;ll eat tomorrow, so food runs out and the cook
          cooks twice. RentRhythm bills each tenant on their own payday with one PayPal invoice, rewards meal voting,
          and lets an AI assistant do the chasing.
        </p>
      </section>

      <h2>Start here</h2>
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {TOUR.map((step, i) => (
          <li key={step.title} className="card">
            <Link href={step.href} style={{ fontWeight: 700, fontSize: "1.05rem", textDecoration: "none" }}>
              {i + 1}. {step.title} →
            </Link>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              {step.text}
            </p>
          </li>
        ))}
      </ol>

      <h2>Good to know</h2>
      <ul className="muted" style={{ margin: 0, paddingLeft: 20 }}>
        <li>Runs on PayPal&apos;s <strong>sandbox</strong>: no real money moves. Demo data is for &ldquo;Sunrise Co-Living&rdquo; with six tenants.</li>
        <li>Hosted on a free server that sleeps when idle: the first page can take up to a minute to wake up.</li>
        <li>The assistant uses Gemini&apos;s free tier; if its daily limit is reached it says so, and the rest of the app keeps working.</li>
        <li>
          Built with PayPal Invoicing + webhooks, the PayPal Agent Toolkit, Google Gemini (via the Vercel AI SDK) and
          Bryntum Calendar.
        </li>
      </ul>
    </main>
  );
}
