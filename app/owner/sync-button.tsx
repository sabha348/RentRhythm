"use client";

import { useState, useTransition } from "react";
import { syncAction } from "./actions";

export function SyncButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <p style={{ color: "#555" }}>
      Payments arrive automatically from PayPal.{" "}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setMessage(await syncAction()))}
      >
        {pending ? "Syncing…" : "Sync from PayPal"}
      </button>{" "}
      {message}
    </p>
  );
}
