import { getSettings } from "../services/settings";
import { SEVERITY_RANK } from "../db/repo";
import type { AlertRow } from "../db/index";
import { dispatchNotification } from "../connectors/dispatch";
import {
  listAllEnabledWebhooks,
  markWebhookDelivery,
  signWebhookPayload,
} from "../db/api-keys";

// Fire-and-forget delivery. Never throws. Routes through:
//   1. Legacy webhooks in settings (slackWebhook / genericWebhook) — kept for back-compat
//   2. The connectors module — multi-instance Slack/Gmail/etc. per-connector severity
export async function notifyAlert(alert: AlertRow): Promise<void> {
  // Only escalate genuinely actionable alerts to external channels.
  if (SEVERITY_RANK[alert.severity] < SEVERITY_RANK.high) return;

  const { slackWebhook, genericWebhook } = getSettings().alerting;
  const apis = alert.affected_apis ? (JSON.parse(alert.affected_apis) as string[]) : [];
  const line = `[${alert.severity.toUpperCase()}] ${alert.title}`;

  const tasks: Promise<unknown>[] = [];

  if (slackWebhook) {
    const text = [
      `:rotating_light: ${line}`,
      alert.summary ?? "",
      apis.length ? `Affected APIs: ${apis.join(", ")}` : "",
      alert.recommendation ? `Action: ${alert.recommendation}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    tasks.push(
      fetch(slackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch(() => undefined)
    );
  }

  if (genericWebhook) {
    tasks.push(
      fetch(genericWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: alert.id,
          severity: alert.severity,
          title: alert.title,
          summary: alert.summary,
          affected_apis: apis,
          recommendation: alert.recommendation,
          created_at: alert.created_at,
        }),
      }).catch(() => undefined)
    );
  }

  // Fan out to the configured connectors (Slack instances + Gmail SMTP + ...).
  tasks.push(
    dispatchNotification({
      id: alert.id,
      severity: alert.severity as "low" | "medium" | "high" | "critical",
      title: alert.title,
      summary: alert.summary,
      recommendation: alert.recommendation,
      source: alert.triage_method === "assessment" ? "assessment" : "intel",
      meta: { affected_apis: apis },
    }).catch(() => undefined)
  );

  // Fan out to public webhook subscriptions (created via /api/v1/subscriptions).
  for (const w of listAllEnabledWebhooks()) {
    if (SEVERITY_RANK[alert.severity] < (SEVERITY_RANK[w.min_severity] ?? SEVERITY_RANK.high)) continue;
    // Public severity bands: medium folds into low.
    const band =
      alert.severity === "critical"
        ? "critical"
        : alert.severity === "high"
          ? "high"
          : alert.severity === "info"
            ? "info"
            : "low";
    const payload = {
      type: "alert.created",
      data: {
        id: alert.id,
        severity: band,
        title: alert.title,
        summary: alert.summary,
        affected_apis: apis,
        recommendation: alert.recommendation,
        created_at: new Date(alert.created_at).toISOString(),
        system_id: alert.system_id,
      },
    };
    const body = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const signed = `${timestamp}.${body}`;
    const sig = signWebhookPayload(w.secret, signed);
    const deliveryId = `dlv_${Math.random().toString(36).slice(2, 14)}`;
    tasks.push(
      fetch(w.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Underhack-Webhooks/1",
          "X-Underhack-Event": "alert.created",
          "X-Underhack-Delivery": deliveryId,
          "X-Underhack-Timestamp": timestamp,
          "X-Underhack-Signature": `t=${timestamp},v1=${sig}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      })
        .then((res) => markWebhookDelivery(w.id, res.status))
        .catch(() => markWebhookDelivery(w.id, 0))
    );
  }

  await Promise.allSettled(tasks);
}
