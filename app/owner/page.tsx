import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { monthLabel, previewMonthlyBill } from "@/lib/invoicing";
import { OwnerTable, type OwnerRow } from "./owner-table";

export const dynamic = "force-dynamic";

// Months that have meal data, newest first; the latest is the default billing month.
function billableMonths(): string[] {
  const rows = getDb()
    .$client.prepare("SELECT DISTINCT substr(date, 1, 7) AS month FROM meal_attendance ORDER BY month DESC")
    .all() as { month: string }[];
  return rows.map((r) => r.month);
}

export default async function OwnerPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const db = getDb();
  const months = billableMonths();
  const requested = (await searchParams).month;
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : (months[0] ?? new Date().toISOString().slice(0, 7));
  const property = db.select().from(schema.properties).get();

  if (!property) {
    return (
      <main>
        <h1>Owner</h1>
        <p>No property yet. Run <code>npm run seed</code>.</p>
      </main>
    );
  }

  const tenants = db.select().from(schema.tenants).where(eq(schema.tenants.active, true)).all();
  const rows: OwnerRow[] = tenants.map((tenant) => {
    const { bill } = previewMonthlyBill(tenant.id, month, db);
    const invoice = db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.tenantId, tenant.id), eq(schema.invoices.month, month)))
      .get();
    return {
      tenant: { id: tenant.id, name: tenant.name, room: tenant.room, paydayDay: tenant.paydayDay },
      bill,
      invoice: invoice
        ? { status: invoice.status, invoiceNumber: invoice.invoiceNumber, total: invoice.total, dueDate: invoice.dueDate }
        : null,
    };
  });

  return (
    <main>
      <p>
        <Link href="/">RentRhythm</Link>
      </p>
      <h1>{property.name}: owner</h1>
      <form method="get" style={{ marginBottom: 16 }}>
        <label>
          Billing month{" "}
          <select name="month" defaultValue={month}>
            {[...new Set([month, ...months])].map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>{" "}
        <button type="submit">Show</button>
      </form>
      <p style={{ color: "#555" }}>
        Meals: ${property.mealPriceVoted.toFixed(2)} voted · ${property.mealPriceWalkIn.toFixed(2)} walk-in. Each bill is
        due on the tenant&apos;s payday the following month + {property.graceDays} grace days.
      </p>
      <OwnerTable month={month} currency={property.currency} rows={rows} />
    </main>
  );
}
