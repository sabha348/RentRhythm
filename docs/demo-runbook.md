# Demo runbook: recording day (Nov 10)

The video follows the demo script in `CLAUDE.md` (under 3 minutes). This is the exact choreography against the live
app, https://rentrhythm.onrender.com, using the October bills (due in early November).

## How the story lands on Nov 10

| Tenant | Payday | October bill | State before recording | Role in the video |
|---|---|---|---|---|
| Aarav | 1st | $358, due Nov 3 | **Paid** (Nov 1) | Calendar: green |
| Sofia | 5th | $404, due Nov 7 | **Pay the evening before** | Calendar: green |
| Daniel | 7th | $422, due Nov 9 | Unpaid → **overdue** on Nov 10 | Agent reminds + flags him (late 3 of last 3 months); pays at the desk |
| Priya | 10th | $421, due Nov 12 | Unpaid, payday is today | The invoice scene: rent + meals + walk-ins + AC; pays live |
| Lucas | 15th | ~$439, due Nov 17 | **Send the evening before**, unpaid | Agent skips him: payday hasn't come |
| Emma | 28th | ~$232, due Nov 30 | **Send the evening before**, unpaid | Agent skips her: payday hasn't come |

Priya's bill is the only one with all four line types, so she carries the "one PayPal invoice → tenant pays → PAID"
scene. That leaves Daniel as the only tenant the agent reminds, while it visibly skips Lucas and Emma.

## The evening before (Nov 9)

1. Open https://rentrhythm.onrender.com and wait for it to wake (up to a minute).
2. **Bills** (`/owner`, October 2026): click **Send via PayPal** for **Lucas** and **Emma**.
3. **Pay Sofia's bill:** on her row click **Show pay QR**, scan it with your phone, log in as the **sandbox buyer**
   and pay. Check that her row turns **✓ Paid**.
4. Check **Calendar**: Aarav and Sofia green; Daniel, Priya, Lucas and Emma not yet green.
5. **Don't use the assistant** after this point. Gemini's free tier has a small daily cap; keep the quota for the
   take. (If you must rehearse, do it on Nov 9 only; the cap resets daily.)
6. Have ready: the sandbox buyer's email + password (developer.paypal.com → Testing Tools → Sandbox Accounts), a
   phone, and a second screen or tablet for the desk QR.

## Recording (Nov 10)

**Keep the app awake.** The free server sleeps after 15 idle minutes and wakes with fresh demo data (bills are
restored from PayPal; votes and walk-ins are not). Open the site 2–3 minutes before you start and record the meal
scene in one go.

### 0:00–0:20 · Problem
Home page hero, or a title card paraphrasing the PG owners' meeting: rent chased all month because salaries land on
different days; meals run out because non-voters eat anyway. No invented quotes.

### 0:20–0:40 · Payday-based due dates (Bryntum)
`/owner/calendar`, Month view, November. Point at the due dates spread across the month (3rd, 7th, 9th, 12th, 17th,
30th) and the colours: green paid, red overdue (Daniel, with ⚠), amber payday passed (Priya), blue not due. Click
**⚠ Daniel** to show "Overdue · payday 7th → due Nov 9 · late 3 of the last 3 months".

### 0:40–1:05 · Meal vote → headcount → walk-in
1. Phone: `/vote` → pick a tenant who hasn't voted for tomorrow (e.g. **Priya** or **Daniel**) → **Lunch ✅ Going**,
   **Dinner ❌ Not going**.
2. Laptop: `/cook`: tomorrow's **Lunch** count goes up by one within ~10 s, without reloading.
3. Today's **Lunch** card → **+ Walk-in** → choose **Emma** → she appears as a walk-in ($5, billed next month).

### 1:05–1:35 · One PayPal invoice → tenant pays → PAID live
1. `/owner` (October 2026) → **Preview bill** on **Priya**: Monthly rent + Meals (N voted) + Walk-in meals (N, not
   voted) + AC share.
2. Her row → **Show pay QR** → scan it with the phone → PayPal sandbox payer page → log in as the sandbox buyer →
   **Pay**. (Save Priya's desk screen for later if you prefer; the desk scene below uses Daniel.)
3. Back on `/owner`: within a few seconds her badge turns **✓ Paid**, via PayPal's webhook (the page refreshes itself).
   Optionally cut to the calendar: her event turned green too.

### 1:35–2:15 · ⭐ The collections assistant
`/owner/agent` → tap the suggestion **"Who's due this week? Remind anyone whose payday has passed."**

Expected (about 10–30 s): steps listed above the answer, e.g.
- ✓ Checked 6 tenants' paydays and invoices: 1 to remind, 1 repeat late payer
- ✓ Sent a PayPal reminder to Daniel Kim (RR-202610-T3-…)

…and an answer that reminds **Daniel**, skips **Lucas** (payday 15th) and **Emma** (payday 28th), and flags
**Daniel** as a repeat late payer. (Sandbox reminders don't reach a real inbox; the step list is the proof.)

If it says the Gemini quota is used up, stop: you can't fix that on the day. Re-record this scene the next day,
setting `DEMO_TODAY=2026-11-10` in Render's environment so the dates still match (see Resets).

### 2:15–2:30 · Pay at the desk
`/owner` → **Show pay QR** on **Daniel** → show the full-screen page on the tablet/second screen → scan it with the
phone camera → PayPal sandbox payer page → log in → pay → the desk screen flips to **"✓ Paid, thank you!"**.

### 2:30–2:50 · Impact + architecture
The architecture diagram from `README.md`: PayPal Invoicing + webhook, Agent Toolkit + Gemini, Bryntum Calendar, on
Render.

## Resets and fallbacks

- **Webhook slow?** `/owner` → **Sync from PayPal** pulls the latest status straight from PayPal.
- **Recording on another day:** in Render → Environment set `DEMO_TODAY=2026-11-10` and redeploy. The calendar and
  assistant use that date; meal voting always uses the real clock.
- **Votes / walk-ins messed up:** they reset whenever the server restarts (sleep or redeploy).
- **A payment take went wrong:** sandbox payments can't be undone. To start the bills over: in the sandbox business
  account (sandbox.paypal.com → Invoicing) **cancel** the `RR-202610-…` invoices, then redeploy on Render. The app
  only restores invoices that aren't cancelled, so October shows "Not sent" and you can send fresh ones.
- **Server asleep mid-take:** open any page, wait for it to wake, and restart the scene.
