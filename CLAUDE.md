# RentRhythm — project context for Claude Code

Entry for the **PayPal AI Hackathon** (Devpost: https://paypalaihackathon.devpost.com/).
Solo builder. Submission deadline: **Nov 12, 2026, 12:00 PM PST (Nov 13, 1:30 AM IST)**.
Target submission date: **Nov 11** (one day of buffer).

## The idea

A management app for co-living spaces, hostels and student housing (origin story: Indian PGs).

**Problem (from a meeting with PG owners in India):**
- Rent comes in whenever tenants' salaries do, so owners give everyone until the 15th and still chase people all month. Rent was the owners' biggest concern.
- Most tenants don't vote on whether they'll eat lunch/dinner tomorrow. Non-voters eat anyway, food runs out for those who voted, and the cook has to cook again.

**Solution:**
1. **Payday-synced due dates** — each tenant's invoice is due on their own payday (+ grace days), not one fixed date.
2. **One smart monthly PayPal invoice** — rent + meals actually voted and eaten + walk-in meals + AC/utility share.
3. **Meal voting with an incentive** — voters pay the normal rate; non-voters who eat pay a higher walk-in rate. Cook sees tomorrow's headcount.
4. **AI collections agent** — the owner types plain English ("Who's due this week? Remind anyone whose payday has passed") and the agent checks invoices, reminds only the right tenants, and flags repeat late payers.
5. **Desk payment via invoice QR code** — bridges tenants used to paying in person.
6. **Owner calendar (Bryntum)** — tenants' due dates + tomorrow's meal headcount.

**Pitch market:** global co-living/hostel/student housing. PayPal stopped domestic payments in India in 2021, so do NOT pitch this as an India-only PayPal product.

## Why these choices
- **PayPal Invoicing, not Subscriptions:** the bill varies monthly (meals), and each tenant needs their own due date. Invoices support variable line items and per-invoice due dates.
- **Bryntum** is a genuine fit (calendar of due dates) and a sponsor prize safety net (3 × $1,000 winners).
- **Prize targets:** main prizes + Most Impactful / Best Use of PayPal + AI; sponsor: Bryntum (Render hosting is a secondary shot). A project can win one main prize OR one honorable mention, plus one sponsor prize.

## Judging criteria (equal weight)
Technological implementation (non-trivial PayPal + AI use) · Design (complete product, not a PoC) · Potential impact (specific real problem/audience) · Innovation · Presentation (video <3 min).

## Submission requirements
- Working demo: hosted URL or complete run instructions (mockups don't count). Must stay working and free for judges until **Dec 15, 2026**.
- Public GitHub repo with an open-source license (MIT) visible in the About section.
- YouTube demo video under 3 minutes, public, no copyrighted music.
- Description listing the AI tools/models used and how.

## Validated earlier (Oct 27–28, on a local machine; that code is NOT in this repo)
The approach was proven with throwaway scripts that no longer exist. The repo starts fresh; rebuild these capabilities inside the app (Phase 0).
- PayPal Invoicing v2: created, sent and paid a 3-line sandbox invoice ($200 rent + 12 × $3 meals + $15 AC = $251). Status went to PAID.
- Gemini + `@paypal/agent-toolkit` agent: listed unpaid invoices, sent a reminder, and generated an invoice QR code.

## Known gotchas (learned during validation)
- `@paypal/agent-toolkit` **1.11.0** builds tools for AI SDK v4; the current `ai` (v7) expects a different tool format. Write a small adapter that re-wraps each toolkit tool for the current AI SDK (and logs each call). Read the toolkit source in node_modules to get this right.
- Toolkit **defaults to production** unless `context: { sandbox: true }` is set. Always set it.
- Toolkit hard-codes the legacy host `api.sandbox.paypal.com`; `lib/agent.ts` repoints `toolkit.client._baseUrl` to `api-m.sandbox.paypal.com` (the other host is blocked in the cloud sandbox).
- Gemini: default model is `gemini-3.6-flash` (from the `GEMINI_MODEL` env var). `gemini-3.8-flash` returned repeated 503 overload errors on the free tier. Handle 429/503 gracefully with a friendly message.
- PayPal sends **no content** on a successful invoice reminder; empty result = success.
- Invoice QR endpoint returns a **multipart** body wrapping a base64 PNG. Parse only the text between the blank line and the closing boundary. Never pass base64 to the model; save to a file and give it the path.
- Reminders only work on **unpaid** invoices.
- Invoice numbers must be unique per PayPal account.
- The sandbox has one buyer account, so all seeded tenants use `PAYPAL_BUYER_EMAIL`.
- Paying invoices is done by the human in a browser (sandbox buyer login); code can't do it.
- **Sending to an India-registered sandbox buyer fails** with `INR_FOREIGN_CURRENCY_BLOCKED` (406), even with a US billing address on the invoice. `PAYPAL_BUYER_EMAIL` must be a sandbox **personal** account created with country = United States.
- In the Claude Code cloud container, Node's built-in `fetch` ignores `HTTPS_PROXY`; run scripts with `NODE_USE_ENV_PROXY=1` there. Not needed locally or on Render.

## Rules
- **PayPal SANDBOX only** (`https://api-m.sandbox.paypal.com`).
- Never commit or print secrets. Read from env vars. Keep `.env` and `output/` gitignored; maintain `.env.example`.
- Agent may use only invoice tools: list, get, send reminder, generate QR (later: create/send invoice via our own code). **Never enable money-moving tools** (payouts, refunds, captures).
- Pin dependency versions exactly.
- Build only what the demo video shows (see below). Keep scope tight.
- Commit after each working step with clear messages.

## Environment variables
```
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_BUSINESS_EMAIL
PAYPAL_BUYER_EMAIL
GOOGLE_GENERATIVE_AI_API_KEY
GEMINI_MODEL=gemini-3.6-flash
```

## Tech stack
- Next.js (App Router) + TypeScript
- Drizzle ORM + SQLite (better-sqlite3), DB file in `data/` (gitignored)
- Vitest for tests
- Vercel AI SDK + `@ai-sdk/google` + `@paypal/agent-toolkit`
- Shared PayPal code in `lib/paypal.ts` (OAuth token, create/send/get invoice, generate QR); everything else imports from it
- Agent code in `lib/agent.ts` (Gemini model + toolkit adapter + system prompt)
- Bryntum Calendar (45-day trial) — later phase
- Deploy on Render (later phase)

## Data model
- **Property:** name, currency (USD), mealPriceVoted (3.00), mealPriceWalkIn (5.00), graceDays (2)
- **Tenant:** name, email, room, monthlyRent, paydayDay (1–31), active
- **MealVote:** tenantId, date, meal (lunch|dinner), going (bool)
- **MealAttendance:** tenantId, date, meal, ate (bool)
- **UtilityCharge:** tenantId, month (YYYY-MM), label, amount
- **Invoice:** tenantId, month, paypalInvoiceId, invoiceNumber, status, total, dueDate, paidAt (for late-payer flags), createdAt; unique on (tenantId, month)

## Billing rules (`lib/billing.ts`, pure functions, unit-tested)
Line items:
1. Monthly rent
2. "Meals (N voted)" at voted price — voted AND ate
3. "Walk-in meals (N, not voted)" at walk-in price — ate without voting (omit if 0)
4. Each utility charge for the month

- **Voted but didn't eat → charged at voted price** (food was cooked for them). Easy-to-change rule; keep a comment.
- dueDate = payday in the month AFTER the billed month + graceDays (the bill is sent when the billed month ends); clamp payday to that month's last day.
- Line amount = quantity × unit price rounded to cents (matches PayPal's own math).
- Totals rounded to 2 decimals.
- `sendMonthlyInvoice(tenantId, month)` is idempotent per tenant+month.

## Seed data (`npm run seed`, resets DB)
Property "Sunrise Co-Living"; 6 tenants with paydays 1st, 5th, 7th, 10th, 15th, 28th and rents $180–$260; one full previous month of meal votes/attendance: 2 reliable voters, 2 forgetful walk-ins, 1 votes-but-skips, 1 rarely eats in; AC charges for 4 tenants.

## Demo video script (anything not shown here doesn't get built)
| Time | Scene |
|---|---|
| 0:00–0:20 | Problem: on-screen paraphrase of the PG owners' meeting (rent chasing tied to salary dates; meal waste from non-voters). No invented quotes. |
| 0:20–0:40 | Owner calendar (Bryntum): each tenant's payday-based due date |
| 0:40–1:05 | Tenant votes Lunch ✅ Dinner ❌; cook sees tomorrow's headcount; walk-in logged |
| 1:05–1:35 | Month end: one PayPal invoice (rent + meals + walk-ins + AC); tenant pays; status turns PAID live via webhook |
| 1:35–2:15 | ⭐ Owner asks the agent: "Who's due this week? Remind anyone whose payday has passed." Agent reminds the right tenants, flags a repeat late payer |
| 2:15–2:30 | Tenant scans invoice QR at the desk |
| 2:30–2:50 | Impact + architecture: PayPal Invoicing + Agent Toolkit + Gemini + Bryntum |

## Build plan
| Dates | Build |
|---|---|
| Oct 28–30 (catching up) | Data model, seed, billing logic + tests, monthly invoice sending, minimal /owner page |
| Oct 31–Nov 2 | Meal voting page + cook headcount view |
| Nov 3–5 | Owner agent chat + `INVOICING.INVOICE.PAID` webhook |
| Nov 6–7 | Bryntum calendar |
| Nov 8–9 | UI polish, deploy to Render, README |
| Nov 10 | Record video |
| Nov 11 | Submit |

## Current phase: Phase 0 (fresh setup) then Build step 1 (foundation)
The repo is empty apart from this file. Work in this order, stopping after each to report:

0a. ✅ Scaffold the Next.js + TypeScript app with pinned versions. Add `.gitignore` (`.env`, `data/`, `output/`, `node_modules/`), `.env.example` with empty values, an MIT `LICENSE`, and a short README stub.
0b. ✅ Connectivity check: get a PayPal sandbox OAuth token and make one tiny Gemini call. If either fails, stop and report which domain is blocked.
0c. ✅ `lib/paypal.ts`: OAuth token, create DRAFT invoice (Invoicing v2), send it, get it, generate its QR code (multipart parsing per gotchas). Add `scripts/smoke-invoice.ts` that creates and sends a 3-line test invoice and prints the invoice ID, status, total and payer link (`detail.metadata.recipient_view_url`). Check PayPal's current Invoicing v2 docs for the exact schema. Run it.
0d. ✅ `lib/agent.ts` + `scripts/agent.ts "<request>"`: Gemini + toolkit (only list/get/reminder/QR tools, `sandbox: true`), print each tool call and the final answer. Test: "List my unpaid invoices" and "Send a friendly reminder for invoice <ID>".

Then Build step 1:
1. ✅ Schema + seed; run the seed.
2. ✅ `lib/billing.ts` + tests (walk-ins, voted-but-absent, zero meals, payday clamping, rounding); run tests.
3. `sendMonthlyInvoice`: send ONE tenant's real sandbox invoice; show the line items PayPal returned.
4. `/owner` page: tenant table (payday, due date, bill status for selected month) with "Preview bill" and "Send via PayPal" buttons. Function over looks.

Update the "Current phase" section of this file as phases complete.
