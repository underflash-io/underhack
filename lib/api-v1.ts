// Shared helpers for /api/v1: RFC 9457 problem+json errors, scope enforcement,
// cursor pagination, and band/status translation between internal DB values
// and the public API contract.

import { NextResponse, type NextRequest } from "next/server";
import { extractBearer } from "./api-auth";
import { findApiKeyByToken, type ApiKeyRow } from "@/src/db/api-keys";

// ---------- problem+json ----------
// https://www.rfc-editor.org/rfc/rfc9457

export type Problem = {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [extra: string]: unknown;
};

export function problem(p: Problem): NextResponse {
  const body = {
    type: p.type ?? `https://underhack.dev/problems/${p.title.toLowerCase().replace(/\s+/g, "-")}`,
    ...p,
  };
  return new NextResponse(JSON.stringify(body), {
    status: p.status,
    headers: { "content-type": "application/problem+json" },
  });
}

export const errors = {
  unauthorized: (detail = "Missing or invalid bearer token") =>
    problem({ title: "unauthorized", status: 401, detail }),
  forbidden: (detail = "Insufficient scope") =>
    problem({ title: "forbidden", status: 403, detail }),
  notFound: (detail = "Resource not found") =>
    problem({ title: "not_found", status: 404, detail }),
  badRequest: (detail: string) =>
    problem({ title: "bad_request", status: 400, detail }),
  conflict: (detail: string) => problem({ title: "conflict", status: 409, detail }),
  rateLimited: (retryAfter?: number) => {
    const res = problem({ title: "rate_limited", status: 429, detail: "Too many requests" });
    if (retryAfter) res.headers.set("retry-after", String(retryAfter));
    return res;
  },
  server: (detail = "Internal server error") =>
    problem({ title: "internal_error", status: 500, detail }),
};

// ---------- auth + scopes ----------

export type AuthResult =
  | { ok: true; key: ApiKeyRow; scopes: Set<string> }
  | { ok: false; response: NextResponse };

export function authenticate(req: NextRequest, required?: string): AuthResult {
  const token = extractBearer(req);
  if (!token) return { ok: false, response: errors.unauthorized() };
  const key = findApiKeyByToken(token);
  if (!key) return { ok: false, response: errors.unauthorized("Unknown or revoked key") };
  const scopes = new Set(
    (key.scopes || "").split(",").map((s) => s.trim()).filter(Boolean)
  );
  if (required && !scopes.has(required) && !scopes.has("*")) {
    return { ok: false, response: errors.forbidden(`Key is missing scope '${required}'`) };
  }
  return { ok: true, key, scopes };
}

// ---------- band / status mapping ----------
// Internal DB severity: info | low | medium | high | critical
// Public band:          info | low | high | critical    (medium folds into low)
// Internal DB status:   open | ack | resolved | dismissed
// Public status:        new  | acknowledged | resolved | ignored

const BAND_OUT: Record<string, string> = {
  critical: "critical",
  high: "high",
  medium: "low",
  med: "low",
  low: "low",
  info: "info",
};

const BAND_IN: Record<string, string[]> = {
  critical: ["critical"],
  high: ["high"],
  low: ["low", "medium", "med"],
  info: ["info"],
};

const STATUS_OUT: Record<string, string> = {
  open: "new",
  ack: "acknowledged",
  resolved: "resolved",
  dismissed: "ignored",
};

const STATUS_IN: Record<string, string> = {
  new: "open",
  acknowledged: "ack",
  resolved: "resolved",
  ignored: "dismissed",
};

export const SEVERITY_RANK_OUT = { info: 0, low: 1, high: 2, critical: 3 } as const;

export function bandOut(dbSeverity: string): string {
  return BAND_OUT[dbSeverity] ?? "low";
}

export function statusOut(dbStatus: string): string {
  return STATUS_OUT[dbStatus] ?? dbStatus;
}

export function statusIn(publicStatus: string): string | null {
  return STATUS_IN[publicStatus] ?? null;
}

export function bandFilterToDb(band: string | null): string[] | null {
  if (!band) return null;
  const values = BAND_IN[band];
  return values ?? null;
}

// Numeric 0-100 score that mirrors the band. Useful for sort/threshold callers.
export function scoreFromBand(band: string, confidence = 0.9): number {
  const base = { critical: 90, high: 70, low: 30, info: 10 }[band] ?? 30;
  const conf = Math.max(0, Math.min(1, confidence));
  return Math.round(base + (100 - base) * conf * 0.1);
}

// ---------- cursor pagination ----------
// Opaque cursor encoding `created_at|id` so callers don't have to know about
// time semantics. Keeps queries deterministic on the (created_at desc, id desc)
// ordering used by the alert list.

export function encodeCursor(created_at: string, id: string): string {
  return Buffer.from(`${created_at}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(c: string | null): { created_at: string; id: string } | null {
  if (!c) return null;
  try {
    const raw = Buffer.from(c, "base64url").toString("utf8");
    const [t, id] = raw.split("|");
    if (!t || !id) return null;
    return { created_at: t, id };
  } catch {
    return null;
  }
}

export function clampLimit(raw: string | null, def = 25, max = 100): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

// ---------- response envelopes ----------

export function listResponse<T>(data: T[], next_cursor: string | null) {
  return NextResponse.json({ data, next_cursor });
}

export function objectResponse<T>(obj: T, init?: ResponseInit) {
  return NextResponse.json(obj, init);
}
