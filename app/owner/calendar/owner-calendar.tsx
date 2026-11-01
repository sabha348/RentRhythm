"use client";

import { useEffect, useRef, useState } from "react";
import type { Calendar } from "@bryntum/calendar";
import { loadBryntumCalendar } from "@/lib/bryntum";

export default function OwnerCalendar() {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let calendar: Calendar | undefined;
    let cancelled = false;
    loadBryntumCalendar()
      .then(({ Calendar }) => {
        if (cancelled || !container.current) return;
        calendar = new Calendar({
          appendTo: container.current,
          date: new Date(2026, 10, 1),
          mode: "month",
          readOnly: true,
          resources: [{ id: 1, name: "Aarav Mehta", eventColor: "blue" }],
          events: [{ id: 1, resourceId: 1, name: "Aarav · $358 · payday 1st", startDate: "2026-11-03", endDate: "2026-11-04", allDay: true }],
        });
      })
      .catch((err: Error) => setError(err.message));
    return () => {
      cancelled = true;
      calendar?.destroy();
    };
  }, []);

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  return <div ref={container} style={{ height: "100%" }} />;
}
