import { createHash } from "crypto";
import { getDb, type AuditRow } from "../db/index";

// Append-only, hash-chained audit ledger (§5A). Each entry hashes over the
// previous entry's hash, so any tampering with history is detectable.
export function appendAudit(input: {
  actor?: string | null;
  action: string;
  authorizationId?: string | null;
  assessmentId?: string | null;
  detail?: unknown;
}): void {
  const db = getDb();
  const ts = new Date().toISOString();
  const prev = db
    .prepare("SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1")
    .get() as { entry_hash: string | null } | undefined;
  const prevHash = prev?.entry_hash ?? "genesis";
  const detail = input.detail === undefined ? null : JSON.stringify(input.detail);
  const payload = [
    ts,
    input.actor ?? "",
    input.action,
    input.authorizationId ?? "",
    input.assessmentId ?? "",
    detail ?? "",
    prevHash,
  ].join("|");
  const entryHash = createHash("sha256").update(payload).digest("hex");
  db.prepare(
    `INSERT INTO audit_log (ts, actor, action, authorization_id, assessment_id, detail, prev_hash, entry_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    ts,
    input.actor ?? null,
    input.action,
    input.authorizationId ?? null,
    input.assessmentId ?? null,
    detail,
    prevHash,
    entryHash
  );
}

export function listAudit(limit = 200): AuditRow[] {
  return getDb()
    .prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?")
    .all(limit) as AuditRow[];
}

// Verify the hash chain is intact (no entry rewritten/removed).
export function verifyAuditChain(): { ok: boolean; brokenAt?: number } {
  const rows = getDb()
    .prepare("SELECT * FROM audit_log ORDER BY id ASC")
    .all() as AuditRow[];
  let prevHash = "genesis";
  for (const r of rows) {
    const payload = [
      r.ts,
      r.actor ?? "",
      r.action,
      r.authorization_id ?? "",
      r.assessment_id ?? "",
      r.detail ?? "",
      prevHash,
    ].join("|");
    const expect = createHash("sha256").update(payload).digest("hex");
    if (r.prev_hash !== prevHash || r.entry_hash !== expect) {
      return { ok: false, brokenAt: r.id };
    }
    prevHash = r.entry_hash ?? "";
  }
  return { ok: true };
}
