"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/systems", label: "Systems" },
  { href: "/agents", label: "Agents" },
  { href: "/assess", label: "Assess" },
  { href: "/connectors", label: "Connectors" },
  { href: "/chat", label: "Chat" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/admin", label: "Admin" },
];

const MARKETING_PATHS = new Set(["/", "/docs", "/docs/api"]);

export default function Nav({ email }: { email: string | null }) {
  const path = usePathname() ?? "";
  if (path === "/login") return null;
  // Marketing pages have their own header.
  if (!email && MARKETING_PATHS.has(path)) return null;
  if (!email && path.startsWith("/docs")) return null;

  return (
    <header className="topbar">
      <Link href={email ? "/dashboard" : "/"} className="brand">
        under<span className="dot">·</span>hack
      </Link>
      <nav>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={path === l.href ? "active" : ""}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <span className="spacer" />
      <ThemeToggle />
      {email && <span className="acct">{email}</span>}
      {email ? (
        <a href="/auth/logout" className="acct">
          Log out
        </a>
      ) : (
        <Link href="/login" className="acct">
          Log in
        </Link>
      )}
    </header>
  );
}
