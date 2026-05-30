import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { updateSystem } from "@/src/db/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (!b.id) return bad("id required");
  updateSystem(b.id, {
    name: b.name,
    vendor: b.vendor,
    keywords: b.keywords,
    criticality: b.criticality,
    severityThreshold: b.severityThreshold,
    enabled: b.enabled,
  });
  return ok({ ok: true });
}
