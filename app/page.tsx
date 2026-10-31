import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>RentRhythm</h1>
      <p>Payday-synced rent and meal billing for co-living spaces.</p>
      <p>
        <Link href="/owner">Owner dashboard →</Link>
      </p>
    </main>
  );
}
