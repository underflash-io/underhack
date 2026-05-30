import { NextResponse, type NextRequest } from "next/server";
import {
  parseCookies,
  sessionCookieName,
  deleteSession,
  clearSessionCookie,
} from "@/src/services/auth";

export async function GET(req: NextRequest) {
  const cookies = parseCookies(req.headers.get("cookie"));
  const token = cookies[sessionCookieName];
  if (token) deleteSession(token);
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.headers.set("Set-Cookie", clearSessionCookie());
  return res;
}
