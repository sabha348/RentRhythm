// Send one tenant's monthly PayPal invoice and show what PayPal returned.
// Usage: npm run send-invoice -- <tenantId> <YYYY-MM>
import { previewMonthlyBill, sendMonthlyInvoice } from "../lib/invoicing";
import { PayPalError } from "../lib/paypal";

async function main() {
  const [tenantArg, month] = process.argv.slice(2);
  const tenantId = Number(tenantArg);
  if (!tenantId || !month) {
    console.error("Usage: npm run send-invoice -- <tenantId> <YYYY-MM>");
    process.exit(1);
  }

  const { tenant, bill } = previewMonthlyBill(tenantId, month);
  console.log(`Bill for ${tenant.name} (room ${tenant.room}), ${month}, due ${bill.dueDate}:`);
  console.table(bill.lines);
  console.log(`Total: ${bill.total.toFixed(2)} ${bill.currency}\n`);

  const { invoice, paypal, alreadySent } = await sendMonthlyInvoice(tenantId, month);
  console.log(alreadySent ? "Already sent earlier; nothing new was created.\n" : "Sent via PayPal.\n");
  console.log("PayPal returned:");
  console.table(
    paypal.items?.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit_amount.value })),
  );
  console.log({
    paypalInvoiceId: paypal.id,
    invoiceNumber: paypal.detail.invoice_number,
    status: paypal.status,
    total: `${paypal.amount?.value} ${paypal.amount?.currency_code}`,
    dueDate: paypal.detail.payment_term?.due_date,
    payerLink: paypal.detail.metadata?.recipient_view_url,
    dbRow: { id: invoice.id, status: invoice.status, total: invoice.total },
  });
}

main().catch((err) => {
  if (err instanceof PayPalError) console.error(err.message, JSON.stringify(err.body, null, 2));
  else console.error(err);
  process.exit(1);
});
