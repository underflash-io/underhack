import { randomUUID } from "crypto";
import { getDb, type ChatSessionRow, type ChatMessageRow } from "../db/index";

const now = () => new Date().toISOString();
const id = (p: string) => p + "_" + randomUUID().slice(0, 10);

export function createSession(input: { title?: string; createdBy?: string }): ChatSessionRow {
  const t = now();
  const row: ChatSessionRow = {
    id: id("chat"),
    title: input.title?.trim() || "Breach exposure intake",
    created_by: input.createdBy ?? null,
    meta: JSON.stringify({ index: 0, answers: {}, suggestions: [] }),
    created_at: t,
    updated_at: t,
  };
  getDb()
    .prepare(
      `INSERT INTO chat_sessions (id,title,created_by,meta,created_at,updated_at)
       VALUES (@id,@title,@created_by,@meta,@created_at,@updated_at)`
    )
    .run(row);
  return row;
}

export function listSessions(limit = 30): ChatSessionRow[] {
  return getDb()
    .prepare("SELECT * FROM chat_sessions ORDER BY updated_at DESC LIMIT ?")
    .all(limit) as ChatSessionRow[];
}

export function getSession(id: string): ChatSessionRow | null {
  return (getDb().prepare("SELECT * FROM chat_sessions WHERE id = ?").get(id) as
    | ChatSessionRow
    | undefined) ?? null;
}

export function touchSession(sessionId: string, metaPatch?: Record<string, unknown>) {
  const s = getSession(sessionId);
  if (!s) return;
  let meta = JSON.parse(s.meta ?? "{}") as Record<string, unknown>;
  if (metaPatch) meta = { ...meta, ...metaPatch };
  getDb()
    .prepare("UPDATE chat_sessions SET meta=?, updated_at=? WHERE id=?")
    .run(JSON.stringify(meta), now(), sessionId);
}

export function listMessages(sessionId: string): ChatMessageRow[] {
  return getDb()
    .prepare("SELECT * FROM chat_messages WHERE session_id=? ORDER BY created_at ASC")
    .all(sessionId) as ChatMessageRow[];
}

export function addMessage(input: {
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
}): ChatMessageRow {
  const row: ChatMessageRow = {
    id: id("msg"),
    session_id: input.sessionId,
    role: input.role,
    content: input.content,
    created_at: now(),
  };
  getDb()
    .prepare(
      `INSERT INTO chat_messages (id,session_id,role,content,created_at)
       VALUES (@id,@session_id,@role,@content,@created_at)`
    )
    .run(row);
  // Bump session updated_at so it sorts to the top.
  getDb().prepare("UPDATE chat_sessions SET updated_at=? WHERE id=?").run(now(), input.sessionId);
  return row;
}

export function deleteSession(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM chat_messages WHERE session_id=?").run(id);
  db.prepare("DELETE FROM chat_sessions WHERE id=?").run(id);
}
