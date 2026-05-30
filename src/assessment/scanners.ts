import { getDb } from "../db/index";
import type { FindingSeverity } from "./score";
import type { Intensity } from "./constants";

export interface RawFinding {
  category: "transport" | "headers" | "components" | "misconfig" | "surface";
  title: string;
  hint: FindingSeverity;
  cwe?: string;
  relatedCve?: string;
  evidence?: Record<string, unknown>;
  recommendation?: string;
  factors?: string[];
}

export interface HttpResult {
  status: number;
  headers: Record<string, string>;
  contentLength: number | null;
  blocked: boolean; // control (WAF/403/429) blocked us — we stop, never evade
}

export interface TlsInfo {
  protocol: string | null;
  cipher: string | null;
  validTo: string | null;
  daysToExpiry: number | null;
  issuer: string | null;
  selfSigned: boolean;
}

// The engine supplies these scope-checked, rate-limited, audited primitives.
export interface ScanContext {
  host: string;
  intensity: Intensity;
  scopePorts: number[];
  get(path: string): Promise<HttpResult | null>; // null = out-of-scope/skipped
  tls(): Promise<TlsInfo | null>;
  tcpProbe(port: number): Promise<boolean>;
}

// ---- transport ----
export async function scanTls(ctx: ScanContext): Promise<RawFinding[]> {
  const out: RawFinding[] = [];
  const t = await ctx.tls();
  if (!t) return out;

  if (t.daysToExpiry !== null && t.daysToExpiry < 0) {
    out.push({
      category: "transport",
      title: "TLS certificate expired",
      hint: "high",
      cwe: "CWE-298",
      factors: ["expired"],
      evidence: { validTo: t.validTo, issuer: t.issuer },
      recommendation: "Renew and deploy a valid certificate immediately.",
    });
  } else if (t.daysToExpiry !== null && t.daysToExpiry < 21) {
    out.push({
      category: "transport",
      title: `TLS certificate expiring in ${t.daysToExpiry} days`,
      hint: "medium",
      cwe: "CWE-298",
      evidence: { validTo: t.validTo, issuer: t.issuer },
      recommendation: "Schedule certificate renewal before expiry.",
    });
  }
  if (t.selfSigned) {
    out.push({
      category: "transport",
      title: "Self-signed / untrusted TLS certificate",
      hint: "medium",
      cwe: "CWE-295",
      evidence: { issuer: t.issuer },
      recommendation: "Use a certificate from a trusted CA.",
    });
  }
  if (t.protocol && /TLSv1(\.0|\.1)?$/.test(t.protocol)) {
    out.push({
      category: "transport",
      title: `Obsolete TLS protocol negotiated (${t.protocol})`,
      hint: "medium",
      cwe: "CWE-326",
      evidence: { protocol: t.protocol, cipher: t.cipher },
      recommendation: "Disable TLS 1.0/1.1; require TLS 1.2+.",
    });
  }
  out.push({
    category: "surface",
    title: `TLS posture: ${t.protocol ?? "unknown"}`,
    hint: "info",
    evidence: { protocol: t.protocol, cipher: t.cipher, issuer: t.issuer, validTo: t.validTo },
  });
  return out;
}

// ---- security headers ----
const HEADER_CHECKS: { name: string; title: string; hint: FindingSeverity; cwe: string; rec: string }[] = [
  { name: "strict-transport-security", title: "Missing HSTS header", hint: "medium", cwe: "CWE-319", rec: "Add Strict-Transport-Security with a long max-age." },
  { name: "content-security-policy", title: "Missing Content-Security-Policy", hint: "medium", cwe: "CWE-1021", rec: "Define a restrictive CSP to mitigate XSS/clickjacking." },
  { name: "x-content-type-options", title: "Missing X-Content-Type-Options", hint: "low", cwe: "CWE-693", rec: "Set X-Content-Type-Options: nosniff." },
  { name: "x-frame-options", title: "Missing X-Frame-Options", hint: "low", cwe: "CWE-1021", rec: "Set X-Frame-Options or a CSP frame-ancestors directive." },
  { name: "referrer-policy", title: "Missing Referrer-Policy", hint: "low", cwe: "CWE-200", rec: "Set a Referrer-Policy such as strict-origin-when-cross-origin." },
];

export async function scanHeaders(
  ctx: ScanContext
): Promise<{ findings: RawFinding[]; headers: Record<string, string> | null }> {
  const r = await ctx.get("/");
  if (!r) return { findings: [], headers: null };
  if (r.blocked) {
    return {
      findings: [
        {
          category: "headers",
          title: "Request blocked by a security control",
          hint: "info",
          evidence: { status: r.status },
          recommendation: "A WAF/control responded; the scanner stops rather than evade it.",
        },
      ],
      headers: r.headers,
    };
  }
  const findings: RawFinding[] = [];
  for (const c of HEADER_CHECKS) {
    if (!r.headers[c.name]) {
      // x-frame-options is satisfied by CSP frame-ancestors
      if (c.name === "x-frame-options" && /frame-ancestors/i.test(r.headers["content-security-policy"] ?? "")) continue;
      findings.push({
        category: "headers",
        title: c.title,
        hint: c.hint,
        cwe: c.cwe,
        evidence: { status: r.status },
        recommendation: c.rec,
      });
    }
  }
  return { findings, headers: r.headers };
}

// ---- known-vulnerable components (cross-reference our own intel DB) ----
export function scanComponents(headers: Record<string, string> | null, host: string): RawFinding[] {
  if (!headers) return [];
  const out: RawFinding[] = [];
  const banners = [headers["server"], headers["x-powered-by"], headers["x-aspnet-version"]]
    .filter(Boolean)
    .map((s) => s as string);

  for (const banner of banners) {
    // version banner disclosure itself is low-severity info leakage
    if (/\d+\.\d+/.test(banner)) {
      out.push({
        category: "components",
        title: `Software version disclosed: ${banner}`,
        hint: "low",
        cwe: "CWE-200",
        evidence: { banner, host },
        recommendation: "Suppress version tokens in Server/X-Powered-By headers.",
      });
    }
    // cross-reference the product name against ingested intel findings
    const product = banner.split("/")[0]?.trim().toLowerCase();
    if (product && product.length >= 3) {
      const matches = getDb()
        .prepare(
          `SELECT external_id, title, raw_severity FROM findings
           WHERE lower(coalesce(product,'')) LIKE ? OR lower(coalesce(vendor,'')) LIKE ? OR lower(title) LIKE ?
           LIMIT 3`
        )
        .all(`%${product}%`, `%${product}%`, `%${product}%`) as {
        external_id: string | null;
        title: string;
        raw_severity: string | null;
      }[];
      if (matches.length) {
        const cve = matches.find((m) => m.external_id)?.external_id ?? undefined;
        out.push({
          category: "components",
          title: `Exposed component with published advisories: ${banner}`,
          hint: "high",
          cwe: "CWE-1035",
          relatedCve: cve,
          factors: cve ? ["related_cve"] : [],
          evidence: { banner, matched: matches.map((m) => m.external_id ?? m.title).slice(0, 3) },
          recommendation: "Confirm the running version and patch to a fixed release.",
        });
      }
    }
  }
  return out;
}

// ---- common misconfigurations (DETECTION ONLY — status codes, never bodies) ----
const MISCONFIG_PATHS_BASELINE = ["/.git/HEAD", "/.env", "/.svn/entries", "/server-status", "/.DS_Store"];
const MISCONFIG_PATHS_THOROUGH = ["/backup.zip", "/.git/config", "/wp-config.php.bak", "/config.json", "/phpinfo.php"];

export async function scanMisconfig(ctx: ScanContext): Promise<RawFinding[]> {
  const paths =
    ctx.intensity === "thorough"
      ? [...MISCONFIG_PATHS_BASELINE, ...MISCONFIG_PATHS_THOROUGH]
      : MISCONFIG_PATHS_BASELINE;
  const out: RawFinding[] = [];
  for (const p of paths) {
    const r = await ctx.get(p);
    if (!r || r.blocked) continue;
    // Only a 200 with content indicates an exposed artifact. We record metadata
    // only — the response body is never read or stored.
    if (r.status === 200 && (r.contentLength === null || r.contentLength > 0)) {
      out.push({
        category: "misconfig",
        title: `Sensitive path exposed: ${p}`,
        hint: "high",
        cwe: "CWE-538",
        factors: ["exposed_secret_path"],
        evidence: { path: p, status: r.status, contentLength: r.contentLength },
        recommendation: `Block access to ${p}; remove the artifact from the web root.`,
      });
    }
  }
  return out;
}

// ---- authorized surface mapping ----
export async function scanSurface(ctx: ScanContext): Promise<RawFinding[]> {
  const out: RawFinding[] = [];
  const ports = ctx.scopePorts.length ? ctx.scopePorts : [80, 443];
  if (ctx.intensity === "passive") {
    out.push({
      category: "surface",
      title: `Authorized surface: ${ctx.host} (ports ${ports.join(", ")})`,
      hint: "info",
      evidence: { host: ctx.host, ports },
    });
    return out;
  }
  for (const port of ports.slice(0, 24)) {
    const open = await ctx.tcpProbe(port);
    if (open) {
      out.push({
        category: "surface",
        title: `Open service: ${ctx.host}:${port}`,
        hint: "info",
        evidence: { host: ctx.host, port },
      });
    }
  }
  return out;
}
