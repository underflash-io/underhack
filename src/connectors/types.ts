export type ConnectorKind = "slack" | "email";

export interface SlackConfig {
  webhookUrl: string;
}

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string; // comma-separated list
}

export type ConnectorConfig = SlackConfig | EmailConfig;

export interface Notification {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  summary?: string | null;
  recommendation?: string | null;
  url?: string | null;
  source: "intel" | "assessment";
  meta?: Record<string, unknown>;
}

export interface SendResult {
  ok: boolean;
  detail: string;
}
