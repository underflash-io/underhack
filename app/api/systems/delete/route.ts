import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { deleteSystem } from "@/src/db/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (!b.id) return bad("id required");
  deleteSystem(b.id);
  return ok({ ok: true });
}
