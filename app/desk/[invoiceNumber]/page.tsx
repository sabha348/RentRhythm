import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { findDeskInvoice } from "@/lib/desk";
import { monthLabel } from "@/lib/invoicing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pay at the desk · RentRhythm" };

// Full-screen page for a desk tablet or monitor: the tenant scans the QR and pays on their phone.
export default async function DeskPage({ params }: { params: Promise<{ invoiceNumber: string }> }) {
  const invoice = findDeskInvoice((await params).invoiceNumber);
  if (!invoice) notFound();
  const amount = `$${invoice.total.toFixed(2)} ${invoice.currency}`;

  return (
    <main
      style={{
        minHeight: "calc(100vh - 32px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 12,
      }}
    >
      {/* Picks up the PAID webhook so the screen flips to a thank-you. */}
      <AutoRefresh seconds={3} />
      <p style={{ margin: 0, color: "#666", fontSize: 18 }}>{invoice.propertyName}</p>
      <h1 style={{ margin: 0, fontSize: 40 }}>
        {invoice.tenantName.split(" ")[0]} · room {invoice.room}
      </h1>
      <p style={{ margin: 0, fontSize: 22, color: "#333" }}>
        {monthLabel(invoice.month)} bill · <strong>{amount}</strong>
      </p>

      {invoice.state === "paid" ? (
        <div data-testid="desk-paid" style={{ marginTop: 24, color: "#15803d" }}>
          <div style={{ fontSize: 120, lineHeight: 1 }}>✓</div>
          <p style={{ fontSize: 36, fontWeight: 700, margin: "8px 0" }}>Paid, thank you!</p>
          {invoice.paidAt && <p style={{ margin: 0, color: "#555" }}>Received {invoice.paidAt.slice(0, 10)} via PayPal</p>}
        </div>
      ) : invoice.state === "unpaid" ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic PNG from our API route */}
          <img
            src={`/api/invoices/${encodeURIComponent(invoice.invoiceNumber)}/qr`}
            alt={`PayPal QR code to pay ${amount}`}
            width={340}
            height={340}
            style={{ width: "min(340px, 80vw)", height: "auto", border: "1px solid #ddd", borderRadius: 16, padding: 12, background: "#fff" }}
          />
          <p style={{ margin: 0, fontSize: 22 }}>Scan with your phone camera to pay with PayPal</p>
          <p style={{ margin: 0, color: "#666" }}>
            Due {invoice.dueDate} · {invoice.invoiceNumber}
          </p>
        </>
      ) : (
        <p style={{ fontSize: 22, color: "#666" }}>This invoice can&apos;t be paid here.</p>
      )}
    </main>
  );
}
