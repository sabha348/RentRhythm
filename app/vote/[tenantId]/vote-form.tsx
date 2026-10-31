"use client";

import { useState, useTransition } from "react";
import { voteAction } from "../actions";

const MEALS = [
  { meal: "lunch", label: "Lunch" },
  { meal: "dinner", label: "Dinner" },
] as const;

type Votes = Record<string, boolean | undefined>;

export function VoteForm({
  tenantId,
  date,
  initialVotes,
  open,
}: {
  tenantId: number;
  date: string;
  initialVotes: Votes;
  open: boolean;
}) {
  const [votes, setVotes] = useState<Votes>(initialVotes);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function vote(meal: string, going: boolean) {
    const previous = votes;
    setVotes({ ...votes, [meal]: going }); // optimistic
    setError(null);
    startTransition(async () => {
      const result = await voteAction(tenantId, date, meal, going);
      if (result.ok) setVotes(result.votes);
      else {
        setVotes(previous);
        setError(result.message);
      }
    });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {MEALS.map(({ meal, label }) => {
        const current = votes[meal];
        return (
          <section key={meal} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: 18 }}>{label}</strong>
              <span style={{ color: current === undefined ? "#b45309" : "#555" }} aria-live="polite">
                {current === undefined ? "Not voted yet" : current ? "You're eating" : "You're skipping"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Choice selected={current === true} disabled={!open || pending} onClick={() => vote(meal, true)} tone="yes">
                ✅ Going
              </Choice>
              <Choice selected={current === false} disabled={!open || pending} onClick={() => vote(meal, false)} tone="no">
                ❌ Not going
              </Choice>
            </div>
          </section>
        );
      })}
      {error && (
        <p role="alert" style={{ color: "crimson", margin: 0 }}>
          {error}. Refresh the page to see the current day.
        </p>
      )}
    </div>
  );
}

function Choice({
  selected,
  disabled,
  onClick,
  tone,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  tone: "yes" | "no";
  children: React.ReactNode;
}) {
  const color = tone === "yes" ? "#15803d" : "#b91c1c";
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "14px 8px",
        fontSize: 17,
        borderRadius: 10,
        border: `2px solid ${selected ? color : "#ccc"}`,
        background: selected ? (tone === "yes" ? "#dcfce7" : "#fee2e2") : "#fff",
        color: "#111",
        fontWeight: selected ? 600 : 400,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled && !selected ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}
