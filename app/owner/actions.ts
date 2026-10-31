"use server";

import { revalidatePath } from "next/cache";
import { sendMonthlyInvoice } from "@/lib/invoicing";
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
