import { randomUUID } from "crypto";
import {
  getDb,
  type SystemRow,
  type SourceRow,
  type FindingRow,
  type AlertRow,
  type AgentRunRow,
} from "./index";

const now = () => new Date().toISOString();
const id8 = () => randomUUID().slice(0, 8);

export const SEVERITY_RANK: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// ---------------- systems ----------------
export function listSystems(): SystemRow[] {
  return getDb().prepare("SELECT * FROM systems ORDER BY name").all() as SystemRow[];
}

export function listEnabledSystems(): SystemRow[] {
  return getDb()
    .prepare("SELECT * FROM systems WHERE enabled = 1 ORDER BY name")
    .all() as SystemRow[];
}

export function createSystem(input: {
  name: string;
  vendor?: string;
  keywords?: string;
  criticality?: string;
  severityThreshold?: string;
}): SystemRow {
  const row: SystemRow = {
    id: id8(),
    name: input.name.trim(),
    vendor: input.vendor?.trim() || null,
    keywords: (input.keywords ?? "").trim(),
    criticality: input.criticality ?? "medium",
    severity_threshold: input.severityThreshold ?? "medium",
    enabled: 1,
    created_at: now(),
  };
  getDb()
    .prepare(
      `INSERT INTO systems (id,name,vendor,keywords,criticality,severity_threshold,enabled,created_at)
       VALUES (@id,@name,@vendor,@keywords,@criticality,@severity_threshold,@enabled,@created_at)`
    )
    .run(row);
  return row;
}

export function updateSystem(
  systemId: string,
  patch: Partial<{
    name: string;
    vendor: string;
    keywords: string;
    criticality: string;
    severityThreshold: string;
    enabled: boolean;
  }>
): void {
  const db = getDb();
  const cur = db.prepare("SELECT * FROM systems WHERE id = ?").get(systemId) as SystemRow | undefined;
  if (!cur) return;
  db.prepare(
    `UPDATE systems SET name=?,vendor=?,keywords=?,criticality=?,severity_threshold=?,enabled=? WHERE id=?`
  ).run(
    patch.name ?? cur.name,
    patch.vendor ?? cur.vendor,
    patch.keywords ?? cur.keywords,
    patch.criticality ?? cur.criticality,
    patch.severityThreshold ?? cur.severity_threshold,
    patch.enabled === undefined ? cur.enabled : patch.enabled ? 1 : 0,
    systemId
  );
}

export function deleteSystem(systemId: string): void {
  getDb().prepare("DELETE FROM systems WHERE id = ?").run(systemId);
}

// ---------------- sources ----------------
export function listSources(): SourceRow[] {
  return getDb().prepare("SELECT * FROM sources ORDER BY name").all() as SourceRow[];
}

export function listEnabledSources(): SourceRow[] {
  return getDb()
    .prepare("SELECT * FROM sources WHERE enabled = 1 ORDER BY name")
    .all() as SourceRow[];
}

export function createSource(input: {
  name: string;
  kind: string;
  url: string;
}): SourceRow {
  const row: SourceRow = {
    id: id8(),
    name: input.name.trim(),
    kind: input.kind,
    url: input.url.trim(),
    enabled: 1,
    last_polled_at: null,
    last_status: null,
    created_at: now(),
  };
  getDb()
    .prepare(
      `INSERT INTO sources (id,name,kind,url,enabled,last_polled_at,last_status,created_at)
       VALUES (@id,@name,@kind,@url,@enabled,@last_polled_at,@last_status,@created_at)`
    )
    .run(row);
  return row;
}

export function toggleSource(sourceId: string): void {
  getDb()
    .prepare("UPDATE sources SET enabled = 1 - enabled WHERE id = ?")
    .run(sourceId);
}

export function deleteSource(sourceId: string): void {
  getDb().prepare("DELETE FROM sources WHERE id = ?").run(sourceId);
}

export function markSourcePolled(sourceId: string, status: string): void {
  getDb()
    .prepare("UPDATE sources SET last_polled_at = ?, last_status = ? WHERE id = ?")
    .run(now(), status, sourceId);
}

// ---------------- findings ----------------
export function findingExists(hash: string): boolean {
  return !!getDb().prepare("SELECT 1 FROM findings WHERE hash = ?").get(hash);
}

export function insertFinding(input: {
  sourceId: string | null;
  externalId?: string | null;
  title: string;
  summary?: string | null;
  url?: string | null;
  vendor?: string | null;
  product?: string | null;
  cvss?: number | null;
  rawSeverity?: string | null;
  publishedAt?: string | null;
  hash: string;
}): FindingRow | null {
  if (findingExists(input.hash)) return null;
  const row: FindingRow = {
    id: id8(),
    source_id: input.sourceId,
    external_id: input.externalId ?? null,
    title: input.title,
    summary: input.summary ?? null,
    url: input.url ?? null,
    vendor: input.vendor ?? null,
    product: input.product ?? null,
    cvss: input.cvss ?? null,
    raw_severity: input.rawSeverity ?? null,
    published_at: input.publishedAt ?? null,
    fetched_at: now(),
    triaged: 0,
    hash: input.hash,
  };
  try {
    getDb()
      .prepare(
        `INSERT INTO findings (id,source_id,external_id,title,summary,url,vendor,product,cvss,raw_severity,published_at,fetched_at,triaged,hash)
         VALUES (@id,@source_id,@external_id,@title,@summary,@url,@vendor,@product,@cvss,@raw_severity,@published_at,@fetched_at,@triaged,@hash)`
      )
      .run(row);
  } catch {
    return null; // unique hash race
  }
  return row;
}

export function untriagedFindings(limit = 25): FindingRow[] {
  return getDb()
    .prepare("SELECT * FROM findings WHERE triaged = 0 ORDER BY fetched_at ASC LIMIT ?")
    .all(limit) as FindingRow[];
}

export function markFindingTriaged(findingId: string): void {
  getDb().prepare("UPDATE findings SET triaged = 1 WHERE id = ?").run(findingId);
}

export function recentFindings(limit = 30): FindingRow[] {
  return getDb()
    .prepare("SELECT * FROM findings ORDER BY fetched_at DESC LIMIT ?")
    .all(limit) as FindingRow[];
}

// ---------------- alerts ----------------
export function insertAlert(input: {
  findingId: string;
  systemId: string | null;
  severity: string;
  confidence?: number | null;
  title: string;
  summary?: string | null;
  recommendation?: string | null;
  affectedApis?: string | null;
  triageMethod?: string | null;
}): AlertRow {
  const row: AlertRow = {
    id: id8(),
    finding_id: input.findingId,
    system_id: input.systemId,
    severity: input.severity,
    confidence: input.confidence ?? null,
    title: input.title,
    summary: input.summary ?? null,
    recommendation: input.recommendation ?? null,
    affected_apis: input.affectedApis ?? null,
    status: "open",
    triage_method: input.triageMethod ?? null,
    created_at: now(),
  };
  getDb()
    .prepare(
      `INSERT INTO alerts (id,finding_id,system_id,severity,confidence,title,summary,recommendation,affected_apis,status,triage_method,created_at)
       VALUES (@id,@finding_id,@system_id,@severity,@confidence,@title,@summary,@recommendation,@affected_apis,@status,@triage_method,@created_at)`
    )
    .run(row);
  return row;
}

export interface AlertWithSystem extends AlertRow {
  system_name: string | null;
  finding_url: string | null;
  external_id: string | null;
}

export function listAlerts(opts?: {
  status?: string;
  severity?: string;
  limit?: number;
}): AlertWithSystem[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.status) {
    clauses.push("a.status = ?");
    params.push(opts.status);
  }
  if (opts?.severity) {
    clauses.push("a.severity = ?");
    params.push(opts.severity);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(opts?.limit ?? 100);
  return getDb()
    .prepare(
      `SELECT a.*, s.name AS system_name, f.url AS finding_url, f.external_id AS external_id
       FROM alerts a
       LEFT JOIN systems s ON s.id = a.system_id
       LEFT JOIN findings f ON f.id = a.finding_id
       ${where}
       ORDER BY CASE a.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
                a.created_at DESC
       LIMIT ?`
    )
    .all(...params) as AlertWithSystem[];
}

export function setAlertStatus(alertId: string, status: string): void {
  getDb().prepare("UPDATE alerts SET status = ? WHERE id = ?").run(status, alertId);
}

// Cursor-paginated list. `cursor` is the (created_at, id) of the last row from
// the previous page; pass null for the first page. `severities` filters by DB
// severity values (callers convert API bands to DB severities themselves).
export function listAlertsPaged(opts: {
  status?: string | null;
  severities?: string[] | null;
  cursor?: { created_at: string; id: string } | null;
  limit: number;
  since?: string | null;
}): AlertWithSystem[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.status) {
    clauses.push("a.status = ?");
    params.push(opts.status);
  }
  if (opts.severities && opts.severities.length) {
    const qmarks = opts.severities.map(() => "?").join(",");
    clauses.push(`a.severity IN (${qmarks})`);
    params.push(...opts.severities);
  }
  if (opts.since) {
    clauses.push("a.created_at >= ?");
    params.push(opts.since);
  }
  if (opts.cursor) {
    clauses.push("(a.created_at, a.id) < (?, ?)");
    params.push(opts.cursor.created_at, opts.cursor.id);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(opts.limit);
  return getDb()
    .prepare(
      `SELECT a.*, s.name AS system_name, f.url AS finding_url, f.external_id AS external_id
       FROM alerts a
       LEFT JOIN systems s ON s.id = a.system_id
       LEFT JOIN findings f ON f.id = a.finding_id
       ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ?`
    )
    .all(...params) as AlertWithSystem[];
}

export function getAlertById(id: string): AlertWithSystem | null {
  const row = getDb()
    .prepare(
      `SELECT a.*, s.name AS system_name, f.url AS finding_url, f.external_id AS external_id
       FROM alerts a
       LEFT JOIN systems s ON s.id = a.system_id
       LEFT JOIN findings f ON f.id = a.finding_id
       WHERE a.id = ? LIMIT 1`
    )
    .get(id) as AlertWithSystem | undefined;
  return row ?? null;
}

// ---------------- agent runs ----------------
export function startRun(agent: string): string {
  const runId = id8();
  getDb()
    .prepare(
      `INSERT INTO agent_runs (id,agent,status,items_in,items_out,started_at) VALUES (?,?,?,0,0,?)`
    )
    .run(runId, agent, "running", now());
  return runId;
}

export function finishRun(
  runId: string,
  status: string,
  itemsIn: number,
  itemsOut: number,
  note?: string
): void {
  getDb()
    .prepare(
      `UPDATE agent_runs SET status=?, items_in=?, items_out=?, note=?, finished_at=? WHERE id=?`
    )
    .run(status, itemsIn, itemsOut, note ?? null, now(), runId);
}

export function recentRuns(limit = 40): AgentRunRow[] {
  return getDb()
    .prepare("SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT ?")
    .all(limit) as AgentRunRow[];
}

// ---------------- dashboard stats ----------------
export function dashboardStats() {
  const db = getDb();
  const count = (sql: string, ...p: unknown[]) =>
    (db.prepare(sql).get(...p) as { c: number }).c;
  return {
    alertsOpen: count("SELECT COUNT(*) c FROM alerts WHERE status = 'open'"),
    alertsCritical: count(
      "SELECT COUNT(*) c FROM alerts WHERE severity = 'critical' AND status = 'open'"
    ),
    alertsHigh: count(
      "SELECT COUNT(*) c FROM alerts WHERE severity = 'high' AND status = 'open'"
    ),
    findingsTotal: count("SELECT COUNT(*) c FROM findings"),
    findingsUntriaged: count("SELECT COUNT(*) c FROM findings WHERE triaged = 0"),
    systemsMonitored: count("SELECT COUNT(*) c FROM systems WHERE enabled = 1"),
    sourcesEnabled: count("SELECT COUNT(*) c FROM sources WHERE enabled = 1"),
  };
}
