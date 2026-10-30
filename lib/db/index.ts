import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "rentrhythm.db");

function open() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export type DB = ReturnType<typeof open>;

// One connection per process (survives Next.js dev hot reloads).
const globalForDb = globalThis as unknown as { rentrhythmDb?: DB };

export function getDb(): DB {
  return (globalForDb.rentrhythmDb ??= open());
}

export { schema };
