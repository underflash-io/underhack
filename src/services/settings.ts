import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const SETTINGS_FILE = join(DATA_DIR, "settings.json");

export type AuthProviderId = "google" | "x";

export interface AuthProviderConfig {
  clientId: string;
  clientSecret: string;
}

export interface AuthConfig {
  baseUrl: string;
  google: AuthProviderConfig;
  x: AuthProviderConfig;
}

export type Severity = "low" | "medium" | "high" | "critical";

// Where triaged alerts get pushed for enterprise consumption.
export interface AlertingConfig {
  pollIntervalSec: number;
  defaultSeverityThreshold: Severity;
  slackWebhook: string;
  genericWebhook: string; // POST {alert} to an arbitrary enterprise endpoint
}

export interface Settings {
  alerting: AlertingConfig;
  auth: AuthConfig;
}

export const AUTH_PROVIDER_FIELDS: Record<AuthProviderId, { label: string }> = {
  google: { label: "Google" },
  x: { label: "X (Twitter)" },
};

function defaults(): Settings {
  return {
    alerting: {
      pollIntervalSec: parseInt(process.env.POLL_INTERVAL_SEC ?? "180", 10),
      defaultSeverityThreshold: (process.env.SEVERITY_THRESHOLD as Severity) ?? "medium",
      slackWebhook: process.env.SLACK_WEBHOOK ?? "",
      genericWebhook: process.env.ALERT_WEBHOOK ?? "",
    },
    auth: {
      baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      },
      x: {
        clientId: process.env.X_OAUTH_CLIENT_ID ?? "",
        clientSecret: process.env.X_OAUTH_CLIENT_SECRET ?? "",
      },
    },
  };
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function getSettings(): Settings {
  if (!existsSync(SETTINGS_FILE)) {
    const d = defaults();
    saveSettings(d);
    return d;
  }
  try {
    const loaded = JSON.parse(readFileSync(SETTINGS_FILE, "utf-8")) as Partial<Settings>;
    const base = defaults();
    return {
      alerting: {
        pollIntervalSec: loaded.alerting?.pollIntervalSec ?? base.alerting.pollIntervalSec,
        defaultSeverityThreshold:
          loaded.alerting?.defaultSeverityThreshold ?? base.alerting.defaultSeverityThreshold,
        slackWebhook: loaded.alerting?.slackWebhook ?? base.alerting.slackWebhook,
        genericWebhook: loaded.alerting?.genericWebhook ?? base.alerting.genericWebhook,
      },
      auth: {
        baseUrl: loaded.auth?.baseUrl || base.auth.baseUrl,
        google: {
          clientId: loaded.auth?.google?.clientId ?? base.auth.google.clientId,
          clientSecret: loaded.auth?.google?.clientSecret ?? base.auth.google.clientSecret,
        },
        x: {
          clientId: loaded.auth?.x?.clientId ?? base.auth.x.clientId,
          clientSecret: loaded.auth?.x?.clientSecret ?? base.auth.x.clientSecret,
        },
      },
    };
  } catch {
    const d = defaults();
    saveSettings(d);
    return d;
  }
}

export function saveSettings(s: Settings) {
  ensureDir();
  writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

export function setAlerting(update: Partial<AlertingConfig>): Settings {
  const s = getSettings();
  if (update.pollIntervalSec !== undefined && update.pollIntervalSec > 0)
    s.alerting.pollIntervalSec = update.pollIntervalSec;
  if (update.defaultSeverityThreshold !== undefined)
    s.alerting.defaultSeverityThreshold = update.defaultSeverityThreshold;
  if (update.slackWebhook !== undefined) s.alerting.slackWebhook = update.slackWebhook;
  if (update.genericWebhook !== undefined) s.alerting.genericWebhook = update.genericWebhook;
  saveSettings(s);
  return s;
}

export function getAuthConfig(): AuthConfig {
  return getSettings().auth;
}

export function setAuthProvider(
  id: AuthProviderId,
  update: { clientId?: string; clientSecret?: string }
): Settings {
  const s = getSettings();
  const p = s.auth[id];
  if (update.clientId !== undefined) p.clientId = update.clientId;
  // Empty string = leave existing secret untouched (form sends blank for unchanged).
  if (update.clientSecret !== undefined && update.clientSecret !== "")
    p.clientSecret = update.clientSecret;
  saveSettings(s);
  return s;
}

export function setBaseUrl(baseUrl: string): Settings {
  const s = getSettings();
  if (baseUrl) s.auth.baseUrl = baseUrl;
  saveSettings(s);
  return s;
}

function maskToken(v: string): string {
  if (!v) return "";
  if (v.length <= 4) return "••••";
  return "••••" + v.slice(-4);
}

// Safe-for-UI view: secrets masked, plus a configured flag per provider.
export function maskedSettings(): {
  alerting: AlertingConfig & { slackConfigured: boolean; webhookConfigured: boolean };
  auth: {
    baseUrl: string;
    providers: Record<AuthProviderId, { label: string; configured: boolean; clientId: string; clientSecret: string }>;
  };
} {
  const s = getSettings();
  const providers = {} as Record<
    AuthProviderId,
    { label: string; configured: boolean; clientId: string; clientSecret: string }
  >;
  for (const id of Object.keys(AUTH_PROVIDER_FIELDS) as AuthProviderId[]) {
    const cfg = s.auth[id];
    providers[id] = {
      label: AUTH_PROVIDER_FIELDS[id].label,
      configured: !!cfg.clientId && !!cfg.clientSecret,
      clientId: cfg.clientId,
      clientSecret: maskToken(cfg.clientSecret),
    };
  }
  return {
    alerting: {
      ...s.alerting,
      slackWebhook: maskToken(s.alerting.slackWebhook),
      genericWebhook: maskToken(s.alerting.genericWebhook),
      slackConfigured: !!s.alerting.slackWebhook,
      webhookConfigured: !!s.alerting.genericWebhook,
    },
    auth: { baseUrl: s.auth.baseUrl, providers },
  };
}
