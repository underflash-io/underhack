import { NextResponse } from "next/server";
import { isConfigured } from "@/src/services/oauth";

// Public: the login page uses this to show demo-mode hints. No secrets.
export async function GET() {
  return NextResponse.json({
    google: isConfigured("google"),
    x: isConfigured("x"),
  });
}
