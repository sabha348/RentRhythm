"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p className="muted">The page couldn&apos;t load. If the server was asleep it may just need another moment.</p>
      <button type="button" className="primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
