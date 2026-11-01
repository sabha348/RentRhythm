"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const OWNER_LINKS = [
  { href: "/owner", label: "Bills" },
  { href: "/owner/calendar", label: "Calendar" },
  { href: "/owner/agent", label: "Assistant" },
  { href: "/cook", label: "Kitchen" },
  { href: "/vote", label: "Meal vote" },
];

function isActive(pathname: string, href: string) {
  return href === "/owner" ? pathname === "/owner" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  // The desk screen is full-screen for a tablet at the front desk.
  if (pathname.startsWith("/desk")) return null;
  // Tenants vote from their phones; they don't need the owner's pages.
  const tenantView = pathname.startsWith("/vote");

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={tenantView ? "/vote" : "/"} className="brand">
          Rent<span>Rhythm</span>
        </Link>
        {tenantView ? (
          <span className="context">Sunrise Co-Living · meals</span>
        ) : (
          <nav className="site-nav" aria-label="Main">
            {OWNER_LINKS.map((l) => (
              <Link key={l.href} href={l.href} aria-current={isActive(pathname, l.href) ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
