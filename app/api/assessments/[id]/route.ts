import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { getAssessment } from "@/src/assessment/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await params;
  const job = getAssessment(id);
  if (!job) return bad("not found", 404);
  return ok({ assessment: job });
}
