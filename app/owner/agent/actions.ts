"use server";

import { revalidatePath } from "next/cache";
import { type AgentStep, runAgent, summarizeStep } from "@/lib/agent";

export type ChatMessage = { role: "user" | "assistant"; content: string; steps?: AgentStep[]; error?: boolean };

// Keep the conversation short: Gemini sees the last few turns, not the whole history.
const MAX_TURNS = 10;

export async function askAgent(history: ChatMessage[]): Promise<ChatMessage> {
  const steps: AgentStep[] = [];
  try {
    const result = await runAgent(
      history.filter((m) => !m.error).slice(-MAX_TURNS).map(({ role, content }) => ({ role, content })),
      { onToolCall: (call) => steps.push(summarizeStep(call)) },
    );
    revalidatePath("/owner"); // reminders can refresh invoice statuses
    return { role: "assistant", content: result.text, steps, error: !result.ok };
  } catch (err) {
    console.error("askAgent failed", err);
    return {
      role: "assistant",
      content: "Something went wrong talking to the assistant. Please try again.",
      steps,
      error: true,
    };
  }
}
