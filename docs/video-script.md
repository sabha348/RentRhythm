# Demo video: narration script and recording guide

Final video: **under 3 minutes**: the app on the left, your face in a panel on the right, captions of your
narration along the bottom. **You record only your face and voice** (one clip per scene). Claude records every
screen moment on the live app, including the two payments (made as the sandbox buyer in a phone-sized browser,
with PayPal's real webhook turning the bill Paid), times the footage to your clips, and assembles the video.

## What to record: seven narration clips (`scene1.mp4` … `scene7.mp4`)

- Landscape, 1280×720 or 1920×1080, 30 fps. Your phone or laptop camera is fine.
- Head and shoulders, centred in the middle third of the frame (the panel is cropped from the centre), plain
  background, light in front of you (not a window behind you).
- Quiet room; a headset or earphone mic sounds better than the laptop mic.
- One clip per scene. **Wait one second before you start speaking and after you finish.** Retakes are fine; send
  the best take of each.
- Speak at a relaxed pace; each scene has a target length, and within ±5 seconds is fine. Stay close to the
  script (captions follow what you actually say).
- Reading from a screen just below the camera is fine; glance at the lens now and then.

Upload the seven clips here when done.

## Narration script

### Scene 1 · The problem (~20 s)
> I met owners of paying-guest houses in India. Rent was their biggest headache: tenants get paid on different
> days, so owners chase rent all month. And most tenants never say whether they'll eat tomorrow, so food runs out
> and the cook cooks twice. Shared housing everywhere has the same problem.

*On screen: title card, then the RentRhythm home page.*

### Scene 2 · Payday-based due dates (~20 s)
> This is RentRhythm. Every tenant's bill is due on their own payday, plus two grace days: Aarav on the third,
> Daniel on the ninth, Emma on the thirtieth. Green is paid, red is overdue, and this warning sign marks Daniel.
> He's been late three months running.

*On screen: the Bryntum calendar, November; Daniel's details open.*

### Scene 3 · Meal voting and the kitchen (~25 s)
> Tenants vote for tomorrow's meals from their phone. A voted meal costs three dollars; eating without voting is
> a five-dollar walk-in. Priya votes lunch yes, dinner no, and the kitchen's headcount updates by itself. If someone
> eats without voting, the cook logs a walk-in, and it goes straight onto their bill.

*On screen: phone-size voting page → kitchen headcount going up → walk-in added.*

### Scene 4 · One PayPal invoice, paid live (~30 s)
> At month end, each tenant gets one PayPal invoice: rent, the meals they voted for, walk-ins, and their share of
> the AC. Here's Priya's. She pays it with PayPal, and as soon as PayPal's webhook arrives, her bill turns paid,
> here and on the calendar. Nobody marks anything by hand.

*On screen: Priya's bill preview → PayPal checkout at phone size → her badge turns ✓ Paid.*

### Scene 5 · The collections assistant (~40 s)
> Now the part owners hate: chasing. I just ask: "Who's due this week? Remind anyone whose payday has passed."
> The assistant runs on Gemini with the PayPal Agent Toolkit. It checks every tenant's payday and invoice, sends a
> PayPal reminder only to Daniel, whose payday has passed, skips Lucas and Emma because their paydays haven't
> come yet, and flags Daniel as a repeat late payer. It can read invoices and send reminders, but it can't move money.

*On screen: the assistant page; the suggested prompt; the steps and the answer appearing.*

### Scene 6 · Pay at the desk (~15 s)
> Some tenants still prefer to pay in person. At the desk, I show Daniel his bill as a PayPal QR code. He scans it,
> pays on his phone, and the screen says thank you.

*On screen: Daniel's desk QR → PayPal checkout at phone size → the desk screen flips to "Paid, thank you!".*

### Scene 7 · How it's built (~20 s)
> RentRhythm is built on PayPal Invoicing and webhooks, the PayPal Agent Toolkit with Gemini, and a Bryntum
> calendar. Owners stop chasing, tenants pay on payday, and the kitchen cooks for the people who'll actually eat.
> It's open source and live. The links are below.

*On screen: architecture card with the live URL and GitHub link.*

## Layout

1920×1080 canvas: the app on the left (about three-quarters of the width), your video in a panel on the right
(no name or role tags), a short scene title at the top, and captions of your narration along the bottom. No
music, so nothing copyrighted.
