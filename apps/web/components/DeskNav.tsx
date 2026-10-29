"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Pacts" },
  { href: "/verify", label: "Verify a certificate" },
  { href: "/merchant", label: "Sellers" },
  { href: "/principal", label: "Agent budgets" },
];

export function DeskNav() {
  const path = usePathname();
  return (
    <nav className="desk-nav" aria-label="Studio">
      {LINKS.map((l) => {
        const current = l.href === "/" ? path === "/" || path.startsWith("/pact") : path.startsWith(l.href);
        return (
          <a key={l.href} href={l.href} aria-current={current ? "page" : undefined}>
            {l.label}
          </a>
        );
      })}
    </nav>
  );
}
