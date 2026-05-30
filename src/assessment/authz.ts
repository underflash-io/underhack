import { randomBytes, randomUUID, createHash } from "crypto";
import { resolveTxt } from "dns/promises";
import { getDb, type AuthorizationRow } from "../db/index";
import { appendAudit } from "./audit";
import {
  USER_AGENT,
  DNS_CHALLENGE_PREFIX,
  HTTP_CHALLENGE_PATH,
  DEFAULT_AUTH_TTL_DAYS,
  type Intensity,
} from "./constants";
import { parseScope, normalizeHost, isBlockedHostname, assertResolvesPublic } from "./scope";

const now = () => new Date().toISOString();

function recordHash(a: Partial<AuthorizationRow>): string {
  const canon = [a.id, a.label, a.basis, a.scope, a.exclusions, a.intensity_max, a.verify_method, a.verify_token].join("|");
  return createHash("sha256").update(canon).digest("hex");
}

// The single host an operator must prove control of (apex of the first scope entry).
export function verifyHost(authz: AuthorizationRow): string {
  const scope = parseScope(authz.scope);
  const first = scope.hosts[0] ?? "";
  return normalizeHost(first.replace(/^\*\./, ""));
}

export function createAuthorization(input: {
  label: string;
  basis: string; // ownership | engagement
  contact?: string;
  scope: { hosts: string[]; ports?: number[]; path_prefixes?: string[] };
  exclusions?: string[];
  intensityMax?: Intensity;
  verifyMethod: "dns" | "http";
  createdBy?: string;
}): AuthorizationRow {
  if (!input.scope?.hosts?.length) throw new Error("at least one scope host is required");
  const id = "authz_" + randomUUID().slice(0, 12);
  const token = "breachsentinel-verify=" + randomBytes(16).toString("hex");
  const row: AuthorizationRow = {
    id,
    label: input.label.trim() || id,
    basis: input.basis === "engagement" ? "engagement" : "ownership",
    contact: input.contact?.trim() || null,
    scope: JSON.stringify({
      hosts: input.scope.hosts.map(normalizeHost),
      ports: input.scope.ports ?? [],
      path_prefixes: input.scope.path_prefixes ?? [],
    }),
    exclusions: JSON.stringify(input.exclusions ?? []),
    intensity_max: input.intensityMax ?? "baseline",
    verify_method: input.verifyMethod === "dns" ? "dns" : "http",
    verify_token: token,
    status: "pending",
    record_hash: "",
    created_by: input.createdBy ?? null,
    created_at: now(),
    verified_at: null,
    expires_at: null,
  };
  row.record_hash = recordHash(row);

  getDb()
    .prepare(
      `INSERT INTO authorizations
       (id,label,basis,contact,scope,exclusions,intensity_max,verify_method,verify_token,status,record_hash,created_by,created_at,verified_at,expires_at)
       VALUES (@id,@label,@basis,@contact,@scope,@exclusions,@intensity_max,@verify_method,@verify_token,@status,@record_hash,@created_by,@created_at,@verified_at,@expires_at)`
    )
    .run(row);

  appendAudit({
    actor: input.createdBy,
    action: "authz.create",
    authorizationId: id,
    detail: { label: row.label, basis: row.basis, scope: input.scope, method: row.verify_method },
  });
  return row;
}

export function listAuthorizations(): AuthorizationRow[] {
  return getDb()
    .prepare("SELECT * FROM authorizations ORDER BY created_at DESC")
    .all() as AuthorizationRow[];
}

export function getAuthorization(id: string): AuthorizationRow | null {
  return (getDb().prepare("SELECT * FROM authorizations WHERE id = ?").get(id) as
    | AuthorizationRow
    | undefined) ?? null;
}

// Returns the challenge the operator must publish to prove control.
export function challengeFor(authz: AuthorizationRow): {
  method: string;
  host: string;
  dnsName: string;
  httpUrl: string;
  token: string;
} {
  const host = verifyHost(authz);
  return {
    method: authz.verify_method,
    host,
    dnsName: `${DNS_CHALLENGE_PREFIX}.${host}`,
    httpUrl: `https://${host}${HTTP_CHALLENGE_PATH}`,
    token: authz.verify_token,
  };
}

export function isUsable(authz: AuthorizationRow): { ok: boolean; reason?: string } {
  if (authz.status === "revoked") return { ok: false, reason: "authorization revoked" };
  if (authz.status !== "verified") return { ok: false, reason: "authorization not verified" };
  if (recordHash(authz) !== authz.record_hash) return { ok: false, reason: "authorization record tampered" };
  if (authz.expires_at && new Date(authz.expires_at).getTime() < Date.now()) {
    getDb().prepare("UPDATE authorizations SET status='expired' WHERE id=?").run(authz.id);
    return { ok: false, reason: "authorization expired" };
  }
  return { ok: true };
}

// Run the ownership/authorization challenge. Verified on success only.
export async function verifyAuthorization(
  id: string,
  actor?: string
): Promise<{ ok: boolean; reason?: string }> {
  const authz = getAuthorization(id);
  if (!authz) return { ok: false, reason: "not found" };
  if (authz.status === "revoked") return { ok: false, reason: "revoked" };
  if (recordHash(authz) !== authz.record_hash) return { ok: false, reason: "record tampered" };

  const host = verifyHost(authz);
  if (!host || isBlockedHostname(host)) return { ok: false, reason: "invalid verify host" };

  let ok = false;
  let detail = "";
  try {
    if (authz.verify_method === "dns") {
      const name = `${DNS_CHALLENGE_PREFIX}.${host}`;
      const records = await resolveTxt(name);
      const flat = records.map((r) => r.join("")).map((s) => s.trim());
      ok = flat.some((v) => v === authz.verify_token || v.includes(authz.verify_token));
      detail = `dns TXT ${name}`;
    } else {
      // SSRF guard before touching the network.
      const pub = await assertResolvesPublic(host);
      if (!pub.ok) return { ok: false, reason: pub.reason };
      const url = `https://${host}${HTTP_CHALLENGE_PATH}`;
      const ctrl = AbortSignal.timeout(8000);
      const res = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT, Accept: "text/plain" },
        redirect: "error",
        signal: ctrl,
      });
      const body = (await res.text()).slice(0, 4096).trim();
      ok = res.ok && body.includes(authz.verify_token);
      detail = `http GET ${url} (${res.status})`;
    }
  } catch (err) {
    detail = `error: ${(err as Error).message}`;
  }

  appendAudit({
    actor,
    action: "authz.verify",
    authorizationId: id,
    detail: { method: authz.verify_method, host, result: ok ? "verified" : "failed", note: detail },
  });

  if (!ok) return { ok: false, reason: `challenge not satisfied (${detail})` };

  const verifiedAt = now();
  const expiresAt = new Date(Date.now() + DEFAULT_AUTH_TTL_DAYS * 86400_000).toISOString();
  getDb()
    .prepare("UPDATE authorizations SET status='verified', verified_at=?, expires_at=? WHERE id=?")
    .run(verifiedAt, expiresAt, id);
  return { ok: true };
}

export function revokeAuthorization(id: string, actor?: string): boolean {
  const authz = getAuthorization(id);
  if (!authz) return false;
  getDb().prepare("UPDATE authorizations SET status='revoked' WHERE id=?").run(id);
  // Halt any running jobs for this authorization immediately. (§5A revocation)
  getDb()
    .prepare("UPDATE assessments SET status='aborted', note='authorization revoked', finished_at=? WHERE authorization_id=? AND status IN ('queued','running')")
    .run(now(), id);
  appendAudit({ actor, action: "authz.revoke", authorizationId: id });
  return true;
}
