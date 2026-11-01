// Desk payment: look up a RentRhythm invoice by its number for the full-screen QR page.
import { eq } from "drizzle-orm";
import { PAID_STATUSES, UNPAID_STATUSES } from "./collections";
import { type DB, getDb, schema } from "./db";

export type DeskInvoice = {
  invoiceNumber: string;
  paypalInvoiceId: string;
  tenantName: string;
  room: string;
  month: string;
  total: number;
  dueDate: string;
  state: "unpaid" | "paid" | "other";
  paidAt: string | null;
  propertyName: string;
  currency: string;
};

/** A real (PayPal) invoice by number, or null. Seeded history has no PayPal invoice to pay. */
export function findDeskInvoice(invoiceNumber: string, db: DB = getDb()): DeskInvoice | null {
  const row = db.select().from(schema.invoices).where(eq(schema.invoices.invoiceNumber, invoiceNumber)).get();
  if (!row?.paypalInvoiceId || row.source !== "paypal") return null;
  const tenant = db.select().from(schema.tenants).where(eq(schema.tenants.id, row.tenantId)).get();
  const property = db.select().from(schema.properties).get();
  return {
    invoiceNumber: row.invoiceNumber,
    paypalInvoiceId: row.paypalInvoiceId,
    tenantName: tenant?.name ?? "Tenant",
    room: tenant?.room ?? "",
    month: row.month,
    total: row.total,
    dueDate: row.dueDate,
    state: PAID_STATUSES.includes(row.status) ? "paid" : UNPAID_STATUSES.includes(row.status) ? "unpaid" : "other",
    paidAt: row.paidAt,
    propertyName: property?.name ?? "",
    currency: property?.currency ?? "USD",
  };
}
