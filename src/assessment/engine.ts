import tls from "tls";
import net from "net";
import { getAuthorization, isUsable } from "./authz";
import { parseScope, isInScope, assertResolvesPublic, normalizeHost } from "./scope";
import { appendAudit } from "./audit";
import { scoreFinding } from "./score";
import { USER_AGENT } from "./constants";
import {
  scanTls,
  scanHeaders,
  scanComponents,
  scanMisconfig,
  scanSurface,
  type ScanContext,
  type RawFinding,
  type TlsInfo,
} from "./scanners";
import {
  getAssessment,
  markStarted,
  markFinished,
  insertFinding,
  isAborted,
} from "./repo";
import { notifyAlert } from "../agents/notifier";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_REQUESTS = 80;

function connectTls(host: string): Promise<TlsInfo | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: TlsInfo | null) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const socket = tls.connect(
      { host, port: 443, servername: host, timeout: 8000, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        const protocol = socket.getProtocol();
        const cipher = socket.getCipher()?.name ?? null;
        let daysToExpiry: number | null = null;
        let validTo: string | null = null;
        let issuer: string | null = null;
        let selfSigned = false;
        if (cert && cert.valid_to) {
          validTo = cert.valid_to;
          daysToExpiry = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000);
          const o = cert.issuer?.O as string | string[] | undefined;
          const cn = cert.issuer?.CN as string | string[] | undefined;
          const first = (v: string | string[] | undefined) =>
            Array.isArray(v) ? v[0] ?? null : v ?? null;
          issuer = first(o) || first(cn) || null;
          selfSigned = !!(cert.issuer && cert.subject && JSON.stringify(cert.issuer) === JSON.stringify(cert.subject));
        }
        socket.end();
        finish({ protocol, cipher, validTo, daysToExpiry, issuer, selfSigned });
      }
    );
    socket.on("error", () => finish(null));
    socket.on("timeout", () => {
      socket.destroy();
      finish(null);
    });
  });
}

function probeTcp(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 4000 });
    const done = (v: boolean) => {
      s.destroy();
      resolve(v);
    };
    s.on("connect", () => done(true));
    s.on("error", () => resolve(false));
    s.on("timeout", () => done(false));
  });
}

// Orchestrate a non-destructive assessment against one verified, in-scope target.
export async function runAssessment(jobId: string): Promise<void> {
  const job = getAssessment(jobId);
  if (!job) return;
  const authz = getAuthorization(job.authorization_id);
  const usable = authz ? isUsable(authz) : { ok: false, reason: "no authorization" };
  if (!authz || !usable.ok) {
    markFinished(jobId, "error", {}, `authorization not usable: ${usable.reason}`);
    appendAudit({ action: "assess.error", assessmentId: jobId, detail: { reason: usable.reason } });
    return;
  }

  markStarted(jobId);
  appendAudit({
    action: "assess.start",
    authorizationId: authz.id,
    assessmentId: jobId,
    detail: { target: job.target, intensity: job.intensity },
  });

  const host = normalizeHost(job.target);
  const scope = parseScope(authz.scope);
  const delay = job.intensity === "passive" ? 1500 : job.intensity === "thorough" ? 250 : 450;

  let requests = 0;
  let consecutiveErrors = 0;
  let lastReq = 0;
  const distress = { aborted: false, reason: "" };

  const checkHalt = (): boolean => {
    if (distress.aborted) return true;
    if (isAborted(jobId)) {
      distress.aborted = true;
      distress.reason = "operator abort";
    }
    if (requests >= MAX_REQUESTS) {
      distress.aborted = true;
      distress.reason = "budget";
    }
    return distress.aborted;
  };

  const rateGate = async () => {
    const wait = lastReq + delay - Date.now();
    if (wait > 0) await sleep(wait);
    lastReq = Date.now();
  };

  const denyAudit = (url: string, reason?: string) =>
    appendAudit({ action: "scope.deny", authorizationId: authz.id, assessmentId: jobId, detail: { url, reason } });

  const ctx: ScanContext = {
    host,
    intensity: job.intensity as ScanContext["intensity"],
    scopePorts: scope.ports,
    async get(path) {
      if (checkHalt()) return null;
      const url = `https://${host}${path}`;
      const sc = isInScope(url, authz);
      if (!sc.ok) {
        denyAudit(url, sc.reason);
        return null;
      }
      const pub = await assertResolvesPublic(host);
      if (!pub.ok) {
        denyAudit(url, pub.reason);
        return null;
      }
      await rateGate();
      requests++;
      appendAudit({ action: "assess.dispatch", authorizationId: authz.id, assessmentId: jobId, detail: { method: "GET", url } });
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { "User-Agent": USER_AGENT },
          redirect: "manual", // never follow links/redirects off-scope
          signal: AbortSignal.timeout(8000),
        });
        consecutiveErrors = 0;
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
        const cl = headers["content-length"];
        const blocked = res.status === 403 || res.status === 429;
        try {
          await res.body?.cancel(); // discard body — detection only
        } catch {
          /* ignore */
        }
        return { status: res.status, headers, contentLength: cl ? Number(cl) : null, blocked };
      } catch {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          distress.aborted = true;
          distress.reason = "sustained errors";
        }
        return null;
      }
    },
    async tls() {
      if (checkHalt()) return null;
      const url = `https://${host}`;
      const sc = isInScope(url, authz);
      if (!sc.ok) {
        denyAudit(url, sc.reason);
        return null;
      }
      const pub = await assertResolvesPublic(host);
      if (!pub.ok) {
        denyAudit(url, pub.reason);
        return null;
      }
      await rateGate();
      requests++;
      appendAudit({ action: "assess.dispatch", authorizationId: authz.id, assessmentId: jobId, detail: { method: "TLS", target: `${host}:443` } });
      return connectTls(host);
    },
    async tcpProbe(port) {
      if (checkHalt()) return false;
      const url = `https://${host}:${port}`;
      const sc = isInScope(url, authz);
      if (!sc.ok) {
        denyAudit(url, sc.reason);
        return false;
      }
      const pub = await assertResolvesPublic(host);
      if (!pub.ok) return false;
      await rateGate();
      requests++;
      appendAudit({ action: "assess.dispatch", authorizationId: authz.id, assessmentId: jobId, detail: { method: "TCP", target: `${host}:${port}` } });
      return probeTcp(host, port);
    },
  };

  const raw: RawFinding[] = [];
  try {
    raw.push(...(await scanTls(ctx)));
    if (!checkHalt()) {
      const h = await scanHeaders(ctx);
      raw.push(...h.findings);
      if (!checkHalt()) raw.push(...scanComponents(h.headers, host));
    }
    if ((job.intensity === "baseline" || job.intensity === "thorough") && !checkHalt()) {
      raw.push(...(await scanMisconfig(ctx)));
    }
    if (!checkHalt()) raw.push(...(await scanSurface(ctx)));
  } catch (err) {
    distress.aborted = true;
    distress.reason = (err as Error).message;
  }

  const counts: Record<string, number> = {};
  for (const f of raw) {
    const scored = scoreFinding(f.hint, f.factors);
    const fr = insertFinding({
      assessmentId: jobId,
      authorizationId: authz.id,
      category: f.category,
      title: f.title,
      severity: scored.severity,
      score: scored.score,
      factors: scored.factors,
      cwe: f.cwe ?? null,
      relatedCve: f.relatedCve ?? null,
      target: host,
      evidence: f.evidence,
      recommendation: f.recommendation ?? null,
    });
    counts[f.category] = (counts[f.category] ?? 0) + 1;
    if (scored.severity === "high" || scored.severity === "critical") {
      try {
        await notifyAlert({
          id: fr.id,
          finding_id: "",
          system_id: null,
          severity: scored.severity,
          confidence: null,
          title: `[assessment] ${f.title}`,
          summary: `${host} — ${f.category}`,
          recommendation: f.recommendation ?? null,
          affected_apis: f.relatedCve ? JSON.stringify([f.relatedCve]) : null,
          status: "open",
          triage_method: "assessment",
          created_at: fr.created_at,
        } as never);
      } catch {
        /* notification is best-effort */
      }
    }
  }

  const finalStatus = distress.aborted && distress.reason !== "budget" ? "aborted" : "done";
  markFinished(jobId, finalStatus, { counts, requests, distress: distress.reason || null, findings: raw.length }, distress.reason || undefined);
  appendAudit({
    action: "assess.finish",
    authorizationId: authz.id,
    assessmentId: jobId,
    detail: { status: finalStatus, counts, requests, findings: raw.length },
  });
}
