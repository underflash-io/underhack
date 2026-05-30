import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { verifyAuthorization, getAuthorization, challengeFor } from "@/src/assessment/authz";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await params;
  const result = await verifyAuthorization(id, u.email);
  const authz = getAuthorization(id);
  if (!authz) return bad("not found", 404);
  return ok({ result, authorization: authz, challenge: challengeFor(authz) });
}
