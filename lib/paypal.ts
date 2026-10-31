// Shared PayPal Invoicing v2 client. SANDBOX ONLY.
// Everything that talks to PayPal (scripts, billing, API routes) goes through this file.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} (see .env.example)`);
  return value;
}

// ---------- Auth ----------

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const credentials = Buffer.from(
    `${requireEnv("PAYPAL_CLIENT_ID")}:${requireEnv("PAYPAL_CLIENT_SECRET")}`,
  ).toString("base64");
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.access_token) {
    throw new PayPalError(`PayPal OAuth failed (${res.status})`, res.status, body);
  }
  // Refresh a minute before PayPal's expiry.
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

async function paypalRequest(
  method: "GET" | "POST",
  pathname: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const res = await fetch(`${PAYPAL_API_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {}
    const detail =
      (parsed as { details?: { issue?: string; description?: string }[] })?.details
        ?.map((d) => d.description ?? d.issue)
        .join("; ") ?? (parsed as { message?: string })?.message;
    throw new PayPalError(
      `PayPal ${method} ${pathname} failed (${res.status})${detail ? `: ${detail}` : ""}`,
      res.status,
      parsed,
    );
  }
  return res;
}

// PayPal returns an empty body on some successes (e.g. reminders), so tolerate that.
async function jsonOrNull<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

// ---------- Invoices ----------

export type Money = { currency_code: string; value: string };

export type InvoiceLineItem = {
  name: string;
  quantity: number;
  unitAmount: number;
  description?: string;
};

export type CreateInvoiceInput = {
  invoiceNumber: string; // must be unique per PayPal account
  recipientEmail: string;
  recipientName?: string;
  currency: string;
  items: InvoiceLineItem[];
  dueDate: string; // YYYY-MM-DD
  invoiceDate?: string; // YYYY-MM-DD, defaults to today
  note?: string;
  businessName?: string;
};

// The subset of the PayPal invoice representation we use.
export type PayPalInvoice = {
  id: string;
  status: string; // DRAFT | SENT | SCHEDULED | PAID | MARKED_AS_PAID | CANCELLED | ...
  detail: {
    invoice_number: string;
    invoice_date?: string;
    currency_code: string;
    note?: string;
    payment_term?: { term_type?: string; due_date?: string };
    metadata?: { recipient_view_url?: string; invoicer_view_url?: string };
  };
  primary_recipients?: { billing_info?: { email_address?: string } }[];
  items?: { name: string; quantity: string; unit_amount: Money; description?: string }[];
  amount?: { currency_code: string; value: string };
  due_amount?: Money;
  payments?: { paid_amount?: Money };
};

const money = (currency: string, value: number): Money => ({
  currency_code: currency,
  value: value.toFixed(2),
});

const today = () => new Date().toISOString().slice(0, 10);

export function buildInvoicePayload(input: CreateInvoiceInput) {
  const [givenName, ...rest] = (input.recipientName ?? "").trim().split(/\s+/);
  return {
    detail: {
      invoice_number: input.invoiceNumber,
      invoice_date: input.invoiceDate ?? today(),
      currency_code: input.currency,
      note: input.note,
      payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: input.dueDate },
    },
    // No invoicer email: PayPal invoices as the account that owns the API credentials. Sending an
    // email that doesn't match that account fails with USER_NOT_FOUND.
    ...(input.businessName ? { invoicer: { business_name: input.businessName } } : {}),
    primary_recipients: [
      {
        billing_info: {
          email_address: input.recipientEmail,
          ...(givenName ? { name: { given_name: givenName, surname: rest.join(" ") || undefined } } : {}),
        },
      },
    ],
    items: input.items.map((item) => ({
      name: item.name,
      description: item.description,
      quantity: String(item.quantity),
      unit_amount: money(input.currency, item.unitAmount),
      unit_of_measure: "QUANTITY",
    })),
  };
}

/** Creates a DRAFT invoice and returns the full invoice. */
export async function createDraftInvoice(input: CreateInvoiceInput): Promise<PayPalInvoice> {
  const res = await paypalRequest("POST", "/v2/invoicing/invoices", buildInvoicePayload(input), {
    Prefer: "return=representation",
  });
  const created = await jsonOrNull<PayPalInvoice & { href?: string }>(res);
  if (!created) throw new PayPalError("PayPal returned no invoice on create", res.status, null);
  // Without the Prefer header PayPal only returns a link; fall back to fetching it.
  return created.id ? created : getInvoice(created.href!.split("/").pop()!);
}

/** Emails the invoice to the recipient (DRAFT -> SENT). */
export async function sendInvoice(invoiceId: string): Promise<void> {
  await paypalRequest("POST", `/v2/invoicing/invoices/${invoiceId}/send`, {
    send_to_invoicer: false,
    send_to_recipient: true,
  });
}

export async function getInvoice(invoiceId: string): Promise<PayPalInvoice> {
  const res = await paypalRequest("GET", `/v2/invoicing/invoices/${invoiceId}`);
  return (await res.json()) as PayPalInvoice;
}

// ---------- QR code ----------

/**
 * PayPal returns the QR as a multipart body wrapping a base64 PNG:
 *   --boundary\r\nContent-Type: ...\r\n\r\n<base64>\r\n--boundary--
 * Take only the text between the first blank line and the closing boundary.
 */
export function parseQrMultipart(body: string): Buffer {
  const start = body.search(/\r?\n\r?\n/);
  if (start === -1) {
    // Not multipart after all: assume the whole body is base64.
    return Buffer.from(body.trim(), "base64");
  }
  const afterHeaders = body.slice(start).replace(/^\r?\n\r?\n/, "");
  const end = afterHeaders.search(/\r?\n--/);
  const base64 = (end === -1 ? afterHeaders : afterHeaders.slice(0, end)).replace(/\s+/g, "");
  const png = Buffer.from(base64, "base64");
  if (png.subarray(1, 4).toString("ascii") !== "PNG") {
    throw new Error("PayPal QR response did not contain a PNG");
  }
  return png;
}

export async function generateInvoiceQrPng(invoiceId: string, size = 400): Promise<Buffer> {
  const res = await paypalRequest(
    "POST",
    `/v2/invoicing/invoices/${invoiceId}/generate-qr-code`,
    { width: size, height: size, action: "pay" },
  );
  return parseQrMultipart(await res.text());
}

/** Saves the QR PNG under output/ and returns the file path (never hand base64 to the model). */
export async function saveInvoiceQr(invoiceId: string, dir = "output"): Promise<string> {
  const png = await generateInvoiceQrPng(invoiceId);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `invoice-qr-${invoiceId}.png`);
  await writeFile(file, png);
  return file;
}
