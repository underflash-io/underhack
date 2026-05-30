"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/insights", label: "Insights" },
  { href: "/systems", label: "Systems" },
  { href: "/agents", label: "Agents" },
  { href: "/connectors", label: "Connectors" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/admin", label: "Admin" },
];

export default function Nav({ email }: { email?: string | null }) {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Esc closes the mobile menu and returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close the menu whenever the route changes (clicking a link).
  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <header className="topbar" data-menu-open={open ? "true" : "false"}>
      <Link href={email ? "/dashboard" : "/"} className="brand" aria-label="Underhack home">
        <BrandMark />
        <span className="brand-word">Underhack</span>
      </Link>

      <nav className="topbar-nav" aria-label="Primary">
        {LINKS.map((l) => {
          const active = path === l.href || path.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              className={active ? "active" : ""}
              aria-current={active ? "page" : undefined}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <span className="spacer" />

      <ThemeToggle />

      {email ? (
        <>
          <span className="acct" title={email} aria-label={`Signed in as ${email}`}>
            {email}
          </span>
          <a href="/auth/logout" className="acct acct-logout">
            Log out
          </a>
        </>
      ) : (
        <Link href="/login" className="acct acct-cta">
          Sign in
        </Link>
      )}

      <button
        ref={triggerRef}
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
      </button>

      {/* Mobile menu sheet — rendered into the topbar so the close button stays
          focusable; opens via data-menu-open, closes on link click + Esc. */}
      <div
        id="mobile-nav"
        className="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        hidden={!open}
      >
        <nav aria-label="Primary mobile">
          {LINKS.map((l) => {
            const active = path === l.href || path.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
              >
                {l.label}
              </Link>
            );
          })}
          <div className="mobile-nav-divider" />
          {email ? (
            <>
              <span className="mobile-nav-email">{email}</span>
              <a href="/auth/logout">Log out</a>
            </>
          ) : (
            <Link href="/login">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

// Inline mark so the brand can degrade to icon-only at <420px without an
// extra HTTP request. Stroke uses currentColor — picks up the theme.
function BrandMark() {
  return (
    <svg
      className="brand-mark"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      <path d="M3 5 L12 2 L21 5 L21 12 C21 17 17 21 12 22 C7 21 3 17 3 12 Z" />
      <path d="M8 12 L11 15 L16 9" />
    </svg>
  );
}
