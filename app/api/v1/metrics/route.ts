import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticate, errors } from "@/lib/api-v1";
import { getMetricsSnapshot, type MetricsRange } from "@/src/services/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_RANGES: MetricsRange[] = ["24h", "7d", "30d", "90d"];

export function GET(req: NextRequest) {
  const auth = authenticate(req, "metrics:read");
  if (!auth.ok) return auth.response;

  const rangeParam = new URL(req.url).searchParams.get("range") || "30d";
  if (!VALID_RANGES.includes(rangeParam as MetricsRange)) {
    return errors.badRequest(
      `range must be one of: ${VALID_RANGES.join(", ")}`,
    );
  }

  const snapshot = getMetricsSnapshot(rangeParam as MetricsRange);
  return NextResponse.json(snapshot);
}
