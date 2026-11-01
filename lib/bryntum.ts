// Loads Bryntum Calendar from public/vendor/bryntum (copied there by scripts/copy-bryntum.mjs).
// The bundle is loaded at runtime rather than imported: the bundler can't process the 5 MB
// obfuscated trial build. Only types are imported from the package.
import type * as BryntumCalendar from "@bryntum/calendar";

declare global {
  interface Window {
    bryntum?: { calendar: typeof BryntumCalendar };
  }
}

const BASE = "/vendor/bryntum";
// All three are required: structure, exactly one theme, and the icon font.
const STYLESHEETS = ["calendar.css", "stockholm-light.css", "fontawesome/css/fontawesome.css", "fontawesome/css/solid.css"];

let loading: Promise<typeof BryntumCalendar> | null = null;

export function loadBryntumCalendar(): Promise<typeof BryntumCalendar> {
  if (window.bryntum?.calendar) return Promise.resolve(window.bryntum.calendar);
  loading ??= new Promise((resolve, reject) => {
    for (const href of STYLESHEETS) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `${BASE}/${href}`;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = `${BASE}/calendar.umd.js`;
    script.onload = () =>
      window.bryntum?.calendar ? resolve(window.bryntum.calendar) : reject(new Error("Bryntum did not load"));
    script.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the calendar library"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
