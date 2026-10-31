// Loads tenants and invoices from the DB into lib/collections.ts.
import { eq } from "drizzle-orm";
import { collectionsToday } from "./clock";
import { type TenantCollections, tenantCollections } from "./collections";
import { type DB, getDb, schema } from "./db";

export function loadCollections(db: DB = getDb(), now = new Date()): { today: string; tenants: TenantCollections[] } {
  const property = db.select().from(schema.properties).get();
  if (!property) throw new Error("No property found; run npm run seed");
  const today = collectionsToday(property.timezone, now);
  const invoices = db.select().from(schema.invoices).all();
  const tenants = db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.active, true))
    .all()
    .map((t) =>
      tenantCollections(
        { id: t.id, name: t.name, room: t.room, paydayDay: t.paydayDay, invoices: invoices.filter((i) => i.tenantId === t.id) },
        today,
      ),
    );
  return { today, tenants };
}
