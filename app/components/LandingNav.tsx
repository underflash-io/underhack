"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "./ThemeToggle";

// LandingNav is rendered only on the marketing surface (root + /docs).
// Keeps the bolder, more confident enterprise look isolated from the in-app
// operator chrome.
export default function LandingNav({ email }: { email?: string | null }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  return (
    <header className="landing-nav" data-menu-open={open ? "true" : "false"}>
      <div className="landing-nav-inner">
        <Link href="/" className="landing-brand" aria-label="Underhack home">
          <BrandMark />
          <span>Underhack</span>
        </Link>

        <nav className="landing-nav-links" aria-label="Marketing">
          <Link href="/#how">How it works</Link>
          <Link href="/#features">Features</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/docs/api">Docs</Link>
          <a
            href="https://github.com/underflash-io/underhack"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>

        <div className="landing-nav-cta">
          <ThemeToggle />
          {email ? (
            <Link href="/dashboard" className="ln-btn ln-btn-primary">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="ln-btn ln-btn-ghost">
                Sign in
              </Link>
              <Link href="/onboarding" className="ln-btn ln-btn-primary">
                Get started
              </Link>
            </>
          )}
        </div>

        <button
          ref={triggerRef}
          type="button"
          className="nav-toggle landing-nav-toggle"
          aria-expanded={open}
          aria-controls="landing-mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        </button>
      </div>

      <div
        id="landing-mobile-nav"
        className="mobile-nav landing-mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        hidden={!open}
      >
        <nav aria-label="Marketing mobile">
          <Link href="/#how" onClick={() => setOpen(false)}>How it works</Link>
          <Link href="/#features" onClick={() => setOpen(false)}>Features</Link>
          <Link href="/#pricing" onClick={() => setOpen(false)}>Pricing</Link>
          <Link href="/docs/api" onClick={() => setOpen(false)}>Docs</Link>
          <a
            href="https://github.com/underflash-io/underhack"
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
          >
            GitHub
          </a>
          <div className="mobile-nav-divider" />
          {email ? (
            <Link href="/dashboard" onClick={() => setOpen(false)}>
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" onClick={() => setOpen(false)}>Sign in</Link>
              <Link
                href="/onboarding"
                className="ln-btn ln-btn-primary"
                onClick={() => setOpen(false)}
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function BrandMark() {
  return (
    <svg
      className="brand-mark"
      width="22"
      height="22"
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
