"use server";

import { revalidatePath } from "next/cache";
import { castVote, MealError, tenantVotes } from "@/lib/meals-db";

export type VoteActionResult =
  | { ok: true; votes: Record<string, boolean> }
  | { ok: false; message: string };

// `date` is the day the page showed; castVote rejects it if it is no longer "tomorrow" or voting
// has closed since the page loaded.
export async function voteAction(tenantId: number, date: string, meal: string, going: boolean): Promise<VoteActionResult> {
  try {
    castVote(tenantId, date, meal, going);
  } catch (err) {
    if (err instanceof MealError) return { ok: false, message: err.message };
    throw err;
  }
  revalidatePath("/cook");
  revalidatePath(`/vote/${tenantId}`);
  return { ok: true, votes: Object.fromEntries(tenantVotes(tenantId, date).map((v) => [v.meal, v.going])) };
}
