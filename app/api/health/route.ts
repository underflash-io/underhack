import { NextResponse } from "next/server";
import { getDb } from "@/src/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    const r = getDb().prepare(`SELECT COUNT(*) as n FROM alerts`).get() as { n: number };
    return NextResponse.json({ status: "ok", alerts_indexed: r.n, ts: Date.now() });
  } catch (e) {
    return NextResponse.json({ status: "degraded", error: (e as Error).message }, { status: 503 });
  }
}
