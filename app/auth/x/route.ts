import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl } from "@/src/services/oauth";
import { createSession, serializeSessionCookie } from "@/src/services/auth";
import { demoUser } from "@/lib/oauth-resolve";

export async function GET(req: NextRequest) {
  const url = buildAuthUrl("x");
  if (url) return NextResponse.redirect(url);

  // Demo fallback: no real X app configured — sign in as base admin.
  const user = demoUser();
  if (!user) return NextResponse.redirect(new URL("/login?e=no_admin", req.url));
  const token = createSession(user.id);
  const res = NextResponse.redirect(new URL("/", req.url));
  res.headers.set("Set-Cookie", serializeSessionCookie(token));
  return res;
}
