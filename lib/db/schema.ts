import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// Money is stored in the property's currency as decimal amounts; billing rounds to 2 decimals.
// Dates are ISO strings: date = YYYY-MM-DD, month = YYYY-MM.

export const properties = sqliteTable("properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  mealPriceVoted: real("meal_price_voted").notNull().default(3),
  mealPriceWalkIn: real("meal_price_walk_in").notNull().default(5),
  graceDays: integer("grace_days").notNull().default(2),
  timezone: text("timezone").notNull().default("Asia/Kolkata"), // IANA zone for "today"/"tomorrow"
  voteCutoff: text("vote_cutoff").notNull().default("21:00"), // HH:MM local; votes for tomorrow close then
});

export const tenants = sqliteTable("tenants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  room: text("room").notNull(),
  monthlyRent: real("monthly_rent").notNull(),
  paydayDay: integer("payday_day").notNull(), // 1–31, clamped to the month's last day when billing
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const MEALS = ["lunch", "dinner"] as const;
export type Meal = (typeof MEALS)[number];

export const mealVotes = sqliteTable(
  "meal_votes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id").notNull().references(() => tenants.id),
    date: text("date").notNull(),
    meal: text("meal", { enum: MEALS }).notNull(),
    going: integer("going", { mode: "boolean" }).notNull(),
  },
  (t) => [unique().on(t.tenantId, t.date, t.meal)],
);

export const mealAttendance = sqliteTable(
  "meal_attendance",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id").notNull().references(() => tenants.id),
    date: text("date").notNull(),
    meal: text("meal", { enum: MEALS }).notNull(),
    ate: integer("ate", { mode: "boolean" }).notNull(),
  },
  (t) => [unique().on(t.tenantId, t.date, t.meal)],
);

export const utilityCharges = sqliteTable("utility_charges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  month: text("month").notNull(),
  label: text("label").notNull(),
  amount: real("amount").notNull(),
});

export const invoices = sqliteTable(
  "invoices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id").notNull().references(() => tenants.id),
    month: text("month").notNull(),
    paypalInvoiceId: text("paypal_invoice_id"),
    invoiceNumber: text("invoice_number").notNull(),
    status: text("status").notNull(), // mirrors PayPal: DRAFT, SENT, PAID, ...
    total: real("total").notNull(),
    dueDate: text("due_date").notNull(),
    paidAt: text("paid_at"), // set from the PAID webhook; used to flag repeat late payers
    // "paypal" = a real sandbox invoice; "seed" = demo payment history with no PayPal invoice behind it
    source: text("source", { enum: ["paypal", "seed"] }).notNull().default("paypal"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [unique().on(t.tenantId, t.month)],
);

export type Property = typeof properties.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type MealVote = typeof mealVotes.$inferSelect;
export type MealAttendance = typeof mealAttendance.$inferSelect;
export type UtilityCharge = typeof utilityCharges.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
