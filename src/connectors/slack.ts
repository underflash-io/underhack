import type { Notification, SendResult, SlackConfig } from "./types";

function severityIcon(s: string): string {
  return s === "critical" ? ":rotating_light:" : s === "high" ? ":warning:" : s === "medium" ? ":large_yellow_circle:" : ":information_source:";
}

export async function sendSlack(
  cfg: SlackConfig,
  n: Notification
): Promise<SendResult> {
  if (!cfg.webhookUrl) return { ok: false, detail: "no webhook url configured" };
  const lines = [
    `${severityIcon(n.severity)} *[${n.severity.toUpperCase()}]* ${n.title}`,
    n.summary ? `> ${n.summary}` : "",
    n.recommendation ? `*Action:* ${n.recommendation}` : "",
    n.url ? `<${n.url}|source>` : "",
    `_source: ${n.source}_`,
  ].filter(Boolean);
  try {
    const res = await fetch(cfg.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, detail: `slack http ${res.status}` };
    return { ok: true, detail: "delivered" };
  } catch (err) {
    return { ok: false, detail: `slack error: ${(err as Error).message}` };
  }
}
