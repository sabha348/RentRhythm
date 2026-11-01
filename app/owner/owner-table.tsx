"use client";

import { Fragment, useState, useTransition } from "react";
import type { Bill } from "@/lib/billing";
import { type SendActionResult, sendInvoiceAction } from "./actions";

export type OwnerRow = {
  tenant: { id: number; name: string; room: string; paydayDay: number };
  bill: Bill;
  invoice: { status: string; invoiceNumber: string; total: number; dueDate: string; paidAt: string | null } | null;
};

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
    <div className="table-scroll">
    <table className="data" style={{ minWidth: 820 }}>
      <thead>
        <tr>
          {["Tenant", "Room", "Payday", "Due date", "Bill", "Status", ""].map((h) => (
            <th key={h}>
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
                <td>{tenant.name}</td>
                <td>{tenant.room}</td>
                <td>{ordinal(tenant.paydayDay)}</td>
                <td>{invoice?.dueDate ?? bill.dueDate}</td>
                <td>
                  {money(invoice?.total ?? bill.total)} {currency}
                </td>
                <td>
                  <StatusBadge invoice={invoice} />
                </td>
                <td>
                  <button onClick={() => setOpen(open === tenant.id ? null : tenant.id)}>
                    {open === tenant.id ? "Hide bill" : "Preview bill"}
                  </button>{" "}
                  <button
                    className={sent ? undefined : "primary"}
                    disabled={!!sent || sending === tenant.id}
                    onClick={() => send(tenant.id)}
                  >
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
                  <td colSpan={7} style={{ color: result.ok ? "var(--ok)" : "var(--bad)" }}>
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
                  <td colSpan={7} style={{ background: "#fafbfa" }}>
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
                    <small className="muted">
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
    </div>
  );
}

const PAID = ["PAID", "MARKED_AS_PAID"];

function StatusBadge({ invoice }: { invoice: OwnerRow["invoice"] }) {
  if (!invoice) return <span className="badge muted">Not sent</span>;
  if (PAID.includes(invoice.status)) {
    return (
      <span className="badge ok" title={invoice.invoiceNumber}>
        ✓ Paid{invoice.paidAt && ` ${invoice.paidAt.slice(5, 10)}`}
      </span>
    );
  }
  const tone = invoice.status === "CANCELLED" ? "bad" : invoice.status === "SENT" || invoice.status === "UNPAID" ? "info" : "muted";
  return (
    <span className={`badge ${tone}`} title={invoice.invoiceNumber}>
      {invoice.status === "SENT" ? "Sent, unpaid" : invoice.status.charAt(0) + invoice.status.slice(1).toLowerCase()}
    </span>
  );
}
