import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { listSystems, createSystem } from "@/src/db/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  return ok({ systems: listSystems() });
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (!b.name || !String(b.name).trim()) return bad("name required");
  const row = createSystem({
    name: b.name,
    vendor: b.vendor,
    keywords: b.keywords,
    criticality: b.criticality,
    severityThreshold: b.severityThreshold,
  });
  return ok({ system: row });
}
