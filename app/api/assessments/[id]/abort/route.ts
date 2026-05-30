import { requireUser, unauthorized, ok, bad } from "@/lib/api";
import { abortAssessment } from "@/src/assessment/repo";
import { appendAudit } from "@/src/assessment/audit";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await params;
  if (!abortAssessment(id)) return bad("assessment not running", 409);
  appendAudit({ actor: u.email, action: "assess.abort", assessmentId: id });
  return ok({ ok: true });
}
