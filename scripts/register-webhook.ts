// Registers (or finds) the PayPal sandbox webhook for this app and prints its ID for PAYPAL_WEBHOOK_ID.
// Usage: npm run register-webhook -- https://<your-app>/api/paypal/webhook
import { getAccessToken, PAYPAL_API_BASE } from "../lib/paypal";
import { HANDLED_EVENTS } from "../lib/payments";

async function main() {
  const url = process.argv[2];
  if (!url?.startsWith("https://") || !url.endsWith("/api/paypal/webhook")) {
    console.error("Usage: npm run register-webhook -- https://<your-app>/api/paypal/webhook (PayPal requires HTTPS)");
    process.exit(1);
  }
  const headers = { Authorization: `Bearer ${await getAccessToken()}`, "Content-Type": "application/json" };

  const existing = (await (await fetch(`${PAYPAL_API_BASE}/v1/notifications/webhooks`, { headers })).json()) as {
    webhooks?: { id: string; url: string; event_types: { name: string }[] }[];
  };
  const found = existing.webhooks?.find((w) => w.url === url);
  if (found) {
    console.log(`Already registered: ${found.id} for ${found.event_types.map((e) => e.name).join(", ")}`);
    console.log(`Set PAYPAL_WEBHOOK_ID=${found.id}`);
    return;
  }

  const res = await fetch(`${PAYPAL_API_BASE}/v1/notifications/webhooks`, {
    method: "POST",
    headers,
    body: JSON.stringify({ url, event_types: HANDLED_EVENTS.map((name) => ({ name })) }),
  });
  const body = (await res.json()) as { id?: string; message?: string; details?: unknown };
  if (!res.ok || !body.id) {
    console.error(`PayPal refused (${res.status}): ${body.message}`, JSON.stringify(body.details ?? ""));
    process.exit(1);
  }
  console.log(`Registered webhook ${body.id} → ${url}`);
  console.log(`Set PAYPAL_WEBHOOK_ID=${body.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
