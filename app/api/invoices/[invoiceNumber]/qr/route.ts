// PayPal's pay-by-QR image for one RentRhythm invoice, proxied so nothing is written to disk.
import { findDeskInvoice } from "@/lib/desk";
import { generateInvoiceQrPng } from "@/lib/paypal";

export async function GET(_request: Request, ctx: { params: Promise<{ invoiceNumber: string }> }) {
  const invoice = findDeskInvoice((await ctx.params).invoiceNumber);
  if (!invoice) return new Response("Not found", { status: 404 });
  try {
    const png = await generateInvoiceQrPng(invoice.paypalInvoiceId, 500); // PayPal rejects sizes above 500
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=600" },
    });
  } catch (err) {
    console.error("[desk qr] failed", err);
    return new Response("Couldn't get the QR code from PayPal", { status: 502 });
  }
}
