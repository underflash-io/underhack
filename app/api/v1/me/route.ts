import { type NextRequest } from "next/server";
import { authenticate, objectResponse } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const auth = authenticate(req);
  if (!auth.ok) return auth.response;
  const { key, scopes } = auth;
  return objectResponse({
    id: key.id,
    label: key.label,
    prefix: key.prefix,
    scopes: Array.from(scopes),
    created_at: new Date(key.created_at).toISOString(),
    last_used_at: key.last_used_at ? new Date(key.last_used_at).toISOString() : null,
  });
}
