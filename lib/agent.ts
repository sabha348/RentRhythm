// Owner collections agent: Gemini + PayPal Agent Toolkit (invoice tools only, SANDBOX) + one
// read-only tool over our own DB.
import { google } from "@ai-sdk/google";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { APICallError, generateText, type ModelMessage, RetryError, stepCountIs, tool, type ToolSet } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { collectionsToday } from "./clock";
import { UNPAID_STATUSES, weekRange } from "./collections";
import { loadCollections } from "./collections-db";
import { getDb, schema } from "./db";
import { getInvoice, PAYPAL_API_BASE, requireEnv, saveInvoiceQr } from "./paypal";

// The ONLY toolkit actions the agent gets. Never add money-moving tools (payouts, refunds, captures).
const ALLOWED_ACTIONS = { list: true, get: true, sendReminder: true, generateQRC: true };
const ALLOWED_TOOLS = ["list_invoices", "get_invoice", "send_invoice_reminder", "generate_invoice_qr_code"];

export type ToolCallLog = { tool: string; input: unknown; output: unknown; ms: number };

type LegacyTool = {
  description?: string;
  parameters: z.ZodTypeAny;
  execute: (input: unknown) => Promise<unknown>;
};

// Toolkit tools return JSON strings; give the model parsed JSON.
function parseToolOutput(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * @paypal/agent-toolkit 1.11.0 builds tools for AI SDK v4 ({ description, parameters, execute }).
 * AI SDK v7 expects { description, inputSchema, execute }, so re-wrap each one and log every call.
 */
export function buildPayPalTools(onToolCall?: (call: ToolCallLog) => void): ToolSet {
  const toolkit = new PayPalAgentToolkit({
    clientId: requireEnv("PAYPAL_CLIENT_ID"), // trimmed, like lib/paypal.ts: Render's value has a stray newline
    clientSecret: requireEnv("PAYPAL_CLIENT_SECRET"),
    // The toolkit defaults to PRODUCTION unless sandbox is set.
    configuration: { actions: { invoices: ALLOWED_ACTIONS }, context: { sandbox: true } },
  });
  // The toolkit hard-codes the legacy host api.sandbox.paypal.com; use the same
  // api-m sandbox host as lib/paypal.ts (the only one allowed in some networks).
  const client = toolkit.client as unknown as { _isSandbox: boolean; _baseUrl: string };
  if (!client._isSandbox) throw new Error("Refusing to start: PayPal toolkit is not in sandbox mode");
  client._baseUrl = PAYPAL_API_BASE;

  const legacy = toolkit.getTools() as unknown as Record<string, LegacyTool>;

  const unexpected = Object.keys(legacy).filter((name) => !ALLOWED_TOOLS.includes(name));
  if (unexpected.length) throw new Error(`Refusing to start: unexpected PayPal tools ${unexpected}`);

  const overrides: Record<string, (input: any) => Promise<unknown>> = {
    // PayPal sends no content on a successful reminder; make that explicit for the model.
    send_invoice_reminder: async (input) => {
      const blocked = await reminderBlockedReason(input.invoice_id);
      if (blocked) return { success: false, invoice_id: input.invoice_id, blocked };
      const out = parseToolOutput(await legacy.send_invoice_reminder.execute(input));
      const empty = out == null || out === "" || (typeof out === "object" && !Object.keys(out).length);
      return empty ? { success: true, invoice_id: input.invoice_id, message: "Reminder sent." } : out;
    },
    // The toolkit returns the raw multipart/base64 body. Never hand base64 to the model:
    // save the PNG and return its path instead.
    generate_invoice_qr_code: async (input) => ({
      invoice_id: input.invoice_id,
      qr_png_path: await saveInvoiceQr(input.invoice_id),
    }),
  };

  const tools: ToolSet = {
    get_collections_overview: tool({
      description:
        "Read-only. Every tenant with their payday, latest invoice (PayPal invoice ID, status, total, due date, " +
        "days until due), whether their payday has passed, payment history for the last 3 decided months, " +
        "whether they are a repeat late payer, the suggested action (remind / wait / none), and `reason` / " +
        "`lateSummary`: plain-language facts to quote as-is. Call this first.",
      inputSchema: z.object({}),
      execute: async () => {
        const started = Date.now();
        const { today, tenants } = loadCollections();
        const output = { today, thisWeek: weekRange(today), tenants };
        onToolCall?.({ tool: "get_collections_overview", input: {}, output, ms: Date.now() - started });
        return output;
      },
    }),
  };
  for (const [name, t] of Object.entries(legacy)) {
    tools[name] = tool({
      description:
        name === "generate_invoice_qr_code"
          ? "Generate the pay-by-QR code for an invoice. Saves a PNG and returns its file path."
          : t.description,
      inputSchema: t.parameters,
      execute: async (input: unknown) => {
        const started = Date.now();
        let output: unknown;
        try {
          output = overrides[name] ? await overrides[name](input) : parseToolOutput(await t.execute(input));
        } catch (err) {
          output = { error: err instanceof Error ? err.message : String(err) };
        }
        onToolCall?.({ tool: name, input, output, ms: Date.now() - started });
        return output;
      },
    });
  }
  return tools;
}

/**
 * Reminders go only to real invoices we sent (in our DB) that PayPal still shows as unpaid.
 * Returns why a reminder is blocked, or null if it may be sent.
 */
export async function reminderBlockedReason(paypalInvoiceId: string): Promise<string | null> {
  const db = getDb();
  const row = db.select().from(schema.invoices).where(eq(schema.invoices.paypalInvoiceId, paypalInvoiceId)).get();
  if (!row) return "This invoice was not sent by RentRhythm, so I won't remind anyone about it.";
  const live = await getInvoice(paypalInvoiceId);
  if (live.status !== row.status) db.update(schema.invoices).set({ status: live.status }).where(eq(schema.invoices.id, row.id)).run();
  if (!UNPAID_STATUSES.includes(live.status)) return `Invoice ${row.invoiceNumber} is ${live.status}, not unpaid.`;
  return null;
}

export function systemPrompt(today: string) {
  return `You are RentRhythm's collections assistant for the owner of a co-living property.
Today is ${today}. You work against PayPal SANDBOX invoices. Each tenant's bill is due on their own
payday (plus grace days), not on one fixed date.

How to work:
- Start with get_collections_overview; it has every tenant's payday, latest invoice and payment history.
- "Due this week" = unpaid invoices due between today and 6 days from now, plus any already overdue.
- "Payday has passed" = paydayPassed is true. Remind exactly the tenants whose suggestedAction is "remind",
  unless the owner asks for something narrower. Never remind tenants whose payday hasn't come yet;
  say they were skipped and when their payday is.
- Send reminders with send_invoice_reminder using the PayPal invoice ID (paypalInvoiceId). Keep the note short,
  friendly and polite; mention that their payday has passed and the bill amount (it covers rent, meals and utilities, so don't call it "rent").
- If a reminder comes back blocked, don't retry; tell the owner why.
- Each tenant's \`reason\` and \`lateSummary\` are computed facts. Base what you say about a tenant on them and
  quote numbers from them exactly; don't recompute dates, amounts or late counts yourself.
- Flag every tenant with repeatLatePayer = true using their lateSummary, so the owner can follow up in person.
  Flag, don't scold.
- Use the tools to look things up; never invent invoice IDs, amounts, statuses or dates.
- A QR tool result is a file path; mention the path, never try to show image data.

Reply in plain text (no markdown tables or bold): one short summary line, then one line per tenant you
acted on or skipped ("- Name (room): what you did, amount, due date"), then a "Flags:" line for repeat late payers.`;
}

// The owner's "today" (property timezone, or DEMO_TODAY), not the server's UTC date.
function agentToday(): string {
  const property = getDb().select().from(schema.properties).get();
  return collectionsToday(property?.timezone ?? "UTC");
}

function geminiModel() {
  return google(process.env.GEMINI_MODEL || "gemini-3.6-flash");
}

/** Turns Gemini overload / rate-limit errors into a message the owner can act on. */
export function friendlyAgentError(err: unknown): string | null {
  const inner = RetryError.isInstance(err) ? err.lastError : err;
  if (APICallError.isInstance(inner)) {
    if (inner.statusCode === 429) {
      return /per day/i.test(inner.message)
        ? "The AI assistant has used up today's free Gemini quota. It resets within 24 hours (or add billing to the Google AI project)."
        : "The AI assistant is rate-limited right now. Please wait a minute and try again.";
    }
    if (inner.statusCode === 503) return "The AI model is overloaded right now. Please try again in a moment.";
  }
  if (inner instanceof Error && /timeout|timed out|abort/i.test(`${inner.name} ${inner.message}`)) {
    return "The AI assistant took too long to answer. Please try again.";
  }
  return null;
}

export type AgentStep = { tool: string; summary: string; ok: boolean };

/** One human-readable line per tool call, for the chat UI and logs. */
export function summarizeStep(call: ToolCallLog): AgentStep {
  const out = call.output as Record<string, any> | null;
  const input = call.input as Record<string, any>;
  const err = out?.error ? String(out.error.message ?? out.error) : null;
  if (err) return { tool: call.tool, summary: `${call.tool} failed: ${err}`, ok: false };
  const label = (paypalId: string) => {
    const row = getDb().select().from(schema.invoices).where(eq(schema.invoices.paypalInvoiceId, paypalId)).get();
    const tenant = row && getDb().select().from(schema.tenants).where(eq(schema.tenants.id, row.tenantId)).get();
    return row ? `${tenant?.name ?? "tenant"} (${row.invoiceNumber})` : paypalId;
  };
  switch (call.tool) {
    case "get_collections_overview": {
      const tenants = (out?.tenants ?? []) as { suggestedAction: string; repeatLatePayer: boolean }[];
      const remind = tenants.filter((t) => t.suggestedAction === "remind").length;
      const flagged = tenants.filter((t) => t.repeatLatePayer).length;
      return { tool: call.tool, summary: `Checked ${tenants.length} tenants' paydays and invoices: ${remind} to remind, ${flagged} repeat late payer${flagged === 1 ? "" : "s"}`, ok: true };
    }
    case "list_invoices":
      return { tool: call.tool, summary: `Listed ${out?.items?.length ?? 0} PayPal invoices`, ok: true };
    case "get_invoice":
      return { tool: call.tool, summary: `Checked ${label(input.invoice_id)} in PayPal: ${out?.status ?? "?"}`, ok: true };
    case "send_invoice_reminder":
      return out?.blocked
        ? { tool: call.tool, summary: `Did not remind ${label(input.invoice_id)}: ${out.blocked}`, ok: false }
        : { tool: call.tool, summary: `Sent a PayPal reminder to ${label(input.invoice_id)}`, ok: true };
    case "generate_invoice_qr_code":
      return { tool: call.tool, summary: `Generated a pay QR code for ${label(input.invoice_id)}`, ok: true };
    default:
      return { tool: call.tool, summary: call.tool, ok: true };
  }
}

/** Longest the owner waits for an answer before getting a "try again" message. */
export const AGENT_DEADLINE_MS = 150_000;

export async function runAgent(
  request: string | ModelMessage[],
  opts: { onToolCall?: (call: ToolCallLog) => void } = {},
) {
  // Hard deadline for the whole request. The SDK's own timeout doesn't cover the wait before a
  // retry, and on a Gemini 503 that wait can be minutes, so the page would sit on "Checking…".
  const deadline = AbortSignal.timeout(AGENT_DEADLINE_MS);
  try {
    const run = generateText({
      model: geminiModel(),
      system: systemPrompt(agentToday()),
      ...(typeof request === "string" ? { prompt: request } : { messages: request }),
      tools: buildPayPalTools(opts.onToolCall),
      stopWhen: stepCountIs(12),
      // One retry covers a brief blip; more would wait out Gemini's retry delay (hours on a quota 429).
      timeout: { totalMs: AGENT_DEADLINE_MS, stepMs: 60_000 },
      maxRetries: 1,
      abortSignal: deadline,
    });
    // Belt and braces: settle at the deadline even if something ignores the abort signal.
    const stop = new Promise<never>((_, reject) =>
      deadline.addEventListener("abort", () => reject(new Error("Agent request timed out")), { once: true }),
    );
    const result = await Promise.race([run, stop]);
    return { ok: true as const, text: result.text };
  } catch (err) {
    const friendly = friendlyAgentError(err);
    if (friendly) return { ok: false as const, text: friendly };
    throw err;
  }
}
