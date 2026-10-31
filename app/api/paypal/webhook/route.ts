// PayPal webhook: INVOICING.INVOICE.PAID (and CANCELLED) update the invoice row; /owner refreshes itself.
import { revalidatePath } from "next/cache";
import { defaultWebhookDeps, handlePayPalWebhook } from "@/lib/payments";

export async function POST(request: Request) {
  const rawBody = await request.text(); // raw, for signature verification
  try {
    const result = await handlePayPalWebhook(rawBody, request.headers, defaultWebhookDeps());
    console.log(`[paypal webhook] ${result.status} ${result.outcome}`);
    if (result.status === 200) revalidatePath("/owner");
    return Response.json({ outcome: result.outcome }, { status: result.status });
  } catch (err) {
    // e.g. PayPal API unreachable: a 5xx makes PayPal retry the delivery later.
    console.error("[paypal webhook] failed", err);
    return Response.json({ outcome: "error" }, { status: 500 });
  }
}
