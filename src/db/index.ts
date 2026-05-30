import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";

// Single shared connection. Resolved against cwd so the Next.js server and the
// standalone worker (run via tsx) both hit the same file from the project root.
const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = process.env.DB_PATH ?? join(DATA_DIR, "underhack.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate_schema(db);
  _db = db;
  return db;
}

// Ensures the connection (and schema) exist. Safe to call repeatedly.
export function migrate(): void {
  getDb();
}

function migrate_schema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS systems (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      vendor TEXT,
      keywords TEXT NOT NULL DEFAULT '',
      criticality TEXT NOT NULL DEFAULT 'medium',
      severity_threshold TEXT NOT NULL DEFAULT 'medium',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_polled_at TEXT,
      last_status TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      external_id TEXT,
      title TEXT NOT NULL,
      summary TEXT,
      url TEXT,
      vendor TEXT,
      product TEXT,
      cvss REAL,
      raw_severity TEXT,
      published_at TEXT,
      fetched_at TEXT NOT NULL,
      triaged INTEGER NOT NULL DEFAULT 0,
      hash TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      finding_id TEXT NOT NULL,
      system_id TEXT,
      severity TEXT NOT NULL,
      confidence REAL,
      title TEXT NOT NULL,
      summary TEXT,
      recommendation TEXT,
      affected_apis TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      triage_method TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      status TEXT NOT NULL,
      items_in INTEGER DEFAULT 0,
      items_out INTEGER DEFAULT 0,
      note TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL DEFAULT '',
      password_salt TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'admin',
      google_sub TEXT,
      x_id TEXT,
      x_handle TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_findings_triaged ON findings(triaged);
    CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_runs_started ON agent_runs(started_at DESC);

    -- ===== BreachSentinel: authorized assessment module (§5A/§5B) =====

    -- Authorization records gate ALL active assessment. No job runs without a
    -- verified record + in-scope target. (§5A)
    CREATE TABLE IF NOT EXISTS authorizations (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      basis TEXT NOT NULL,              -- ownership | engagement
      contact TEXT,
      scope TEXT NOT NULL,              -- JSON: { hosts:[], ports:[], path_prefixes:[] }
      exclusions TEXT NOT NULL DEFAULT '[]', -- JSON: [host or host/path]
      intensity_max TEXT NOT NULL DEFAULT 'baseline', -- passive | baseline | thorough
      verify_method TEXT NOT NULL,      -- dns | http
      verify_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- pending | verified | revoked | expired
      record_hash TEXT NOT NULL,        -- tamper-evident signature over the record
      created_by TEXT,
      created_at TEXT NOT NULL,
      verified_at TEXT,
      expires_at TEXT
    );

    -- Assessment jobs.
    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY,
      authorization_id TEXT NOT NULL,
      target TEXT NOT NULL,             -- the in-scope host this job runs against
      intensity TEXT NOT NULL DEFAULT 'baseline',
      status TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | aborted | error | blocked
      stats TEXT,                       -- JSON: per-category counts
      note TEXT,
      created_by TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL
    );

    -- Normalized findings (incident_type = "finding"). Evidence is metadata only,
    -- never captured response bodies. (§5B output, §6)
    CREATE TABLE IF NOT EXISTS assessment_findings (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL,
      authorization_id TEXT NOT NULL,
      category TEXT NOT NULL,           -- transport | headers | components | misconfig | surface
      title TEXT NOT NULL,
      severity TEXT NOT NULL,           -- low | medium | high | critical | info
      score INTEGER NOT NULL DEFAULT 0,
      factors TEXT,                     -- JSON: explainability
      cwe TEXT,
      related_cve TEXT,
      target TEXT NOT NULL,
      evidence TEXT,                    -- JSON: request/response METADATA only
      recommendation TEXT,
      created_at TEXT NOT NULL
    );

    -- Append-only, tamper-evident audit ledger. (§5A)
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      actor TEXT,
      action TEXT NOT NULL,             -- authz.create | authz.verify | authz.revoke | scope.deny | assess.start | assess.dispatch | assess.finish | assess.abort
      authorization_id TEXT,
      assessment_id TEXT,
      detail TEXT,                      -- JSON
      prev_hash TEXT,                   -- hash chain over the previous entry
      entry_hash TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_authz_status ON authorizations(status);
    CREATE INDEX IF NOT EXISTS idx_assess_authz ON assessments(authorization_id);
    CREATE INDEX IF NOT EXISTS idx_af_assessment ON assessment_findings(assessment_id);
    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);

    -- ===== Outbound connectors (Slack, Gmail, ...) =====
    CREATE TABLE IF NOT EXISTS connectors (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,                 -- slack | email
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      min_severity TEXT NOT NULL DEFAULT 'high',
      config TEXT NOT NULL,               -- JSON: provider-specific
      last_used_at TEXT,
      last_status TEXT,
      created_at TEXT NOT NULL
    );

    -- ===== Chatbot intake: collects breach exposure context =====
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_by TEXT,
      meta TEXT,                          -- JSON: extracted answers/suggestions
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,                 -- user | assistant | system
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_msgs_session ON chat_messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_conn_kind ON connectors(kind);

    -- ===== Public REST API: API keys + webhook subscriptions =====
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      prefix TEXT NOT NULL,               -- "uh_" + first 6 chars, shown to user
      key_hash TEXT NOT NULL UNIQUE,      -- sha256 of full secret
      created_by TEXT,
      scopes TEXT NOT NULL DEFAULT 'read', -- csv: read, webhook
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS webhook_subscriptions (
      id TEXT PRIMARY KEY,
      api_key_id TEXT,                    -- nullable: owner identification
      url TEXT NOT NULL,
      secret TEXT NOT NULL,               -- HMAC signing secret
      min_severity TEXT NOT NULL DEFAULT 'high',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_delivered_at TEXT,
      last_status TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_apikey_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_webhook_enabled ON webhook_subscriptions(enabled);
  `);

  // ----- migrations -----
  // Idempotent ADD COLUMN — SQLite errors if it already exists, so we probe first.
  addColumnIfMissing(db, "alerts", "acknowledged_at", "TEXT");
  addColumnIfMissing(db, "alerts", "resolved_at", "TEXT");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved_at);`);
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  decl: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl};`);
}

// --- row types ---
export interface SystemRow {
  id: string;
  name: string;
  vendor: string | null;
  keywords: string;
  criticality: string;
  severity_threshold: string;
  enabled: number;
  created_at: string;
}

export interface SourceRow {
  id: string;
  name: string;
  kind: string; // kev | nvd | rss
  url: string;
  enabled: number;
  last_polled_at: string | null;
  last_status: string | null;
  created_at: string;
}

export interface FindingRow {
  id: string;
  source_id: string | null;
  external_id: string | null;
  title: string;
  summary: string | null;
  url: string | null;
  vendor: string | null;
  product: string | null;
  cvss: number | null;
  raw_severity: string | null;
  published_at: string | null;
  fetched_at: string;
  triaged: number;
  hash: string;
}

export interface AlertRow {
  id: string;
  finding_id: string;
  system_id: string | null;
  severity: string; // low | medium | high | critical
  confidence: number | null;
  title: string;
  summary: string | null;
  recommendation: string | null;
  affected_apis: string | null;
  status: string; // open | ack | resolved
  triage_method: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface AgentRunRow {
  id: string;
  agent: string;
  status: string;
  items_in: number;
  items_out: number;
  note: string | null;
  started_at: string;
  finished_at: string | null;
}

// --- assessment module rows ---
export interface AuthorizationRow {
  id: string;
  label: string;
  basis: string; // ownership | engagement
  contact: string | null;
  scope: string; // JSON
  exclusions: string; // JSON
  intensity_max: string; // passive | baseline | thorough
  verify_method: string; // dns | http
  verify_token: string;
  status: string; // pending | verified | revoked | expired
  record_hash: string;
  created_by: string | null;
  created_at: string;
  verified_at: string | null;
  expires_at: string | null;
}

export interface AssessmentRow {
  id: string;
  authorization_id: string;
  target: string;
  intensity: string;
  status: string; // queued | running | done | aborted | error | blocked
  stats: string | null;
  note: string | null;
  created_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface AssessmentFindingRow {
  id: string;
  assessment_id: string;
  authorization_id: string;
  category: string; // transport | headers | components | misconfig | surface
  title: string;
  severity: string; // info | low | medium | high | critical
  score: number;
  factors: string | null;
  cwe: string | null;
  related_cve: string | null;
  target: string;
  evidence: string | null;
  recommendation: string | null;
  created_at: string;
}

export interface AuditRow {
  id: number;
  ts: string;
  actor: string | null;
  action: string;
  authorization_id: string | null;
  assessment_id: string | null;
  detail: string | null;
  prev_hash: string | null;
  entry_hash: string | null;
}

export interface ConnectorRow {
  id: string;
  kind: string; // slack | email
  name: string;
  enabled: number;
  min_severity: string;
  config: string; // JSON
  last_used_at: string | null;
  last_status: string | null;
  created_at: string;
}

export interface ChatSessionRow {
  id: string;
  title: string | null;
  created_by: string | null;
  meta: string | null; // JSON
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: string;
  session_id: string;
  role: string; // user | assistant | system
  content: string;
  created_at: string;
}
