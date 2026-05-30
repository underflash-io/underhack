import { NextResponse, type NextRequest } from "next/server";
import {
  authenticatePassword,
  createSession,
  serializeSessionCookie,
} from "@/src/services/auth";

export async function POST(req: NextRequest) {
  let email = "";
  let password = "";
  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    email = String(body.email ?? "");
    password = String(body.password ?? "");
  } else {
    const form = await req.formData();
    email = String(form.get("email") ?? "");
    password = String(form.get("password") ?? "");
  }

  const user = authenticatePassword(email, password);
  if (!user) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }
  const token = createSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", serializeSessionCookie(token));
  return res;
}
