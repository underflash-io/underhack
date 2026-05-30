import { SEVERITY_RANK } from "../db/repo";
import { listConnectors, getRawConfig, markSendResult, getConnector } from "./repo";
import { sendSlack } from "./slack";
import { sendEmail } from "./email";
import type { Notification, SendResult, SlackConfig, EmailConfig } from "./types";

const SEV_RANK: Record<string, number> = { ...SEVERITY_RANK, info: 0 };

async function sendOne(
  connectorId: string,
  kind: string,
  cfg: unknown,
  n: Notification
): Promise<SendResult> {
  if (kind === "slack") return sendSlack(cfg as SlackConfig, n);
  if (kind === "email") return sendEmail(cfg as EmailConfig, n);
  return { ok: false, detail: `unknown connector kind: ${kind}` };
}

// Fan out a notification to every enabled connector whose severity threshold
// is satisfied. Best-effort: per-connector errors never throw to the caller.
export async function dispatchNotification(n: Notification): Promise<void> {
  const sev = SEV_RANK[n.severity] ?? 0;
  const all = listConnectors().filter((c) => c.enabled);
  const tasks = all
    .filter((c) => sev >= (SEV_RANK[c.min_severity] ?? 0))
    .map(async (c) => {
      try {
        const res = await sendOne(c.id, c.kind, getRawConfig(c), n);
        markSendResult(c.id, res.ok, res.detail);
      } catch (err) {
        markSendResult(c.id, false, (err as Error).message);
      }
    });
  await Promise.allSettled(tasks);
}

// Manual test send for the admin UI's "Test" button.
export async function testConnector(connectorId: string): Promise<SendResult> {
  const c = getConnector(connectorId);
  if (!c) return { ok: false, detail: "connector not found" };
  const sample: Notification = {
    id: "test_" + Date.now(),
    severity: "high",
    title: "BreachSentinel test notification",
    summary: "This is a test message from your BreachSentinel connector.",
    recommendation: "If you received this, the integration is wired correctly.",
    source: "intel",
  };
  const res = await sendOne(c.id, c.kind, getRawConfig(c), sample);
  markSendResult(c.id, res.ok, res.detail);
  return res;
}
