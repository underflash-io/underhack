import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { deleteConnector, getConnector, updateConnector, toPublic } from "@/src/connectors/repo";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await params;
  if (!getConnector(id)) return bad("not found", 404);
  deleteConnector(id);
  return ok({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await params;
  const cur = getConnector(id);
  if (!cur) return bad("not found", 404);
  const b = await req.json().catch(() => ({}));
  updateConnector(id, {
    name: typeof b.name === "string" ? b.name : undefined,
    enabled: typeof b.enabled === "boolean" ? b.enabled : undefined,
    minSeverity: ["low", "medium", "high", "critical"].includes(b.minSeverity)
      ? b.minSeverity
      : undefined,
    config: b.config && typeof b.config === "object" ? b.config : undefined,
  });
  const updated = getConnector(id);
  return ok({ connector: updated ? toPublic(updated) : null });
}
