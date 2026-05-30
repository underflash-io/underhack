import { requireUser, unauthorized, ok } from "@/lib/api";
import { dashboardStats, listAlerts, recentRuns } from "@/src/db/repo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const severity = url.searchParams.get("severity") || undefined;
  return ok({
    stats: dashboardStats(),
    alerts: listAlerts({ status, severity, limit: 100 }),
    runs: recentRuns(8),
  });
}
