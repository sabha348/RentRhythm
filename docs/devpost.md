# Devpost submission draft

Copy each section into the matching Devpost field. Replace the bracketed placeholders before submitting.

---

**Project name:** RentRhythm

**Tagline (short description):** Rent that follows payday, meals that follow votes: one PayPal invoice per tenant,
and an AI assistant that chases only the people who should already have the money.

**Links**
- Live demo: https://rentrhythm.onrender.com (PayPal sandbox; the free server can take up to a minute to wake)
- Code: https://github.com/sabha348/RentRhythm (MIT)
- Video: [YouTube link]

---

## Inspiration

I met owners of paying-guest (PG) houses in India, shared homes where tenants rent a room and eat from a common
kitchen. Two problems came up again and again.

**Rent.** Tenants get paid on different days, so owners give everyone until the 15th and still spend the month
chasing. It was their biggest concern.

**Meals.** Most tenants never say whether they'll eat tomorrow. People who didn't vote eat anyway, food runs out
for the ones who did, and the cook has to cook again.

The same problems exist in co-living spaces, hostels and student housing everywhere, wherever incomes arrive on
different days and a kitchen cooks for a group. I wanted to fix both with the tools owners and tenants already
trust: a PayPal invoice and a phone.

## What it does

- **Payday-synced due dates.** Each tenant's bill is due on their own payday the following month, plus two grace
  days, not one fixed date. A Bryntum calendar shows every due date coloured paid, not yet due, payday passed or
  overdue, and marks repeat late payers.
- **One smart monthly PayPal invoice** per tenant: rent, the meals they voted for, walk-in meals, and their share of
  the AC, sent through PayPal Invoicing. When the tenant pays, PayPal's webhook turns the bill **Paid** on the
  owner's screen within seconds.
- **Meal voting with an incentive.** Tenants vote Lunch ✅/❌ and Dinner ✅/❌ for tomorrow on their phone until 9 PM.
  A voted meal costs $3; eating without voting is a $5 walk-in. The kitchen sees tomorrow's headcount, who hasn't
  voted, and logs today's walk-ins, which land on that tenant's bill automatically.
- **An AI collections assistant.** The owner types *"Who's due this week? Remind anyone whose payday has passed."*
  The assistant checks every tenant's payday and invoice, sends PayPal reminders only to tenants whose payday has
  passed, explains who it skipped and why, and flags repeat late payers. Every step it takes is shown.
- **Pay at the desk.** For tenants used to paying in person, any unpaid bill opens as a full-screen PayPal QR code.
  The tenant scans it, pays on their phone, and the screen switches to "Paid, thank you!".

## How I built it

- **Next.js 16 (App Router) + TypeScript**, with **SQLite** via Drizzle ORM, hosted on **Render**.
- **PayPal Invoicing v2** for the monthly bills (created as drafts, then sent; one per tenant per month, safe to
  retry), **invoice QR codes** for desk payments, and the **`INVOICING.INVOICE.PAID` webhook**. The webhook is
  verified with PayPal's signature-verification API, re-reads the invoice from PayPal instead of trusting the
  payload, and applies each event only once.
- **The billing rules are pure, unit-tested functions**: meal counts, walk-ins, payday clamping (a payday on the
  31st becomes the 28th in February), and rounding that matches PayPal's own maths to the cent. 46 tests in total.
- **Bryntum Calendar** for the owner's due-date view, with live updates when a payment lands.
- **The AI assistant** is described below.

## How I used AI (tools and models)

**In the product**
- **Google Gemini (`gemini-3.6-flash`)** through the **Vercel AI SDK** runs the collections assistant. It plans the
  steps (look up, decide, act), writes short, polite reminder notes, and summarises what it did for the owner.
- **PayPal Agent Toolkit** gives Gemini PayPal Invoicing tools. I enabled exactly four: list invoices, get an
  invoice, send a reminder, and generate a QR code. **No tool that moves money** (payouts, refunds, captures) is
  available to the model. The toolkit targets an older version of the AI SDK, so I wrote a small adapter that
  re-wraps each tool for the current one and logs every call.
- **One read-only tool over the app's own data** gives the model each tenant's payday, latest invoice and payment
  history. Plain code works out who is due, overdue or a repeat late payer (late in two of the last three months)
  and adds a plain-language summary; the model decides what to do and how to say it, quoting those facts rather
  than recalculating dates and amounts itself.
- **Guardrails:** a reminder only goes out if RentRhythm itself sent that invoice and PayPal still shows it unpaid.
  Each assistant request has a time limit, and if Gemini's free tier hits its daily limit, the owner gets a clear
  message while the rest of the app keeps working.

**In building it**
- I built RentRhythm with **Claude Code** (Anthropic) as a pair programmer: scaffolding, the PayPal and Gemini
  integrations, tests, debugging and documentation, reviewed and steered step by step.

## Challenges I ran into

- **The sandbox buyer.** Invoices to my first sandbox buyer kept failing with `INR_FOREIGN_CURRENCY_BLOCKED`,
  because it was registered in India, where PayPal no longer supports domestic payments. A US sandbox buyer fixed
  it, and it's why RentRhythm is pitched for shared housing globally rather than India only.
- **Two AI SDK generations.** The PayPal Agent Toolkit builds tools for an older AI SDK, so wiring it to the
  current one needed an adapter, plus repointing it at PayPal's current sandbox host.
- **Free hosting with a database.** Render's free tier wipes the disk whenever the server sleeps. On startup, the
  app rebuilds its real invoice records straight from PayPal, using invoice numbers that encode the month and
  tenant, so nothing real is lost.
- **A 5 MB calendar.** Bundling Bryntum's trial build ran the build out of memory (over 13 GB). Loading it at
  runtime instead brought the build down to under 1 GB.
- **Free-tier AI limits.** Gemini's free tier caps requests per day, and the SDK's automatic retries would wait out
  a multi-hour delay. I capped retries, added time limits and made the assistant say clearly when it's out of
  quota.

## Accomplishments that I'm proud of

- The whole loop runs end to end on real PayPal sandbox APIs: a bill built from meal votes, sent as a PayPal
  invoice, paid by the tenant, and marked Paid live by the webhook, on the calendar and at the desk.
- The assistant is useful and safe: it chases only people whose payday has passed, explains whom it skipped, and
  cannot move money.
- It's a complete product for three kinds of user: the owner, the tenant on a phone, and the cook in the kitchen.

## What I learned

- Let code compute facts and let the model handle judgement and language. Handing Gemini pre-computed "who is due
  and why" made its answers consistently accurate.
- Webhooks are the source of truth only if you verify them and re-read the resource from the API.
- Varying bills and individual due dates are a better fit for invoices than subscriptions.

## What's next for RentRhythm

- Tenant logins and an owner account, with several properties per owner.
- Reminders on WhatsApp and SMS, scheduled for each tenant's payday.
- Meal menus and dietary preferences; more utilities split by usage.
- Going live with production PayPal for owners outside India.

## Built with

`paypal-invoicing` · `paypal-agent-toolkit` · `paypal-webhooks` · `google-gemini` · `vercel-ai-sdk` ·
`bryntum-calendar` · `next.js` · `react` · `typescript` · `sqlite` · `drizzle-orm` · `render` · `vitest`
