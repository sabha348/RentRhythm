// Smoke test for lib/paypal.ts: create + send a 3-line sandbox invoice, then save its QR.
// Usage: npm run smoke:invoice
import {
  createDraftInvoice,
  getInvoice,
  PayPalError,
  saveInvoiceQr,
  sendInvoice,
} from "../lib/paypal";

async function main() {
  const dueDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const draft = await createDraftInvoice({
    invoiceNumber: `SMOKE-${Date.now()}`,
    recipientEmail: process.env.PAYPAL_BUYER_EMAIL!,
    recipientName: "Smoke Test",
    businessName: "Sunrise Co-Living",
    currency: "USD",
    dueDate,
    note: "RentRhythm smoke test invoice",
    items: [
      { name: "Monthly rent", quantity: 1, unitAmount: 200 },
      { name: "Meals (12 voted)", quantity: 12, unitAmount: 3 },
      { name: "AC share", quantity: 1, unitAmount: 15 },
    ],
  });
  console.log(`Created draft ${draft.id} (${draft.status})`);

  await sendInvoice(draft.id);
  const invoice = await getInvoice(draft.id);
  const qrPath = await saveInvoiceQr(invoice.id);

  console.log({
    id: invoice.id,
    invoiceNumber: invoice.detail.invoice_number,
    status: invoice.status,
    total: `${invoice.amount?.value} ${invoice.amount?.currency_code}`,
    dueDate: invoice.detail.payment_term?.due_date,
    items: invoice.items?.map((i) => `${i.name}: ${i.quantity} × ${i.unit_amount.value}`),
    payerLink: invoice.detail.metadata?.recipient_view_url,
    qrPath,
  });
}

main().catch((err) => {
  if (err instanceof PayPalError) console.error(err.message, JSON.stringify(err.body, null, 2));
  else console.error(err);
  process.exit(1);
});
