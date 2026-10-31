"use server";

import { revalidatePath } from "next/cache";
import { logAttendance, MealError } from "@/lib/meals-db";

export type CookActionResult = { ok: true } | { ok: false; message: string };

/** Logs whether each tenant ate a meal (a tick, an untick, a walk-in, or confirming voters). */
export async function logAttendanceAction(
  entries: { tenantId: number; ate: boolean }[],
  date: string,
  meal: string,
): Promise<CookActionResult> {
  try {
    for (const { tenantId, ate } of entries) logAttendance(tenantId, date, meal, ate);
  } catch (err) {
    if (err instanceof MealError) return { ok: false, message: err.message };
    throw err;
  }
  revalidatePath("/cook");
  revalidatePath("/owner"); // walk-ins change bills
  return { ok: true };
}
