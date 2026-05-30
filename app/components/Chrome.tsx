"use client";

import { usePathname } from "next/navigation";
import Nav from "./Nav";
import LandingNav from "./LandingNav";

// Picks landing vs in-app chrome at the client so client-side navigation
// between marketing and app routes swaps the header without a full reload.
export default function Chrome({ email }: { email: string | null }) {
  const path = usePathname() ?? "/";
  const marketing = path === "/" || path.startsWith("/docs");
  const login = path === "/login";

  if (login) return null;
  return marketing ? <LandingNav email={email} /> : <Nav email={email} />;
}
