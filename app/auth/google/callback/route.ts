import { NextResponse, type NextRequest } from "next/server";
import { handleCallback } from "@/src/services/oauth";
import { createSession, serializeSessionCookie } from "@/src/services/auth";
import { resolveOAuthUser } from "@/lib/oauth-resolve";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/login?e=oauth_cancelled", req.url));
  }
  try {
    const profile = await handleCallback("google", code, state);
    const user = resolveOAuthUser("google", profile);
    if (!user) {
      return NextResponse.redirect(new URL("/login?e=not_provisioned", req.url));
    }
    const token = createSession(user.id);
    const res = NextResponse.redirect(new URL("/", req.url));
    res.headers.set("Set-Cookie", serializeSessionCookie(token));
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login?e=oauth_failed", req.url));
  }
}
