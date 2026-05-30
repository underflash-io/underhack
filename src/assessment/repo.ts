import { randomUUID } from "crypto";
import {
  getDb,
  type AssessmentRow,
  type AssessmentFindingRow,
} from "../db/index";

const now = () => new Date().toISOString();
const id = (p: string) => p + "_" + randomUUID().slice(0, 12);

export function createAssessment(input: {
  authorizationId: string;
  target: string;
  intensity: string;
  createdBy?: string;
}): AssessmentRow {
  const row: AssessmentRow = {
    id: id("asmt"),
    authorization_id: input.authorizationId,
    target: input.target,
    intensity: input.intensity,
    status: "queued",
    stats: null,
    note: null,
    created_by: input.createdBy ?? null,
    started_at: null,
    finished_at: null,
    created_at: now(),
  };
  getDb()
    .prepare(
      `INSERT INTO assessments (id,authorization_id,target,intensity,status,stats,note,created_by,started_at,finished_at,created_at)
       VALUES (@id,@authorization_id,@target,@intensity,@status,@stats,@note,@created_by,@started_at,@finished_at,@created_at)`
    )
    .run(row);
  return row;
}

export function getAssessment(id: string): AssessmentRow | null {
  return (getDb().prepare("SELECT * FROM assessments WHERE id = ?").get(id) as
    | AssessmentRow
    | undefined) ?? null;
}

export function listAssessments(limit = 50): AssessmentRow[] {
  return getDb()
    .prepare("SELECT * FROM assessments ORDER BY created_at DESC LIMIT ?")
    .all(limit) as AssessmentRow[];
}

export function markStarted(jobId: string): void {
  getDb()
    .prepare("UPDATE assessments SET status='running', started_at=? WHERE id=?")
    .run(now(), jobId);
}

export function markFinished(
  jobId: string,
  status: string,
  stats: unknown,
  note?: string
): void {
  getDb()
    .prepare("UPDATE assessments SET status=?, stats=?, note=?, finished_at=? WHERE id=?")
    .run(status, JSON.stringify(stats ?? {}), note ?? null, now(), jobId);
}

export function abortAssessment(jobId: string): boolean {
  const a = getAssessment(jobId);
  if (!a || (a.status !== "queued" && a.status !== "running")) return false;
  getDb()
    .prepare("UPDATE assessments SET status='aborted', note='aborted by operator', finished_at=? WHERE id=?")
    .run(now(), jobId);
  return true;
}

export function isAborted(jobId: string): boolean {
  const a = getAssessment(jobId);
  return !a || a.status === "aborted" || a.status === "error";
}

export function insertFinding(input: {
  assessmentId: string;
  authorizationId: string;
  category: string;
  title: string;
  severity: string;
  score: number;
  factors?: string[];
  cwe?: string | null;
  relatedCve?: string | null;
  target: string;
  evidence?: unknown;
  recommendation?: string | null;
}): AssessmentFindingRow {
  const row: AssessmentFindingRow = {
    id: id("find"),
    assessment_id: input.assessmentId,
    authorization_id: input.authorizationId,
    category: input.category,
    title: input.title,
    severity: input.severity,
    score: input.score,
    factors: input.factors ? JSON.stringify(input.factors) : null,
    cwe: input.cwe ?? null,
    related_cve: input.relatedCve ?? null,
    target: input.target,
    evidence: input.evidence ? JSON.stringify(input.evidence) : null,
    recommendation: input.recommendation ?? null,
    created_at: now(),
  };
  getDb()
    .prepare(
      `INSERT INTO assessment_findings (id,assessment_id,authorization_id,category,title,severity,score,factors,cwe,related_cve,target,evidence,recommendation,created_at)
       VALUES (@id,@assessment_id,@authorization_id,@category,@title,@severity,@score,@factors,@cwe,@related_cve,@target,@evidence,@recommendation,@created_at)`
    )
    .run(row);
  return row;
}

export function listFindings(assessmentId: string): AssessmentFindingRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM assessment_findings WHERE assessment_id = ?
       ORDER BY score DESC, created_at ASC`
    )
    .all(assessmentId) as AssessmentFindingRow[];
}
