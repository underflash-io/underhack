import { randomUUID } from "crypto";
import { getDb, type ConnectorRow } from "../db/index";
import type { ConnectorKind, ConnectorConfig } from "./types";

const now = () => new Date().toISOString();
const id8 = () => randomUUID().slice(0, 10);

const FIELDS = ["webhookUrl", "host", "port", "secure", "user", "pass", "from", "to"] as const;

function mask(v: string | undefined | null): string {
  if (!v) return "";
  if (v.length <= 4) return "••••";
  return "••••" + v.slice(-4);
}

export function listConnectors(): ConnectorRow[] {
  return getDb()
    .prepare("SELECT * FROM connectors ORDER BY created_at DESC")
    .all() as ConnectorRow[];
}

export function getConnector(id: string): ConnectorRow | null {
  return (getDb().prepare("SELECT * FROM connectors WHERE id = ?").get(id) as
    | ConnectorRow
    | undefined) ?? null;
}

export function createConnector(input: {
  kind: ConnectorKind;
  name: string;
  config: Partial<Record<(typeof FIELDS)[number], string | number | boolean>>;
  minSeverity?: string;
}): ConnectorRow {
  const row: ConnectorRow = {
    id: "conn_" + id8(),
    kind: input.kind,
    name: input.name.trim() || input.kind,
    enabled: 1,
    min_severity: input.minSeverity ?? "high",
    config: JSON.stringify(input.config),
    last_used_at: null,
    last_status: null,
    created_at: now(),
  };
  getDb()
    .prepare(
      `INSERT INTO connectors (id,kind,name,enabled,min_severity,config,last_used_at,last_status,created_at)
       VALUES (@id,@kind,@name,@enabled,@min_severity,@config,@last_used_at,@last_status,@created_at)`
    )
    .run(row);
  return row;
}

export function updateConnector(
  id: string,
  patch: { name?: string; enabled?: boolean; minSeverity?: string; config?: Record<string, unknown> }
): void {
  const cur = getConnector(id);
  if (!cur) return;
  // For config: merge — empty-string values keep existing secrets (form behavior).
  let cfg = JSON.parse(cur.config) as Record<string, unknown>;
  if (patch.config) {
    for (const [k, v] of Object.entries(patch.config)) {
      if (v === "" || v === undefined) continue;
      cfg[k] = v;
    }
  }
  getDb()
    .prepare(
      `UPDATE connectors SET name=?, enabled=?, min_severity=?, config=? WHERE id=?`
    )
    .run(
      patch.name ?? cur.name,
      patch.enabled === undefined ? cur.enabled : patch.enabled ? 1 : 0,
      patch.minSeverity ?? cur.min_severity,
      JSON.stringify(cfg),
      id
    );
}

export function deleteConnector(id: string): void {
  getDb().prepare("DELETE FROM connectors WHERE id = ?").run(id);
}

export function markSendResult(id: string, ok: boolean, detail: string): void {
  getDb()
    .prepare("UPDATE connectors SET last_used_at=?, last_status=? WHERE id=?")
    .run(now(), `${ok ? "ok" : "error"}: ${detail}`.slice(0, 200), id);
}

// Return a UI-safe (secrets masked) view of a connector row.
export function toPublic(c: ConnectorRow): {
  id: string;
  kind: string;
  name: string;
  enabled: number;
  min_severity: string;
  last_used_at: string | null;
  last_status: string | null;
  created_at: string;
  config: Record<string, string>;
  fields: string[];
} {
  const cfg = JSON.parse(c.config) as Record<string, unknown>;
  const fields = c.kind === "slack" ? ["webhookUrl"] : ["host", "port", "secure", "user", "pass", "from", "to"];
  const masked: Record<string, string> = {};
  for (const f of fields) {
    const v = cfg[f];
    if (f === "pass" || f === "webhookUrl") masked[f] = mask(String(v ?? ""));
    else masked[f] = String(v ?? "");
  }
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    enabled: c.enabled,
    min_severity: c.min_severity,
    last_used_at: c.last_used_at,
    last_status: c.last_status,
    created_at: c.created_at,
    config: masked,
    fields,
  };
}

export function getRawConfig<T = ConnectorConfig>(c: ConnectorRow): T {
  return JSON.parse(c.config) as T;
}
