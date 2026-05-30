import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { deleteUser } from "@/src/services/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (!b.id) return bad("id required");
  try {
    deleteUser(b.id);
    return ok({ ok: true });
  } catch (err) {
    return bad((err as Error).message);
  }
}
