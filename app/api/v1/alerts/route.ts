import { type NextRequest } from "next/server";
import {
  authenticate,
  bandFilterToDb,
  bandOut,
  clampLimit,
  decodeCursor,
  encodeCursor,
  errors,
  listResponse,
  statusIn,
  statusOut,
} from "@/lib/api-v1";
import { listAlertsPaged } from "@/src/db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Map a single DB alert row to the public API shape.
function toPublicAlert(a: Awaited<ReturnType<typeof listAlertsPaged>>[number]) {
  let apis: string[] = [];
  try {
    if (a.affected_apis) apis = JSON.parse(a.affected_apis);
  } catch {
    apis = [];
  }
  return {
    id: a.id,
    title: a.title,
    summary: a.summary,
    severity: bandOut(a.severity),
    confidence: a.confidence,
    status: statusOut(a.status),
    created_at: new Date(a.created_at).toISOString(),
    system: a.system_id
      ? { id: a.system_id, name: a.system_name }
      : null,
    apis_affected: apis,
    rationale: a.recommendation,
    source: {
      url: a.finding_url,
      external_id: a.external_id,
    },
  };
}

export function GET(req: NextRequest) {
  const auth = authenticate(req, "alerts:read");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"), 25, 100);
  const severityParam = url.searchParams.get("severity");
  const statusParam = url.searchParams.get("status");
  const sinceParam = url.searchParams.get("since");

  // Severity: accept comma-separated bands. Translate each to its DB severities.
  let dbSeverities: string[] | null = null;
  if (severityParam) {
    const bands = severityParam.split(",").map((s) => s.trim()).filter(Boolean);
    const mapped = bands.flatMap((b) => bandFilterToDb(b) ?? []);
    if (!mapped.length) {
      return errors.badRequest(`Unknown severity: ${severityParam}`);
    }
    dbSeverities = Array.from(new Set(mapped));
  }

  // Status: map public → DB.
  let dbStatus: string | null = null;
  if (statusParam && statusParam !== "all") {
    const mapped = statusIn(statusParam);
    if (!mapped) return errors.badRequest(`Unknown status: ${statusParam}`);
    dbStatus = mapped;
  }

  // `since` accepts ISO 8601 timestamps. We compare lexically against the
  // TEXT-encoded created_at column.
  let since: string | null = null;
  if (sinceParam) {
    const t = Date.parse(sinceParam);
    if (Number.isNaN(t)) return errors.badRequest("Invalid 'since' timestamp");
    since = new Date(t).toISOString();
  }

  const cursor = decodeCursor(url.searchParams.get("cursor"));

  // Fetch one extra row to know if a next page exists.
  const rows = listAlertsPaged({
    status: dbStatus,
    severities: dbSeverities,
    since,
    cursor,
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;

  return listResponse(page.map(toPublicAlert), nextCursor);
}
