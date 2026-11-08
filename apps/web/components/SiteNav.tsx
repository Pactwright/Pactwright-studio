"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.JSX.Element;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/pacts",
    label: "Ledger",
    icon: ({ className }) => (
      <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="9" x2="9" y2="21" />
      </svg>
    ),
  },
  {
    href: "/verify",
    label: "Verify",
    icon: ({ className }) => (
      <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/merchant",
    label: "Sellers",
    icon: ({ className }) => (
      <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9h18l-1.5-5H4.5L3 9Z" />
        <path d="M5 9v10h14V9" />
        <path d="M10 19v-5h4v5" />
      </svg>
    ),
  },
  {
    href: "/principal",
    label: "Budgets",
    icon: ({ className }) => (
      <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M7 7V5h10v2" />
        <path d="M3 12h18" />
      </svg>
    ),
  },
  {
    href: "/#faq",
    label: "Q&A",
    icon: ({ className }) => (
      <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
        <path d="M12 8.5a2 2 0 1 0-2.2 2v1.2" />
        <line x1="12" y1="14" x2="12" y2="14.01" />
      </svg>
    ),
  },
];

export function SiteNav() {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [path]);

  // Prevent background scroll when mobile navigation is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const isCurrent = (href: string) => {
    if (href.startsWith("/#")) return false;
    if (href === "/pacts") return path === "/pacts" || path === "/" || path.startsWith("/pact");
    return path === href || path.startsWith(`${href}/`);
  };

  return (
    <>
      <nav className="site-nav desktop-nav" aria-label="Studio sections">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isCurrent(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              className={`nav-link ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="nav-icon" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      <a className="cta cta--nav" href="/#simulator">
        Run a settlement
      </a>

      <button
        type="button"
        className="mobile-nav-toggle"
        aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={mobileOpen}
        aria-controls="mobile-nav-content"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <span className={`hamburger-bar ${mobileOpen ? "bar-1-open" : ""}`} />
        <span className={`hamburger-bar ${mobileOpen ? "bar-2-open" : ""}`} />
        <span className={`hamburger-bar ${mobileOpen ? "bar-3-open" : ""}`} />
      </button>

      {mobileOpen && (
        <div className="mobile-nav-drawer" role="dialog" aria-modal="true" aria-label="Site navigation">
          <div className="mobile-nav-backdrop" onClick={() => setMobileOpen(false)} />
          <nav className="mobile-nav-content" id="mobile-nav-content" aria-label="Studio sections">
            <div className="mobile-nav-header">
              <span className="mobile-nav-title">Menu</span>
              <button
                type="button"
                className="mobile-nav-close"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
            <div className="mobile-nav-links">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isCurrent(item.href);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`mobile-nav-link ${active ? "is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                  >
                    <div className="mobile-nav-link-left">
                      <Icon className="nav-icon" />
                      <span>{item.label}</span>
                    </div>
                  </a>
                );
              })}
            </div>
            <div className="mobile-nav-footer">
              <a href="/#simulator" className="cta mobile-cta" onClick={() => setMobileOpen(false)}>
                Run a settlement
              </a>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
