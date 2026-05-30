import { randomBytes, createHash, createHmac } from "node:crypto";
import { getDb } from "./index";

export type ApiKeyRow = {
  id: string;
  label: string;
  prefix: string;
  key_hash: string;
  created_by: string | null;
  scopes: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

export type WebhookRow = {
  id: string;
  api_key_id: string;
  url: string;
  secret: string;
  min_severity: string;
  enabled: number;
  created_at: string;
  last_delivered_at: string | null;
  last_status: number | null;
};

const id12 = () => randomBytes(6).toString("hex");
const now = () => new Date().toISOString();

// Tokens are `uh_<env>_<random>` — prefix kept human-readable so users can
// recognize the key in dashboards and logs.
export function generateApiKey(): { token: string; prefix: string; hash: string } {
  const env = process.env.NODE_ENV === "production" ? "live" : "test";
  const random = randomBytes(24).toString("base64url");
  const token = `uh_${env}_${random}`;
  const prefix = token.slice(0, 11); // `uh_live_xxx` or `uh_test_xxx`
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, prefix, hash };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createApiKey(input: {
  label: string;
  createdBy?: string | null;
  scopes?: string[];
}): { row: ApiKeyRow; token: string } {
  const { token, prefix, hash } = generateApiKey();
  const row: ApiKeyRow = {
    id: id12(),
    label: input.label.trim() || "unnamed",
    prefix,
    key_hash: hash,
    created_by: input.createdBy ?? null,
    scopes: (input.scopes ?? ["alerts:read", "webhooks:write"]).join(","),
    last_used_at: null,
    created_at: now(),
    revoked_at: null,
  };
  getDb()
    .prepare(
      `INSERT INTO api_keys (id,label,prefix,key_hash,created_by,scopes,last_used_at,created_at,revoked_at)
       VALUES (@id,@label,@prefix,@key_hash,@created_by,@scopes,@last_used_at,@created_at,@revoked_at)`
    )
    .run(row);
  return { row, token };
}

export function listApiKeys(): ApiKeyRow[] {
  return getDb()
    .prepare(`SELECT * FROM api_keys ORDER BY created_at DESC`)
    .all() as ApiKeyRow[];
}

export function revokeApiKey(id: string): boolean {
  const r = getDb()
    .prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`)
    .run(now(), id);
  return r.changes > 0;
}

export function findApiKeyByToken(token: string): ApiKeyRow | null {
  const hash = hashToken(token);
  const row = getDb()
    .prepare(`SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL`)
    .get(hash) as ApiKeyRow | undefined;
  if (row) {
    getDb().prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`).run(now(), row.id);
  }
  return row ?? null;
}

// ===== webhooks =====

export function createWebhook(input: {
  apiKeyId: string;
  url: string;
  minSeverity?: "low" | "medium" | "high" | "critical";
}): WebhookRow {
  const row: WebhookRow = {
    id: id12(),
    api_key_id: input.apiKeyId,
    url: input.url,
    secret: randomBytes(24).toString("base64url"),
    min_severity: input.minSeverity ?? "high",
    enabled: 1,
    created_at: now(),
    last_delivered_at: null,
    last_status: null,
  };
  getDb()
    .prepare(
      `INSERT INTO webhook_subscriptions (id,api_key_id,url,secret,min_severity,enabled,created_at,last_delivered_at,last_status)
       VALUES (@id,@api_key_id,@url,@secret,@min_severity,@enabled,@created_at,@last_delivered_at,@last_status)`
    )
    .run(row);
  return row;
}

export function listWebhooksForKey(apiKeyId: string): WebhookRow[] {
  return getDb()
    .prepare(`SELECT * FROM webhook_subscriptions WHERE api_key_id = ? ORDER BY created_at DESC`)
    .all(apiKeyId) as WebhookRow[];
}

export function listAllEnabledWebhooks(): WebhookRow[] {
  return getDb()
    .prepare(`SELECT * FROM webhook_subscriptions WHERE enabled = 1`)
    .all() as WebhookRow[];
}

export function deleteWebhook(id: string, apiKeyId: string): boolean {
  const r = getDb()
    .prepare(`DELETE FROM webhook_subscriptions WHERE id = ? AND api_key_id = ?`)
    .run(id, apiKeyId);
  return r.changes > 0;
}

export function markWebhookDelivery(id: string, status: number) {
  getDb()
    .prepare(`UPDATE webhook_subscriptions SET last_delivered_at = ?, last_status = ? WHERE id = ?`)
    .run(now(), status, id);
}

export function signWebhookPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}
