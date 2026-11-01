import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p className="muted">That page doesn&apos;t exist, or the invoice isn&apos;t one RentRhythm sent.</p>
      <p>
        <Link href="/">Back to the start →</Link>
      </p>
    </main>
  );
}
