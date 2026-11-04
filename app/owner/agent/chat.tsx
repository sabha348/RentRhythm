"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { AgentStep } from "@/lib/agent";
import { pollAgent, startAgent, type ChatMessage } from "./actions";

const POLL_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SUGGESTIONS = [
  "Who's due this week? Remind anyone whose payday has passed.",
  "Who are my repeat late payers?",
  "Which bills are still unpaid?",
];

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [liveSteps, setLiveSteps] = useState<AgentStep[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect must not return one.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending, liveSteps]);

  function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const history: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(history);
    setInput("");
    startTransition(async () => {
      setLiveSteps([]);
      const reply = await waitForReply(history);
      setLiveSteps([]);
      setMessages((m) => [...m, reply]);
    });
  }

  // Each request stays short (Render's proxy drops ones over ~30 s): start a job, then poll it.
  async function waitForReply(history: ChatMessage[]): Promise<ChatMessage> {
    const failed = (content: string): ChatMessage => ({ role: "assistant", content, error: true });
    try {
      const jobId = await startAgent(history);
      for (let misses = 0; ; ) {
        await sleep(POLL_MS);
        let poll;
        try {
          poll = await pollAgent(jobId);
          misses = 0;
        } catch {
          if (++misses >= 5) return failed("Lost touch with the server. Please try again.");
          continue;
        }
        if (poll.status === "done") return poll.reply;
        if (poll.status === "missing") return failed("The server restarted while the assistant was working. Please try again.");
        setLiveSteps(poll.steps);
      }
    } catch {
      return failed("Couldn't reach the assistant. Please try again.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {messages.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid #c7d2fe", background: "#eef2ff", cursor: "pointer" }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {messages.map((m, i) =>
        m.role === "user" ? (
          <div key={i} style={{ justifySelf: "end", maxWidth: "85%", background: "#1d4ed8", color: "#fff", padding: "8px 12px", borderRadius: 12 }}>
            {m.content}
          </div>
        ) : (
          <div key={i} data-testid="agent-reply" style={{ maxWidth: "95%", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: m.error ? "#fef2f2" : "#fff" }}>
            {m.steps && m.steps.length > 0 && (
              <ol style={{ margin: "0 0 10px", paddingLeft: 20, color: "#374151", fontSize: 14 }} aria-label="What the assistant did">
                {m.steps.map((s, j) => (
                  <li key={j} style={{ color: s.ok ? undefined : "#b45309" }}>
                    {s.ok ? "✓" : "⚠"} {s.summary}
                  </li>
                ))}
              </ol>
            )}
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{m.content}</div>
          </div>
        ),
      )}

      {pending && (
        <div style={{ color: "#6b7280" }}>
          {liveSteps.length > 0 && (
            <ol style={{ margin: "0 0 6px", paddingLeft: 20, fontSize: 14 }}>
              {liveSteps.map((s, j) => (
                <li key={j}>
                  {s.ok ? "✓" : "⚠"} {s.summary}
                </li>
              ))}
            </ol>
          )}
          <p style={{ margin: 0 }}>Checking paydays and invoices…</p>
        </div>
      )}
      <div ref={bottom} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        style={{ display: "flex", gap: 8, position: "sticky", bottom: 0, background: "#fff", padding: "8px 0" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about rent, due dates or reminders…"
          aria-label="Message the collections assistant"
          disabled={pending}
          style={{ flex: 1, fontSize: 16, padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc" }}
        />
        <button type="submit" disabled={pending || !input.trim()} style={{ fontSize: 16, padding: "10px 16px", borderRadius: 10 }}>
          Send
        </button>
      </form>
    </div>
  );
}
