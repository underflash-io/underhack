import { requireUser, unauthorized, ok } from "@/lib/api";
import { runCollector } from "@/src/agents/collector";
import { runTriage } from "@/src/agents/triage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const u = await requireUser();
  if (!u) return unauthorized();
  const collect = await runCollector();
  const triage = await runTriage();
  return ok({
    collected: collect.inserted,
    sources: collect.results,
    alerts: triage.alerts,
    processed: triage.processed,
  });
}
