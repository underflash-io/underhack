import { requireUser, unauthorized, ok } from "@/lib/api";
import { listFindings } from "@/src/assessment/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await params;
  return ok({ findings: listFindings(id) });
}
