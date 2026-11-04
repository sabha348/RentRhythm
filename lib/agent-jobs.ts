import { randomUUID } from "node:crypto";

// Render's free proxy cuts any request off after ~30 s, but a Gemini run with tool calls can take a minute.
// So the chat starts a job (returns at once) and polls it; each poll is a short request.
// Jobs live in memory: Render runs one long-lived instance, and a lost job after a restart just shows an error.

export type JobState<S, R> = { steps: S[]; done: boolean; result?: R; startedAt: number };

const JOB_TTL_MS = 10 * 60_000;

export function createJobStore<S, R>(now: () => number = Date.now) {
  const jobs = new Map<string, JobState<S, R>>();

  function sweep() {
    const cutoff = now() - JOB_TTL_MS;
    for (const [id, job] of jobs) if (job.startedAt < cutoff) jobs.delete(id);
  }

  return {
    /** Starts `work` in the background and returns the job id immediately. `work` must not throw. */
    start(work: (onStep: (step: S) => void) => Promise<R>): string {
      sweep();
      const id = randomUUID();
      const job: JobState<S, R> = { steps: [], done: false, startedAt: now() };
      jobs.set(id, job);
      void work((step) => job.steps.push(step)).then((result) => {
        job.result = result;
        job.done = true;
      });
      return id;
    },
    get(id: string): JobState<S, R> | undefined {
      const job = jobs.get(id);
      if (job?.done) jobs.delete(id); // a finished job is read once
      return job && { ...job, steps: [...job.steps] };
    },
  };
}
