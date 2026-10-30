// Owner collections agent: Gemini + PayPal Agent Toolkit (invoice tools only, SANDBOX).
import { google } from "@ai-sdk/google";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { APICallError, generateText, RetryError, stepCountIs, tool, type ToolSet } from "ai";
import { z } from "zod";
import { PAYPAL_API_BASE, saveInvoiceQr } from "./paypal";

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
    clientId: process.env.PAYPAL_CLIENT_ID!,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
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

  const tools: ToolSet = {};
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

export function systemPrompt(today = new Date().toISOString().slice(0, 10)) {
  return `You are RentRhythm's collections assistant for the owner of a co-living property.
Today is ${today}. You work against PayPal SANDBOX invoices.

Rules:
- Use the tools to look things up; never invent invoice IDs, amounts, statuses or dates.
- Unpaid means status SENT, UNPAID or PARTIALLY_PAID. PAID, MARKED_AS_PAID, CANCELLED and DRAFT are not unpaid.
- Only send reminders for unpaid invoices, and only the ones the owner asked about.
- When you send a reminder, keep the note short, friendly and polite.
- A QR tool result is a file path; mention the path, never try to show image data.
- Answer concisely: a short summary, then one line per invoice (number, recipient, amount, due date, status, what you did).`;
}

function geminiModel() {
  return google(process.env.GEMINI_MODEL || "gemini-3.6-flash");
}

/** Turns Gemini overload / rate-limit errors into a message the owner can act on. */
export function friendlyAgentError(err: unknown): string | null {
  const inner = RetryError.isInstance(err) ? err.lastError : err;
  if (APICallError.isInstance(inner)) {
    if (inner.statusCode === 429) return "The AI assistant is rate-limited right now. Please wait a minute and try again.";
    if (inner.statusCode === 503) return "The AI model is overloaded right now. Please try again in a moment.";
  }
  return null;
}

export async function runAgent(request: string, opts: { onToolCall?: (call: ToolCallLog) => void } = {}) {
  try {
    const result = await generateText({
      model: geminiModel(),
      system: systemPrompt(),
      prompt: request,
      tools: buildPayPalTools(opts.onToolCall),
      stopWhen: stepCountIs(10),
    });
    return { ok: true as const, text: result.text };
  } catch (err) {
    const friendly = friendlyAgentError(err);
    if (friendly) return { ok: false as const, text: friendly };
    throw err;
  }
}
