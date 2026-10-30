# RentRhythm

Rent and meal billing for co-living spaces, hostels and student housing, built on
PayPal Invoicing and an AI collections agent (Gemini + PayPal Agent Toolkit).

- **Payday-synced due dates:** each tenant's invoice is due on their own payday, plus grace days.
- **One monthly PayPal invoice:** rent + meals eaten + walk-in meals + utilities.
- **Meal voting:** voters pay the normal rate, walk-ins pay more, and the cook sees tomorrow's headcount.
- **AI collections agent:** the owner asks in plain English and the agent reminds the right tenants.

> Work in progress for the PayPal AI Hackathon. Uses the PayPal **sandbox** only.

## Run locally

```bash
npm install
cp .env.example .env   # fill in your PayPal sandbox and Gemini keys
npm run dev
```

## License

MIT
