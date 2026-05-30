import { lookup } from "dns/promises";
import { isIP } from "net";
import type { AuthorizationRow } from "../db/index";

export interface Scope {
  hosts: string[]; // exact "a.example.com" or wildcard "*.example.com"
  ports: number[]; // empty = [80, 443]
  path_prefixes: string[]; // empty = any path
}

export function parseScope(json: string): Scope {
  try {
    const s = JSON.parse(json);
    return {
      hosts: Array.isArray(s.hosts) ? s.hosts.map(String) : [],
      ports: Array.isArray(s.ports) ? s.ports.map(Number).filter(Boolean) : [],
      path_prefixes: Array.isArray(s.path_prefixes) ? s.path_prefixes.map(String) : [],
    };
  } catch {
    return { hosts: [], ports: [], path_prefixes: [] };
  }
}

export function parseExclusions(json: string): string[] {
  try {
    const e = JSON.parse(json);
    return Array.isArray(e) ? e.map(String) : [];
  } catch {
    return [];
  }
}

export function normalizeHost(h: string): string {
  return h.trim().toLowerCase().replace(/\.$/, "");
}

function hostMatches(host: string, pattern: string): boolean {
  const h = normalizeHost(host);
  const p = normalizeHost(pattern);
  if (p.startsWith("*.")) {
    const base = p.slice(2);
    return h === base || h.endsWith("." + base);
  }
  return h === p;
}

// Block loopback / private / link-local / metadata addresses by hostname pattern.
const PRIVATE_HOST_RE = /^(localhost|.*\.localhost|.*\.internal|.*\.local)$/i;

export function isBlockedHostname(host: string): boolean {
  const h = normalizeHost(host);
  if (PRIVATE_HOST_RE.test(h)) return true;
  if (isIP(h)) return isPrivateIp(h);
  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  // IPv6: loopback, ULA (fc00::/7), link-local (fe80::/10)
  const v = ip.toLowerCase();
  return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v === "::";
}

export interface ScopeCheck {
  ok: boolean;
  reason?: string;
}

// Synchronous allow-list / exclusion / SSRF check for a candidate URL.
export function isInScope(targetUrl: string, authz: AuthorizationRow): ScopeCheck {
  let u: URL;
  try {
    u = new URL(targetUrl);
  } catch {
    return { ok: false, reason: "invalid url" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, reason: "non-http(s) scheme" };
  }
  const host = normalizeHost(u.hostname);
  if (isBlockedHostname(host)) {
    return { ok: false, reason: "private/loopback/metadata address blocked" };
  }

  const scope = parseScope(authz.scope);
  const exclusions = parseExclusions(authz.exclusions);

  // exclusions take precedence
  for (const ex of exclusions) {
    const [exHost, ...rest] = ex.split("/");
    const exPath = rest.length ? "/" + rest.join("/") : "";
    if (hostMatches(host, exHost) && (!exPath || u.pathname.startsWith(exPath))) {
      return { ok: false, reason: `excluded: ${ex}` };
    }
  }

  if (!scope.hosts.some((p) => hostMatches(host, p))) {
    return { ok: false, reason: "host not in authorized scope" };
  }

  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  const allowedPorts = scope.ports.length ? scope.ports : [80, 443];
  if (!allowedPorts.includes(port)) {
    return { ok: false, reason: `port ${port} not in scope` };
  }

  if (scope.path_prefixes.length) {
    if (!scope.path_prefixes.some((pre) => u.pathname.startsWith(pre))) {
      return { ok: false, reason: "path not in scope" };
    }
  }

  return { ok: true };
}

// DNS-rebinding guard: confirm the host resolves to a public IP right before dispatch.
export async function assertResolvesPublic(host: string): Promise<ScopeCheck> {
  const h = normalizeHost(host);
  if (isIP(h)) {
    return isPrivateIp(h) ? { ok: false, reason: "resolves to private ip" } : { ok: true };
  }
  try {
    const { address } = await lookup(h);
    if (isPrivateIp(address)) return { ok: false, reason: "resolves to private ip" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "dns resolution failed" };
  }
}
