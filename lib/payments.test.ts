import { beforeEach, describe, expect, it, vi } from "vitest";
import { type DB, openDb, schema } from "./db";
import type { PayPalInvoice } from "./paypal";
import { applyPayPalInvoice, handlePayPalWebhook, type WebhookDeps } from "./payments";

let db: DB;

beforeEach(() => {
  db = openDb(":memory:");
  db.insert(schema.properties).values({ name: "Test" }).run();
  db.insert(schema.tenants)
    .values({ name: "Daniel Kim", email: "d@example.com", room: "103", monthlyRent: 200, paydayDay: 7 })
    .run();
  db.insert(schema.invoices)
    .values({
      tenantId: 1,
      month: "2026-10",
      paypalInvoiceId: "INV2-AAAA",
      invoiceNumber: "RR-202610-T1-X",
      status: "SENT",
      total: 422,
      dueDate: "2026-11-09",
    })
    .run();
});

const paypalInvoice = (status: string, paymentDate?: string): PayPalInvoice => ({
  id: "INV2-AAAA",
  status,
  detail: { invoice_number: "RR-202610-T1-X", currency_code: "USD" },
  payments: paymentDate ? { transactions: [{ payment_date: paymentDate }] } : undefined,
});

const paidEvent = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: "WH-1",
    event_type: "INVOICING.INVOICE.PAID",
    resource: { id: "INV2-AAAA", status: "PAID" },
    ...overrides,
  });

function deps(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    db,
    webhookId: "WH-ID",
    verify: vi.fn(async () => true),
    fetchInvoice: vi.fn(async () => paypalInvoice("PAID", "2026-11-10")),
    now: new Date("2026-11-10T12:00:00Z"),
    ...overrides,
  };
}

const row = () => db.select().from(schema.invoices).get()!;

describe("handlePayPalWebhook", () => {
  it("marks the invoice PAID with PayPal's payment date", async () => {
    const d = deps();
    const result = await handlePayPalWebhook(paidEvent(), new Headers(), d);
    expect(result).toEqual({ status: 200, outcome: "RR-202610-T1-X → PAID" });
    expect(row()).toMatchObject({ status: "PAID", paidAt: "2026-11-10" });
    expect(d.fetchInvoice).toHaveBeenCalledWith("INV2-AAAA");
  });

  it("verifies the signature against the raw body before doing anything", async () => {
    const d = deps({ verify: vi.fn(async () => false) });
    const raw = paidEvent();
    expect(await handlePayPalWebhook(raw, new Headers({ "paypal-transmission-id": "t" }), d)).toEqual({
      status: 401,
      outcome: "signature verification failed",
    });
    expect(d.verify).toHaveBeenCalledWith(expect.any(Headers), raw, "WH-ID");
    expect(d.fetchInvoice).not.toHaveBeenCalled();
    expect(row().status).toBe("SENT");
  });

  it("applies a redelivered event only once", async () => {
    const d = deps();
    await handlePayPalWebhook(paidEvent(), new Headers(), d);
    const again = await handlePayPalWebhook(paidEvent(), new Headers(), d);
    expect(again.outcome).toBe("duplicate of WH-1 (RR-202610-T1-X → PAID)");
    expect(d.fetchInvoice).toHaveBeenCalledTimes(1);
  });

  it("accepts the older event shape with the invoice nested under resource.invoice", async () => {
    const result = await handlePayPalWebhook(paidEvent({ resource: { invoice: { id: "INV2-AAAA" } } }), new Headers(), deps());
    expect(result.outcome).toBe("RR-202610-T1-X → PAID");
  });

  it("acknowledges but ignores invoices RentRhythm didn't send and unhandled event types", async () => {
    const other = deps({ fetchInvoice: vi.fn(async () => ({ ...paypalInvoice("PAID"), id: "INV2-OTHER" })) });
    expect((await handlePayPalWebhook(paidEvent({ resource: { id: "INV2-OTHER" } }), new Headers(), other)).outcome).toBe(
      "invoice INV2-OTHER was not sent by RentRhythm",
    );
    const d = deps();
    expect(await handlePayPalWebhook(paidEvent({ id: "WH-2", event_type: "PAYMENT.SALE.COMPLETED" }), new Headers(), d)).toEqual({
      status: 200,
      outcome: "ignored PAYMENT.SALE.COMPLETED",
    });
    expect(d.fetchInvoice).not.toHaveBeenCalled();
  });

  it("rejects bodies that aren't PayPal events, and refuses to run unconfigured", async () => {
    expect((await handlePayPalWebhook("not json", new Headers(), deps())).status).toBe(400);
    expect((await handlePayPalWebhook("{}", new Headers(), deps())).status).toBe(400);
    expect((await handlePayPalWebhook(paidEvent(), new Headers(), deps({ webhookId: undefined }))).status).toBe(500);
  });

  it("lets an API failure surface so the route answers 5xx and PayPal retries", async () => {
    const d = deps({ fetchInvoice: vi.fn(async () => Promise.reject(new Error("PayPal down"))) });
    await expect(handlePayPalWebhook(paidEvent(), new Headers(), d)).rejects.toThrow("PayPal down");
    // Not recorded as processed, so the retry is handled.
    expect(db.select().from(schema.webhookEvents).all()).toHaveLength(0);
  });
});

describe("applyPayPalInvoice", () => {
  it("falls back to now when PayPal has no payment date, and keeps the first paid date", () => {
    const now = new Date("2026-11-10T08:30:00Z");
    expect(applyPayPalInvoice(db, paypalInvoice("MARKED_AS_PAID"), now)?.row.paidAt).toBe("2026-11-10 08:30:00");
    expect(applyPayPalInvoice(db, paypalInvoice("PAID", "2026-11-12"), now)?.row.paidAt).toBe("2026-11-10 08:30:00");
  });

  it("reports no change when nothing differs", () => {
    expect(applyPayPalInvoice(db, paypalInvoice("SENT"))?.changed).toBe(false);
  });
});
