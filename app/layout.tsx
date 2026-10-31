import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RentRhythm",
  description: "Payday-synced rent and meal billing for co-living spaces",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 16 }}>{children}</body>
    </html>
  );
}
