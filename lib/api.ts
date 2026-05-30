import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import type { PublicUser } from "@/src/services/auth";

// Validates the session for API route handlers. Middleware only checks cookie
// presence at the edge; this confirms the session is real.
export async function requireUser(): Promise<PublicUser | null> {
  return currentUser();
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function ok(data: unknown) {
  return NextResponse.json(data);
}

export function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}
