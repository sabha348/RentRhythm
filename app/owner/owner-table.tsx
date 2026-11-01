"use client";

import { Fragment, useState, useTransition } from "react";
import type { Bill } from "@/lib/billing";
import { type SendActionResult, sendInvoiceAction } from "./actions";

export type OwnerRow = {
  tenant: { id: number; name: string; room: string; paydayDay: number };
  bill: Bill;
  invoice: { status: string; invoiceNumber: string; total: number; dueDate: string; paidAt: string | null } | null;
};

const cell = { borderBottom: "1px solid #ddd", padding: "6px 10px", textAlign: "left" as const };
const money = (n: number) => `$${n.toFixed(2)}`;
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

export function OwnerTable({ month, currency, rows }: { month: string; currency: string; rows: OwnerRow[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, SendActionResult>>({});
  const [sending, setSending] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function send(tenantId: number) {
    setSending(tenantId);
    startTransition(async () => {
      const result = await sendInvoiceAction(tenantId, month);
      setResults((r) => ({ ...r, [tenantId]: result }));
      setSending(null);
    });
  }

  return (
    <table style={{ borderCollapse: "collapse", minWidth: 760 }}>
      <thead>
        <tr>
          {["Tenant", "Room", "Payday", "Due date", "Bill", "Status", ""].map((h) => (
            <th key={h} style={cell}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ tenant, bill, invoice }) => {
          const result = results[tenant.id];
          const sent = invoice && invoice.status !== "CREATING" && invoice.status !== "DRAFT";
          return (
            <Fragment key={tenant.id}>
              <tr>
                <td style={cell}>{tenant.name}</td>
                <td style={cell}>{tenant.room}</td>
                <td style={cell}>{ordinal(tenant.paydayDay)}</td>
                <td style={cell}>{invoice?.dueDate ?? bill.dueDate}</td>
                <td style={cell}>
                  {money(invoice?.total ?? bill.total)} {currency}
                </td>
                <td style={cell}>
                  {invoice?.status === "PAID" || invoice?.status === "MARKED_AS_PAID" ? (
                    <span title={invoice.invoiceNumber} style={{ color: "#15803d", fontWeight: 600 }}>
                      ✓ PAID{invoice.paidAt && ` ${invoice.paidAt.slice(0, 10)}`}
                    </span>
                  ) : invoice ? (
                    <span title={invoice.invoiceNumber}>{invoice.status}</span>
                  ) : (
                    <span style={{ color: "#888" }}>Not sent</span>
                  )}
                </td>
                <td style={cell}>
                  <button onClick={() => setOpen(open === tenant.id ? null : tenant.id)}>
                    {open === tenant.id ? "Hide bill" : "Preview bill"}
                  </button>{" "}
                  <button disabled={!!sent || sending === tenant.id} onClick={() => send(tenant.id)}>
                    {sending === tenant.id ? "Sending…" : sent ? "Sent" : "Send via PayPal"}
                  </button>
                  {invoice && ["SENT", "UNPAID", "PARTIALLY_PAID"].includes(invoice.status) && (
                    <>
                      {" "}
                      <a href={`/desk/${encodeURIComponent(invoice.invoiceNumber)}`} target="_blank" rel="noreferrer">
                        Show pay QR
                      </a>
                    </>
                  )}
                </td>
              </tr>
              {result && (
                <tr>
                  <td colSpan={7} style={{ ...cell, color: result.ok ? "green" : "crimson" }}>
                    {result.message}{" "}
                    {result.ok && result.payerLink && (
                      <a href={result.payerLink} target="_blank" rel="noreferrer">
                        Payer link
                      </a>
                    )}
                  </td>
                </tr>
              )}
              {open === tenant.id && (
                <tr>
                  <td colSpan={7} style={{ ...cell, background: "#fafafa" }}>
                    <table style={{ borderCollapse: "collapse" }}>
                      <tbody>
                        {bill.lines.map((l) => (
                          <tr key={l.name}>
                            <td style={{ padding: "2px 12px 2px 0" }}>{l.name}</td>
                            <td style={{ padding: "2px 12px", textAlign: "right" }}>
                              {l.quantity} × {money(l.unitAmount)}
                            </td>
                            <td style={{ padding: "2px 0", textAlign: "right" }}>{money(l.amount)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ paddingTop: 4, fontWeight: 600 }}>Total</td>
                          <td />
                          <td style={{ paddingTop: 4, fontWeight: 600, textAlign: "right" }}>{money(bill.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                    <small style={{ color: "#666" }}>
                      Meals this month: {bill.meals.votedAte} voted &amp; eaten, {bill.meals.votedAbsent} voted but
                      absent (charged), {bill.meals.walkIns} walk-ins. Due {bill.dueDate}.
                      {invoice && invoice.total !== bill.total && " Sent invoice total differs from today's data."}
                    </small>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
