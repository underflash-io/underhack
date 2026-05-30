import nodemailer from "nodemailer";
import type { Notification, SendResult, EmailConfig } from "./types";

function html(n: Notification): string {
  const sevColor: Record<string, string> = {
    critical: "#dc2626",
    high: "#ea580c",
    medium: "#ca8a04",
    low: "#6b7280",
  };
  const c = sevColor[n.severity] ?? "#6b7280";
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:600px;border:1px solid #e5e5e5;padding:0">
    <div style="background:${c};color:#fff;padding:14px 20px;font-weight:700">[${n.severity.toUpperCase()}] ${escape(n.title)}</div>
    <div style="padding:18px 20px;color:#111">
      ${n.summary ? `<p style="margin:0 0 12px;color:#444">${escape(n.summary)}</p>` : ""}
      ${n.recommendation ? `<p style="margin:0 0 12px"><strong>Action:</strong> ${escape(n.recommendation)}</p>` : ""}
      ${n.url ? `<p style="margin:0 0 12px"><a href="${escape(n.url)}">Source advisory</a></p>` : ""}
      <p style="margin:14px 0 0;color:#888;font-size:12px">Source: ${n.source} · BreachSentinel</p>
    </div>
  </div>`;
}

function text(n: Notification): string {
  return [
    `[${n.severity.toUpperCase()}] ${n.title}`,
    n.summary ?? "",
    n.recommendation ? `Action: ${n.recommendation}` : "",
    n.url ? `Source: ${n.url}` : "",
    `BreachSentinel (${n.source})`,
  ].filter(Boolean).join("\n\n");
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
  );
}

export async function sendEmail(
  cfg: EmailConfig,
  n: Notification
): Promise<SendResult> {
  if (!cfg.host || !cfg.user || !cfg.from || !cfg.to) {
    return { ok: false, detail: "incomplete email config" };
  }
  try {
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: !!cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    const info = await transport.sendMail({
      from: cfg.from,
      to: cfg.to,
      subject: `[${n.severity.toUpperCase()}] ${n.title}`,
      text: text(n),
      html: html(n),
    });
    return { ok: true, detail: `delivered ${info.messageId ?? ""}`.trim() };
  } catch (err) {
    return { ok: false, detail: `email error: ${(err as Error).message}` };
  }
}
