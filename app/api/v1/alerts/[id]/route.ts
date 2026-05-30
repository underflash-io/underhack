import { type NextRequest } from "next/server";
import { authenticate, bandOut, errors, objectResponse, statusIn, statusOut } from "@/lib/api-v1";
import { getAlertById, setAlertStatus } from "@/src/db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function publicAlert(a: NonNullable<ReturnType<typeof getAlertById>>) {
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
    acknowledged_at: a.acknowledged_at ? new Date(a.acknowledged_at).toISOString() : null,
    resolved_at: a.resolved_at ? new Date(a.resolved_at).toISOString() : null,
    system: a.system_id ? { id: a.system_id, name: a.system_name } : null,
    apis_affected: apis,
    rationale: a.recommendation,
    source: { url: a.finding_url, external_id: a.external_id },
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = authenticate(req, "alerts:read");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const row = getAlertById(id);
  if (!row) return errors.notFound(`No alert with id ${id}`);
  return objectResponse(publicAlert(row));
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = authenticate(req, "alerts:write");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let body: { status?: string } = {};
  try {
    body = (await req.json()) as { status?: string };
  } catch {
    return errors.badRequest("Body must be JSON");
  }
  if (!body.status) return errors.badRequest("Field 'status' is required");
  const dbStatus = statusIn(body.status);
  if (!dbStatus) return errors.badRequest(`Unknown status '${body.status}'`);

  const existing = getAlertById(id);
  if (!existing) return errors.notFound(`No alert with id ${id}`);

  setAlertStatus(id, dbStatus);
  const updated = getAlertById(id);
  return objectResponse(publicAlert(updated!));
}
