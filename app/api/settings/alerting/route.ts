import { requireUser, unauthorized, ok } from "@/lib/api";
import { setAlerting, maskedSettings } from "@/src/services/settings";
import type { Severity } from "@/src/services/settings";

export const dynamic = "force-dynamic";

const SEV = ["low", "medium", "high", "critical"];

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));
  setAlerting({
    pollIntervalSec:
      typeof b.pollIntervalSec === "number" ? b.pollIntervalSec : undefined,
    defaultSeverityThreshold: SEV.includes(b.defaultSeverityThreshold)
      ? (b.defaultSeverityThreshold as Severity)
      : undefined,
    slackWebhook: typeof b.slackWebhook === "string" ? b.slackWebhook : undefined,
    genericWebhook:
      typeof b.genericWebhook === "string" ? b.genericWebhook : undefined,
  });
  return ok(maskedSettings());
}
