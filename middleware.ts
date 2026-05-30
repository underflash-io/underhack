import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "underhack_sess";

// Pages that don't require a session cookie. The landing page, docs, and v1
// API are all public; v1 endpoints do their own Bearer-token auth.
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/docs",
  "/docs/api",
]);

const PUBLIC_PREFIXES = [
  "/auth/",
  "/api/auth/",
  "/api/v1/",
  "/api/health",
  "/docs/",
];

// Edge runtime can't reach SQLite, so this only checks for the *presence* of a
// session cookie. Full validation happens in pages/route handlers via currentUser().
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Gate everything except Next internals, the login page asset, and favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
