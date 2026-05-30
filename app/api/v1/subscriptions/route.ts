// Webhook subscriptions. Public alias for webhook_subscriptions, scoped to
// the calling API key. The spec calls these "subscriptions" — we keep
// /api/v1/webhooks as a thin alias so older clients keep working.

import { type NextRequest } from "next/server";
import {
  authenticate,
  errors,
  listResponse,
  objectResponse,
} from "@/lib/api-v1";
import {
  createWebhook,
  deleteWebhook,
  listWebhooksForKey,
} from "@/src/db/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toPublic(w: ReturnType<typeof listWebhooksForKey>[number]) {
  return {
    id: w.id,
    url: w.url,
    min_severity:
      w.min_severity === "medium" ? "low" : w.min_severity, // mirror band fold
    enabled: !!w.enabled,
    created_at: new Date(w.created_at).toISOString(),
    last_delivered_at: w.last_delivered_at
      ? new Date(w.last_delivered_at).toISOString()
      : null,
    last_status: w.last_status,
  };
}

export function GET(req: NextRequest) {
  const auth = authenticate(req, "webhooks:read");
  if (!auth.ok) return auth.response;
  const rows = listWebhooksForKey(auth.key.id).map(toPublic);
  return listResponse(rows, null);
}

export async function POST(req: NextRequest) {
  const auth = authenticate(req, "webhooks:write");
  if (!auth.ok) return auth.response;

  type Body = {
    url?: string;
    min_severity?: "info" | "low" | "high" | "critical";
  };
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return errors.badRequest("Body must be JSON");
  }
  if (!body.url) return errors.badRequest("Field 'url' is required");
  try {
    const u = new URL(body.url);
    if (!/^https?:$/.test(u.protocol)) {
      return errors.badRequest("URL must be http(s)");
    }
  } catch {
    return errors.badRequest("URL is not valid");
  }

  const band = body.min_severity ?? "high";
  // Map public band → DB severity. Public 'low' covers DB medium+low.
  // Public 'info' is mapped to 'low' since the schema only supports
  // low/medium/high/critical.
  const dbSeverity: "low" | "medium" | "high" | "critical" =
    band === "critical" ? "critical" : band === "high" ? "high" : "low";

  const row = createWebhook({
    apiKeyId: auth.key.id,
    url: body.url,
    minSeverity: dbSeverity,
  });
  // The signing secret is shown ONCE, like an API key.
  return objectResponse(
    { ...toPublic(row), secret: row.secret },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest) {
  const auth = authenticate(req, "webhooks:write");
  if (!auth.ok) return auth.response;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return errors.badRequest("Query param 'id' is required");
  const deleted = deleteWebhook(id, auth.key.id);
  if (!deleted) return errors.notFound(`No subscription with id ${id}`);
  return new Response(null, { status: 204 });
}
