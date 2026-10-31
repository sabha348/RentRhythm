// Monthly invoice flow: DB data -> lib/billing -> PayPal invoice, saved in the invoices table.
import { randomBytes } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { type Bill, computeBill } from "./billing";
import { type DB, getDb, schema } from "./db";
import type { Invoice, Property, Tenant } from "./db/schema";
import { createDraftInvoice, getInvoice, type PayPalInvoice, sendInvoice } from "./paypal";

// Local-only status while the PayPal invoice is being created (row reserved, no PayPal ID yet).
export const CREATING = "CREATING";

export type BillPreview = { tenant: Tenant; property: Property; bill: Bill };

export function previewMonthlyBill(tenantId: number, month: string, db: DB = getDb()): BillPreview {
  const property = db.select().from(schema.properties).get();
  if (!property) throw new Error("No property found; run npm run seed");
  const tenant = db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).get();
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  const inMonth = (col: typeof schema.mealVotes.date | typeof schema.mealAttendance.date) => like(col, `${month}-%`);
  const bill = computeBill({
    month,
    property,
    tenant,
    votes: db
      .select()
      .from(schema.mealVotes)
      .where(and(eq(schema.mealVotes.tenantId, tenantId), inMonth(schema.mealVotes.date)))
      .all(),
    attendance: db
      .select()
      .from(schema.mealAttendance)
      .where(and(eq(schema.mealAttendance.tenantId, tenantId), inMonth(schema.mealAttendance.date)))
      .all(),
    utilities: db
      .select()
      .from(schema.utilityCharges)
      .where(and(eq(schema.utilityCharges.tenantId, tenantId), eq(schema.utilityCharges.month, month)))
      .all(),
  });
  return { tenant, property, bill };
}

function findInvoice(db: DB, tenantId: number, month: string): Invoice | undefined {
  return db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.tenantId, tenantId), eq(schema.invoices.month, month)))
    .get();
}

function updateInvoice(db: DB, id: number, values: Partial<Invoice>): Invoice {
  return db.update(schema.invoices).set(values).where(eq(schema.invoices.id, id)).returning().get();
}

// Unique per PayPal account even if the local DB is reset: RR-202609-T3-1A2B3C
function newInvoiceNumber(tenantId: number, month: string): string {
  return `RR-${month.replace("-", "")}-T${tenantId}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export type SendResult = {
  invoice: Invoice;
  paypal: PayPalInvoice;
  alreadySent: boolean; // true if an earlier call had already sent this tenant+month
};

/**
 * Creates and sends the PayPal invoice for one tenant's month. Idempotent per tenant+month:
 * the invoices row is reserved before calling PayPal (unique on tenant+month), and each step is
 * recorded, so repeat calls return the existing invoice and a failed call resumes where it stopped.
 */
export function sendMonthlyInvoice(tenantId: number, month: string, db: DB = getDb()): Promise<SendResult> {
  // Concurrent calls in this process (e.g. a double-clicked button) share one send. Across
  // processes, the reserved row's invoice number makes PayPal reject a duplicate create.
  const key = `${tenantId}|${month}`;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = doSendMonthlyInvoice(tenantId, month, db).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}

const inFlight = new Map<string, Promise<SendResult>>();

async function doSendMonthlyInvoice(tenantId: number, month: string, db: DB): Promise<SendResult> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`month must be YYYY-MM, got ${month}`);

  let row = findInvoice(db, tenantId, month);

  if (row && row.status !== CREATING && row.status !== "DRAFT") {
    // Already sent: refresh the status from PayPal and return it.
    const paypal = await getInvoice(row.paypalInvoiceId!);
    if (paypal.status !== row.status) row = updateInvoice(db, row.id, { status: paypal.status });
    return { invoice: row, paypal, alreadySent: true };
  }

  const { tenant, property, bill } = previewMonthlyBill(tenantId, month, db);

  if (!row) {
    // Reserve the tenant+month slot. A concurrent call hits the unique key and is rejected here.
    try {
      row = db
        .insert(schema.invoices)
        .values({
          tenantId,
          month,
          invoiceNumber: newInvoiceNumber(tenantId, month),
          status: CREATING,
          total: bill.total,
          dueDate: bill.dueDate,
        })
        .returning()
        .get();
    } catch (err) {
      if (String(err).includes("UNIQUE")) throw new Error(`Invoice for tenant ${tenantId} ${month} is already being sent`);
      throw err;
    }
  }

  if (!row.paypalInvoiceId) {
    const draft = await createDraftInvoice({
      invoiceNumber: row.invoiceNumber,
      recipientEmail: tenant.email,
      recipientName: tenant.name,
      businessName: property.name,
      currency: bill.currency,
      dueDate: bill.dueDate,
      note: `${property.name}: your bill for ${monthLabel(month)}, room ${tenant.room}. Due on your payday + ${property.graceDays} days.`,
      items: bill.lines.map(({ name, quantity, unitAmount }) => ({ name, quantity, unitAmount })),
    });
    row = updateInvoice(db, row.id, { paypalInvoiceId: draft.id, status: draft.status });
  }

  await sendInvoice(row.paypalInvoiceId!);
  const paypal = await getInvoice(row.paypalInvoiceId!);
  row = updateInvoice(db, row.id, { status: paypal.status, total: Number(paypal.amount?.value ?? row.total) });
  return { invoice: row, paypal, alreadySent: false };
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
