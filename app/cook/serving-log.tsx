"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { ServingList } from "@/lib/meals";
import { logAttendanceAction } from "./actions";

export function ServingLog({ date, meal, label, list }: { date: string; meal: string; label: string; list: ServingList }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [walkIn, setWalkIn] = useState("");
  // Ticks show immediately; the server-rendered list replaces them once the save lands.
  const [voters, setVoterOptimistic] = useOptimistic(list.voters, (state, update: { tenantId: number; ate: boolean }) =>
    state.map((v) => (v.tenantId === update.tenantId ? { ...v, ate: update.ate, logged: true } : v)),
  );

  function save(entries: { tenantId: number; ate: boolean }[]) {
    setError(null);
    startTransition(async () => {
      entries.forEach(setVoterOptimistic);
      const result = await logAttendanceAction(entries, date, meal);
      if (!result.ok) setError(result.message);
    });
  }

  const served = voters.filter((v) => v.ate).length + list.walkIns.length;
  const unconfirmed = voters.filter((v) => !v.logged);

  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, opacity: pending ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>{label}</h3>
        <span>
          Served <strong>{served}</strong> · {list.walkIns.length} walk-in{list.walkIns.length === 1 ? "" : "s"}
        </span>
      </div>

      <p style={{ margin: "10px 0 4px", color: "#555", fontSize: 14 }}>Voted going (untick no-shows)</p>
      {voters.length === 0 && <p style={{ margin: 0, color: "#888" }}>No one voted for this meal.</p>}
      {voters.map((v) => (
        <label key={v.tenantId} style={{ display: "flex", gap: 10, padding: "6px 0", fontSize: 17 }}>
          <input
            type="checkbox"
            checked={v.ate}
            disabled={pending}
            onChange={(e) => save([{ tenantId: v.tenantId, ate: e.target.checked }])}
            style={{ width: 20, height: 20 }}
          />
          {v.name}
          {v.room && <span style={{ color: "#888" }}>· {v.room}</span>}
          {!v.ate && <span style={{ color: "#b91c1c" }}>no-show</span>}
        </label>
      ))}
      {unconfirmed.length > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => save(unconfirmed.map((v) => ({ tenantId: v.tenantId, ate: true })))}
          style={{ marginTop: 4 }}
        >
          Confirm {unconfirmed.length} voter{unconfirmed.length === 1 ? "" : "s"} served
        </button>
      )}

      <p style={{ margin: "12px 0 4px", color: "#555", fontSize: 14 }}>Walk-ins (ate without voting, billed at walk-in price)</p>
      {list.walkIns.map((w) => (
        <div key={w.tenantId} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 17 }}>
          <span>
            🚶 {w.name} {w.room && <span style={{ color: "#888" }}>· {w.room}</span>}
          </span>
          <button type="button" disabled={pending} onClick={() => save([{ tenantId: w.tenantId, ate: false }])}>
            Remove
          </button>
        </div>
      ))}
      {list.others.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!walkIn) return;
            save([{ tenantId: Number(walkIn), ate: true }]);
            setWalkIn("");
          }}
          style={{ display: "flex", gap: 8, marginTop: 6 }}
        >
          <select
            value={walkIn}
            onChange={(e) => setWalkIn(e.target.value)}
            disabled={pending}
            aria-label={`Walk-in for ${label}`}
            style={{ flex: 1, fontSize: 16, padding: 8 }}
          >
            <option value="">Choose a tenant…</option>
            {list.others.map((o) => (
              <option key={o.tenantId} value={o.tenantId}>
                {o.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={pending || !walkIn} style={{ fontSize: 16, padding: "8px 12px" }}>
            + Walk-in
          </button>
        </form>
      )}
      {error && (
        <p role="alert" style={{ color: "crimson", marginBottom: 0 }}>
          {error}
        </p>
      )}
    </section>
  );
}
