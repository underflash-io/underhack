import { requireUser, unauthorized, ok } from "@/lib/api";
import { listAudit, verifyAuditChain } from "@/src/assessment/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  return ok({ chain: verifyAuditChain(), entries: listAudit(200) });
}
