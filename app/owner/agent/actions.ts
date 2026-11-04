"use server";

import { revalidatePath } from "next/cache";
import { type AgentStep, runAgent, summarizeStep } from "@/lib/agent";
import { createJobStore } from "@/lib/agent-jobs";

export type ChatMessage = { role: "user" | "assistant"; content: string; steps?: AgentStep[]; error?: boolean };
export type AgentPoll = { status: "running"; steps: AgentStep[] } | { status: "done"; reply: ChatMessage } | { status: "missing" };

// Keep the conversation short: Gemini sees the last few turns, not the whole history.
const MAX_TURNS = 10;

// One store per server process (survives dev hot reloads).
const g = globalThis as typeof globalThis & { __agentJobs?: ReturnType<typeof createJobStore<AgentStep, ChatMessage>> };
const jobs = (g.__agentJobs ??= createJobStore<AgentStep, ChatMessage>());

/** Starts the assistant in the background and returns a job id; the chat polls `pollAgent` for the reply. */
export async function startAgent(history: ChatMessage[]): Promise<string> {
  return jobs.start(async (onStep) => {
    const steps: AgentStep[] = [];
    try {
      const result = await runAgent(
        history.filter((m) => !m.error).slice(-MAX_TURNS).map(({ role, content }) => ({ role, content })),
        {
          onToolCall: (call) => {
            const step = summarizeStep(call);
            steps.push(step);
            onStep(step);
          },
        },
      );
      return { role: "assistant", content: result.text, steps, error: !result.ok };
    } catch (err) {
      console.error("askAgent failed", err);
      return { role: "assistant", content: "Something went wrong talking to the assistant. Please try again.", steps, error: true };
    }
  });
}

export async function pollAgent(jobId: string): Promise<AgentPoll> {
  const job = jobs.get(jobId);
  if (!job) return { status: "missing" };
  if (!job.done || !job.result) return { status: "running", steps: job.steps };
  revalidatePath("/owner"); // reminders can refresh invoice statuses
  return { status: "done", reply: job.result };
}
