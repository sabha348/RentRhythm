// Keeps our invoice rows in step with PayPal: the PAID webhook and the owner's "Sync from PayPal".
import { and, eq, inArray } from "drizzle-orm";
import { UNPAID_STATUSES } from "./collections";
import { type DB, getDb, schema } from "./db";
import type { Invoice } from "./db/schema";
import { getInvoice, type PayPalInvoice, verifyWebhookSignature } from "./paypal";

export const HANDLED_EVENTS = ["INVOICING.INVOICE.PAID", "INVOICING.INVOICE.CANCELLED"];

/** When the invoice was paid, per PayPal (latest payment date), else now. */
function paidAtFrom(invoice: PayPalInvoice, now: Date): string {
  const dates = (invoice.payments?.transactions ?? []).map((t) => t.payment_date).filter(Boolean) as string[];
  const latest = dates.sort().at(-1);
  return latest ? latest.replace("T", " ").replace(/Z$/, "").slice(0, 19) : now.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Copies PayPal's status (and paid date) onto our row for that invoice. Returns the updated row,
 * or null if the invoice isn't one RentRhythm sent.
 */
export function applyPayPalInvoice(db: DB, invoice: PayPalInvoice, now = new Date()): { row: Invoice; changed: boolean } | null {
  const row = db.select().from(schema.invoices).where(eq(schema.invoices.paypalInvoiceId, invoice.id)).get();
  if (!row) return null;
  const paid = invoice.status === "PAID" || invoice.status === "MARKED_AS_PAID";
  const paidAt = paid ? (row.paidAt ?? paidAtFrom(invoice, now)) : row.paidAt;
  if (row.status === invoice.status && row.paidAt === paidAt) return { row, changed: false };
  const updated = db
    .update(schema.invoices)
    .set({ status: invoice.status, paidAt })
    .where(eq(schema.invoices.id, row.id))
    .returning()
    .get();
  return { row: updated, changed: true };
}

export type WebhookDeps = {
  db: DB;
  webhookId: string | undefined;
  verify: (headers: Headers, rawBody: string, webhookId: string) => Promise<boolean>;
  fetchInvoice: (id: string) => Promise<PayPalInvoice>;
  now?: Date;
};

export type WebhookResult = { status: number; outcome: string };

/**
 * Handles one PayPal webhook delivery. 2xx tells PayPal to stop retrying, so only return an
 * error when a retry could help (PayPal unreachable) or the request is not genuine.
 */
export async function handlePayPalWebhook(rawBody: string, headers: Headers, deps: WebhookDeps): Promise<WebhookResult> {
  if (!deps.webhookId) return { status: 500, outcome: "PAYPAL_WEBHOOK_ID is not configured" };

  let event: { id?: string; event_type?: string; resource?: { id?: string; invoice?: { id?: string } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, outcome: "body is not JSON" };
  }
  if (!event.id || !event.event_type) return { status: 400, outcome: "not a PayPal event" };

  if (!(await deps.verify(headers, rawBody, deps.webhookId))) return { status: 401, outcome: "signature verification failed" };

  const { db } = deps;
  const seen = db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.id, event.id)).get();
  if (seen) return { status: 200, outcome: `duplicate of ${event.id} (${seen.outcome})` };

  // Invoicing v2 events carry the invoice as the resource; older versions nest it under "invoice".
  const invoiceId = event.resource?.invoice?.id ?? event.resource?.id;
  let outcome: string;
  if (!HANDLED_EVENTS.includes(event.event_type)) {
    outcome = `ignored ${event.event_type}`;
  } else if (!invoiceId) {
    outcome = "no invoice ID in event";
  } else {
    // Trust PayPal's API, not the payload, for the current status and payment date.
    const invoice = await deps.fetchInvoice(invoiceId);
    const applied = applyPayPalInvoice(db, invoice, deps.now);
    outcome = !applied
      ? `invoice ${invoiceId} was not sent by RentRhythm`
      : applied.changed
        ? `${applied.row.invoiceNumber} → ${applied.row.status}`
        : `${applied.row.invoiceNumber} already ${applied.row.status}`;
  }

  db.insert(schema.webhookEvents)
    .values({ id: event.id, eventType: event.event_type, resourceId: invoiceId ?? null, outcome })
    .onConflictDoNothing()
    .run();
  return { status: 200, outcome };
}

export function defaultWebhookDeps(): WebhookDeps {
  return {
    db: getDb(),
    webhookId: process.env.PAYPAL_WEBHOOK_ID,
    verify: verifyWebhookSignature,
    fetchInvoice: getInvoice,
  };
}

/** Owner's fallback if a webhook is missed: re-read every unpaid RentRhythm invoice from PayPal. */
export async function syncUnpaidInvoices(db: DB = getDb()): Promise<{ checked: number; updated: string[] }> {
  const rows = db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.source, "paypal"), inArray(schema.invoices.status, UNPAID_STATUSES)))
    .all();
  const updated: string[] = [];
  for (const row of rows) {
    if (!row.paypalInvoiceId) continue;
    const applied = applyPayPalInvoice(db, await getInvoice(row.paypalInvoiceId));
    if (applied?.changed) updated.push(`${applied.row.invoiceNumber} → ${applied.row.status}`);
  }
  return { checked: rows.length, updated };
}
