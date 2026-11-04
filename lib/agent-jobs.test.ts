import { describe, expect, it } from "vitest";
import { createJobStore } from "./agent-jobs";

describe("agent job store", () => {
  it("returns an id at once, reports steps while running, then the result once", async () => {
    const store = createJobStore<string, string>();
    let finish!: () => void;
    const gate = new Promise<void>((r) => (finish = r));
    const id = store.start(async (onStep) => {
      onStep("checked tenants");
      await gate;
      onStep("sent reminder");
      return "done";
    });
    expect(store.get(id)).toMatchObject({ done: false, steps: ["checked tenants"] });
    finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.get(id)).toMatchObject({ done: true, result: "done", steps: ["checked tenants", "sent reminder"] });
    expect(store.get(id)).toBeUndefined();
  });

  it("forgets unknown and expired jobs", () => {
    let t = 0;
    const store = createJobStore<string, string>(() => t);
    const id = store.start(() => new Promise(() => {}));
    expect(store.get("nope")).toBeUndefined();
    t = 11 * 60_000;
    store.start(() => new Promise(() => {})); // sweeps on start
    expect(store.get(id)).toBeUndefined();
  });
});
