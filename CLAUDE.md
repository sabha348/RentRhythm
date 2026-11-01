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
- **Don't set `invoicer.email_address`.** If it doesn't match the account that owns the API credentials, send fails with `USER_NOT_FOUND` (422). Omitted, PayPal invoices as the credentials' account. `PAYPAL_BUSINESS_EMAIL` is therefore informational only.
- **Gemini free tier has a small per-day request cap per model** (hit on Oct 31 after ~a dozen agent runs; each run is one request per step). The 429 says `GenerateRequestsPerDayPerProjectPerModel-FreeTier` with a retry delay of hours, so `runAgent` uses `maxRetries: 1` (the SDK would otherwise wait out that delay) plus a `timeout`.
- Webhook signature verification (`/v1/notifications/verify-webhook-signature`) must embed the **raw** body, not re-serialized JSON. PayPal answers 4xx (not `FAILURE`) when the transmission headers are malformed; treat that as "not genuine" (401), and only let 5xx/network errors become a 500 so PayPal retries.
- The webhook handler trusts PayPal's API, not the payload: it re-fetches the invoice for status and `payments.transactions[].payment_date`. Event IDs go in `webhook_events` so redeliveries apply once.
- In React effects, don't return `el.scrollIntoView(...)` from an arrow: newer Chromium returns a Promise and React crashes with "destroy is not a function".
- **Hosting: Render free web service, not Vercel.** Vercel is serverless, so a SQLite file isn't shared between requests (webhook writes and page reads would hit different copies). Render free runs one long-lived instance, but its disk is wiped on sleep (15 min idle) and redeploys: `npm run start:render` runs `seed --if-empty`, which reseeds a fresh disk and **rebuilds real invoice records from PayPal** by invoice number (`RR-YYYYMM-T<id>-…`).
- In the Claude Code cloud container, Node's built-in `fetch` ignores `HTTPS_PROXY`; run scripts with `NODE_USE_ENV_PROXY=1` there. Not needed locally or on Render.

## Rules
- **PayPal SANDBOX only** (`https://api-m.sandbox.paypal.com`).
- Never commit or print secrets. Read from env vars. Keep `.env` and `output/` gitignored; maintain `.env.example`.
- Agent may use only invoice tools: list, get, send reminder, generate QR, plus **read-only** tools over our own DB (e.g. `get_collections_overview`). **Never enable money-moving tools** (payouts, refunds, captures).
- Pin dependency versions exactly.
- Build only what the demo video shows (see below). Keep scope tight.
- Commit after each working step with clear messages.

## Environment variables
```
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_BUSINESS_EMAIL
PAYPAL_BUYER_EMAIL
PAYPAL_WEBHOOK_ID      # from `npm run register-webhook -- https://<app>/api/paypal/webhook`
GOOGLE_GENERATIVE_AI_API_KEY
GEMINI_MODEL=gemini-3.6-flash
DEMO_TODAY=            # optional YYYY-MM-DD: pins "today" for collections/agent rehearsals
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
- **Property:** name, currency (USD), mealPriceVoted (3.00), mealPriceWalkIn (5.00), graceDays (2), timezone (Asia/Kolkata), voteCutoff (21:00)
- **Tenant:** name, email, room, monthlyRent, paydayDay (1–31), active
- **MealVote:** tenantId, date, meal (lunch|dinner), going (bool)
- **MealAttendance:** tenantId, date, meal, ate (bool)
- **UtilityCharge:** tenantId, month (YYYY-MM), label, amount
- **Invoice:** tenantId, month, paypalInvoiceId, invoiceNumber, status, total, dueDate, paidAt (for late-payer flags), source (`paypal` = real sandbox invoice, `seed` = demo payment history), createdAt; unique on (tenantId, month)

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
Property "Sunrise Co-Living"; 6 tenants with paydays 1st, 5th, 7th, 10th, 15th, 28th and rents $180–$260; meal votes/attendance from the start of 3 months ago (or `SEED_MONTH`) through yesterday in the property timezone: 2 reliable voters, 2 forgetful walk-ins, 1 votes-but-skips, 1 rarely eats in; today has votes only (cook logs attendance); reliable voters + votes-but-skips have voted for tomorrow; AC charges for 4 tenants each month. Paid invoice history (`source = 'seed'`) for the 2 months before last month: Daniel paid 5–6 days late both times, Lucas late once, everyone else on time. Real invoice records (`source = 'paypal'`) are kept across reseeds (matched by tenant name); `SEED_RESET_INVOICES=1` drops them. `DATABASE_PATH` overrides the DB file.

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

## Current phase: Build step 3 (owner agent chat + `INVOICING.INVOICE.PAID` webhook, Nov 3–5)
Decisions: webhook reaches the app via an early basic Render deploy (accept SQLite resets on the free tier for now; reseed on start); agent gets one extra read-only tool over our DB; past invoice history is seeded and marked `source = 'seed'` (no PayPal invoice behind it), with Daniel the repeat late payer; chat is request/response showing each tool step.
Work in this order, stopping after each to report:

1. ✅ `lib/collections.ts` (pure, tested): per tenant, the current invoice's payday (passed?), due date, status, days overdue; late history (paid after due date, or unpaid past it); repeat late payer = late in ≥2 of the last 3 decided months. Invoice `source` column; seed 2 past months of paid history (Daniel late both times). Agent "today" in property timezone; `DEMO_TODAY=YYYY-MM-DD` overrides it for rehearsals.
2. ✅ (live chat-UI run pending Gemini quota) `/owner/agent` chat: read-only `get_collections_overview` tool + the 4 PayPal tools; reminders only for unpaid invoices in our DB; suggested prompt; shows each tool step; friendly 429/503. Test the demo prompt against the sandbox.
3. ✅ `app/api/paypal/webhook`: verify signature (`PAYPAL_WEBHOOK_ID`), `INVOICING.INVOICE.PAID` → status + `paidAt`, idempotent; `scripts/register-webhook.ts`; `/owner` auto-refresh + "Sync from PayPal" fallback. Tests with sample payloads.
4. Basic Render deploy + live test: owner pays an invoice as the sandbox buyer; `/owner` turns PAID live.

### Done: Build step 2 (meal voting + cook headcount)
Decisions: tenants pick their name (no login); voting for tomorrow closes at 21:00 in the property's timezone (default `Asia/Kolkata`); cook's serving log pre-ticks voters (untick no-shows) and adds walk-ins.

1. ✅ Property `timezone` + `voteCutoff`; `lib/meals.ts` (pure, tested): today/tomorrow in the property timezone, voting open/closed, tomorrow's headcount, today's serving list. DB helpers to cast votes and log attendance. Seed: history through yesterday, today's votes, some votes for tomorrow.
2. ✅ `/vote` (name picker) → `/vote/[tenantId]`: tomorrow's Lunch ✅/❌ and Dinner ✅/❌, current vote, price incentive, closes-at / closed state. Mobile-first.
3. ✅ `/cook`: tomorrow's headcount per meal (going + names, not voted); today's serving log per meal (voters pre-ticked, "+ Walk-in"). Logged walk-ins appear in `/owner` bill previews.
4. ✅ End-to-end browser check with screenshots: vote → headcount changes → walk-in logged → bill preview gains the walk-in.

Out of scope: logins, menus, voting more than one day ahead, notifications.

### Done: Phase 0 (fresh setup) and Build step 1 (foundation)

0a. ✅ Scaffold the Next.js + TypeScript app with pinned versions. Add `.gitignore` (`.env`, `data/`, `output/`, `node_modules/`), `.env.example` with empty values, an MIT `LICENSE`, and a short README stub.
0b. ✅ Connectivity check: get a PayPal sandbox OAuth token and make one tiny Gemini call. If either fails, stop and report which domain is blocked.
0c. ✅ `lib/paypal.ts`: OAuth token, create DRAFT invoice (Invoicing v2), send it, get it, generate its QR code (multipart parsing per gotchas). Add `scripts/smoke-invoice.ts` that creates and sends a 3-line test invoice and prints the invoice ID, status, total and payer link (`detail.metadata.recipient_view_url`). Check PayPal's current Invoicing v2 docs for the exact schema. Run it.
0d. ✅ `lib/agent.ts` + `scripts/agent.ts "<request>"`: Gemini + toolkit (only list/get/reminder/QR tools, `sandbox: true`), print each tool call and the final answer. Test: "List my unpaid invoices" and "Send a friendly reminder for invoice <ID>".

Then Build step 1:
1. ✅ Schema + seed; run the seed.
2. ✅ `lib/billing.ts` + tests (walk-ins, voted-but-absent, zero meals, payday clamping, rounding); run tests.
3. ✅ `sendMonthlyInvoice`: send ONE tenant's real sandbox invoice; show the line items PayPal returned.
4. ✅ `/owner` page: tenant table (payday, due date, bill status for selected month) with "Preview bill" and "Send via PayPal" buttons. Function over looks.

Update the "Current phase" section of this file as phases complete.

Run locally: `npm run seed` (or `SEED_MONTH=2026-10 npm run seed`), `npm run dev`, open `/owner`. Also: `npm test`, `npm run send-invoice -- <tenantId> <YYYY-MM>`, `npm run agent -- "<request>"`, `npm run smoke:invoice`.
