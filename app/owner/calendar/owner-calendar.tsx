"use client";

import { useEffect, useRef, useState } from "react";
import type { Calendar, EventModel } from "@bryntum/calendar";
import type { CalendarData, CalendarEvent } from "@/lib/calendar";
import { loadBryntumCalendar } from "@/lib/bryntum";

type Props = CalendarData & { today: string };

export default function OwnerCalendar({ today, resources, events }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let calendar: Calendar | undefined;
    let cancelled = false;
    loadBryntumCalendar()
      .then(({ Calendar, StringHelper }) => {
        if (cancelled || !container.current) return;
        const enc = (s: string) => StringHelper.encodeHtml(s);
        // Our extra `details` field isn't a declared model field; read it from the record's raw data.
        const details = (r: EventModel) =>
          (r as unknown as { get(field: string): CalendarEvent["details"] | undefined }).get("details");
        calendar = new Calendar({
          appendTo: container.current,
          date: new Date(`${today}T00:00:00`),
          mode: "month",
          readOnly: true,
          resources,
          events,
          features: {
            eventEdit: false, // read-only calendar: no editor
            eventTooltip: {
              showOn: "click",
              tooltip: { tools: { edit: { hidden: true }, delete: { hidden: true } } }, // read-only: no pencil/bin
              titleRenderer: (r: EventModel) => enc(details(r)?.title ?? r.name),
              renderer: (({ eventRecord }: { eventRecord: EventModel }) => {
                const d = details(eventRecord);
                if (!d) return enc(eventRecord.name);
                const lines = d.lines.map((l) => `<div>${enc(l)}</div>`).join("");
                const link = d.link ? `<div style="margin-top:8px"><a href="${enc(d.link.href)}">${enc(d.link.label)} →</a></div>` : "";
                return lines + link;
              }) as never,
            },
          },
        });
      })
      .catch((err: Error) => setError(err.message));
    return () => {
      cancelled = true;
      calendar?.destroy();
    };
    // Built once per mount; live updates come in step 4.3.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  return <div ref={container} style={{ height: "100%" }} />;
}
