import { requireUser, unauthorized, ok } from "@/lib/api";
import { recentRuns } from "@/src/db/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  return ok({ runs: recentRuns(40) });
}
