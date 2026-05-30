import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { getAuthorization, revokeAuthorization, challengeFor } from "@/src/assessment/authz";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await params;
  const authz = getAuthorization(id);
  if (!authz) return bad("not found", 404);
  return ok({ authorization: authz, challenge: challengeFor(authz) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await params;
  const okFlag = revokeAuthorization(id, u.email);
  if (!okFlag) return bad("not found", 404);
  return ok({ ok: true });
}
