"use server";

import { revalidatePath } from "next/cache";
import { sendMonthlyInvoice } from "@/lib/invoicing";
import { syncUnpaidInvoices } from "@/lib/payments";
import { PayPalError } from "@/lib/paypal";

export type SendActionResult =
  | { ok: true; message: string; payerLink?: string }
  | { ok: false; message: string };

export async function sendInvoiceAction(tenantId: number, month: string): Promise<SendActionResult> {
  try {
    const { paypal, alreadySent } = await sendMonthlyInvoice(tenantId, month);
    revalidatePath("/owner");
    return {
      ok: true,
      message: alreadySent
        ? `Already sent (${paypal.detail.invoice_number}, ${paypal.status}).`
        : `Sent ${paypal.detail.invoice_number} for $${paypal.amount?.value}.`,
      payerLink: paypal.detail.metadata?.recipient_view_url,
    };
  } catch (err) {
    console.error("sendInvoiceAction failed", err);
    revalidatePath("/owner");
    return { ok: false, message: err instanceof PayPalError || err instanceof Error ? err.message : "Send failed" };
  }
}

/** Fallback if a webhook was missed: re-read unpaid invoices from PayPal. */
export async function syncAction(): Promise<string> {
  try {
    const { checked, updated } = await syncUnpaidInvoices();
    revalidatePath("/owner");
    return updated.length ? `Updated: ${updated.join(", ")}` : `Checked ${checked} unpaid invoices: no changes.`;
  } catch (err) {
    console.error("syncAction failed", err);
    return "Couldn't reach PayPal. Try again in a moment.";
  }
}
