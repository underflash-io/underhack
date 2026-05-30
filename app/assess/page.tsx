"use client";

import { useEffect, useState, useCallback } from "react";
import { rel } from "@/lib/format";

type Challenge = {
  method: string;
  host: string;
  dnsName: string;
  httpUrl: string;
  token: string;
};

type Authorization = {
  id: string;
  label: string;
  basis: string;
  contact: string | null;
  scope: string;
  exclusions: string;
  intensity_max: string;
  verify_method: string;
  verify_token: string;
  status: string;
  created_at: string;
  verified_at: string | null;
  expires_at: string | null;
  challenge?: Challenge;
};

type Assessment = {
  id: string;
  authorization_id: string;
  target: string;
  intensity: string;
  status: string;
  stats: string | null;
  note: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type Finding = {
  id: string;
  assessment_id: string;
  category: string;
  title: string;
  severity: string;
  score: number;
  factors: string | null;
  cwe: string | null;
  related_cve: string | null;
  target: string;
  evidence: string | null;
  recommendation: string | null;
  created_at: string;
};

type AuditEntry = {
  id: number;
  ts: string;
  actor: string | null;
  action: string;
  authorization_id: string | null;
  assessment_id: string | null;
  detail: string | null;
};

const INTENSITY = ["passive", "baseline", "thorough"];

export default function AssessPage() {
  const [authz, setAuthz] = useState<Authorization[]>([]);
  const [jobs, setJobs] = useState<Assessment[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [chain, setChain] = useState<{ ok: boolean; brokenAt?: number }>({ ok: true });

  const loadAuthz = useCallback(async () => {
    const r = await fetch("/api/authorizations", { cache: "no-store" });
    if (r.ok) setAuthz((await r.json()).authorizations);
  }, []);
  const loadJobs = useCallback(async () => {
    const r = await fetch("/api/assessments", { cache: "no-store" });
    if (r.ok) setJobs((await r.json()).assessments);
  }, []);
  const loadFindings = useCallback(async (id: string) => {
    const r = await fetch(`/api/assessments/${id}/findings`, { cache: "no-store" });
    if (r.ok) setFindings((await r.json()).findings);
  }, []);
  const loadAudit = useCallback(async () => {
    const r = await fetch("/api/audit", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setAudit(d.entries);
      setChain(d.chain);
    }
  }, []);

  useEffect(() => {
    loadAuthz();
    loadJobs();
    loadAudit();
    const t = setInterval(() => {
      loadJobs();
      if (selected) loadFindings(selected);
    }, 4000);
    return () => clearInterval(t);
  }, [loadAuthz, loadJobs, loadAudit, loadFindings, selected]);

  useEffect(() => {
    if (selected) loadFindings(selected);
  }, [selected, loadFindings]);

  return (
    <main className="container">
      <header className="page-head">
        <h1>Authorized Assessment</h1>
        <p className="muted">
          Non-destructive vulnerability detection against targets you own or are explicitly authorized to test.
          Every dispatched request is scope-checked, identifiable, and audited. No exploitation, no evasion.
        </p>
      </header>

      <AuthzSection authz={authz} reload={loadAuthz} />
      <NewAuthz reload={loadAuthz} />
      <NewAssessment authz={authz.filter((a) => a.status === "verified")} reload={loadJobs} />
      <JobsSection
        jobs={jobs}
        selected={selected}
        onSelect={setSelected}
        reload={loadJobs}
      />
      {selected && <FindingsSection findings={findings} />}
      <AuditSection entries={audit} chain={chain} />
    </main>
  );
}

// ---------------- authorizations ----------------
function AuthzSection({
  authz,
  reload,
}: {
  authz: Authorization[];
  reload: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function verify(id: string) {
    setBusy(id);
    const r = await fetch(`/api/authorizations/${id}/verify`, { method: "POST" });
    const d = await r.json();
    setBusy(null);
    reload();
    if (d.result && !d.result.ok) alert(`Verification failed: ${d.result.reason}`);
  }
  async function revoke(id: string) {
    if (!confirm("Revoke this authorization? Running jobs will be aborted.")) return;
    await fetch(`/api/authorizations/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <section className="panel">
      <h2 className="pad-h">Authorizations ({authz.length})</h2>
      <div className="rows">
        {authz.length === 0 && <p className="muted pad">None yet. Create one below.</p>}
        {authz.map((a) => {
          const scope = JSON.parse(a.scope || "{}");
          const sevClass =
            a.status === "verified"
              ? "ok"
              : a.status === "pending"
                ? "med"
                : "err";
          return (
            <div key={a.id} className={`row ${a.status === "revoked" || a.status === "expired" ? "disabled" : ""}`}>
              <div className="row-main">
                <div className="row-title">
                  {a.label}
                  <span className={`badge ${sevClass}`}>{a.status}</span>
                  <span className="badge kind">{a.basis}</span>
                  <span className="badge kind">{a.intensity_max}</span>
                </div>
                <div className="row-kw">
                  {(scope.hosts || []).join(", ")}
                  {a.expires_at && (
                    <span className="muted"> · expires {rel(a.expires_at)}</span>
                  )}
                </div>
                {a.status === "pending" && a.challenge && <Challenge c={a.challenge} method={a.verify_method} />}
              </div>
              {a.status === "pending" && (
                <button className="ghost" onClick={() => verify(a.id)} disabled={busy === a.id}>
                  {busy === a.id ? "Verifying…" : "Verify"}
                </button>
              )}
              {a.status !== "revoked" && (
                <button className="ghost danger" onClick={() => revoke(a.id)}>
                  Revoke
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Challenge({ c, method }: { c: Challenge; method: string }) {
  return (
    <div className="challenge">
      <p className="muted">Publish the challenge token, then click Verify:</p>
      {method === "dns" ? (
        <pre className="code">
          {`DNS TXT  ${c.dnsName}\nVALUE    ${c.token}`}
        </pre>
      ) : (
        <pre className="code">
          {`HTTP GET ${c.httpUrl}\nBODY     ${c.token}`}
        </pre>
      )}
    </div>
  );
}

function NewAuthz({ reload }: { reload: () => void }) {
  const [form, setForm] = useState({
    label: "",
    hosts: "",
    basis: "ownership",
    contact: "",
    intensityMax: "baseline",
    verifyMethod: "http",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setBusy(true);
    const r = await fetch("/api/authorizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setErr(d.error || "failed");
      return;
    }
    setForm({ ...form, label: "", hosts: "", contact: "" });
    reload();
  }

  return (
    <section className="panel">
      <h2 className="pad-h">New authorization</h2>
      <div className="form-grid pad">
        <label>
          Label
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. acme staging" />
        </label>
        <label>
          Basis
          <select value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value })}>
            <option value="ownership">Ownership</option>
            <option value="engagement">Engagement</option>
          </select>
        </label>
        <label className="wide">
          In-scope hosts (comma-separated; supports *.example.com)
          <input value={form.hosts} onChange={(e) => setForm({ ...form, hosts: e.target.value })} placeholder="example.com, *.staging.example.com" />
        </label>
        <label>
          Max intensity
          <select value={form.intensityMax} onChange={(e) => setForm({ ...form, intensityMax: e.target.value })}>
            {INTENSITY.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </label>
        <label>
          Verification
          <select value={form.verifyMethod} onChange={(e) => setForm({ ...form, verifyMethod: e.target.value })}>
            <option value="http">HTTP file</option>
            <option value="dns">DNS TXT</option>
          </select>
        </label>
        <label className="wide">
          Contact (optional)
          <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="security@example.com" />
        </label>
        <div className="form-actions">
          <button onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
      {err && <p className="pad err">{err}</p>}
    </section>
  );
}

// ---------------- assessments ----------------
function NewAssessment({
  authz,
  reload,
}: {
  authz: Authorization[];
  reload: () => void;
}) {
  const [form, setForm] = useState({
    authorizationId: "",
    target: "",
    intensity: "baseline",
    confirm: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setBusy(true);
    const body: Record<string, unknown> = { ...form };
    const r = await fetch("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setErr(d.error || "failed");
      return;
    }
    setForm({ ...form, target: "" });
    reload();
  }

  return (
    <section className="panel">
      <h2 className="pad-h">Start an assessment</h2>
      {authz.length === 0 ? (
        <p className="muted pad">No verified authorizations yet. Verify one above first.</p>
      ) : (
        <div className="form-grid pad">
          <label>
            Authorization
            <select
              value={form.authorizationId}
              onChange={(e) => setForm({ ...form, authorizationId: e.target.value })}
            >
              <option value="">— select —</option>
              {authz.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Intensity
            <select value={form.intensity} onChange={(e) => setForm({ ...form, intensity: e.target.value })}>
              {INTENSITY.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            Target host (must be inside the authorization's scope)
            <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="staging.example.com" />
          </label>
          {form.intensity === "thorough" && (
            <label className="wide">
              <input
                type="checkbox"
                checked={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.checked })}
                style={{ width: "auto", marginRight: 8 }}
              />
              I confirm a thorough-tier scan against this target (per-run opt-in)
            </label>
          )}
          <div className="form-actions">
            <button onClick={submit} disabled={busy || !form.authorizationId || !form.target}>
              {busy ? "Starting…" : "Start"}
            </button>
          </div>
        </div>
      )}
      {err && <p className="pad err">{err}</p>}
    </section>
  );
}

function JobsSection({
  jobs,
  selected,
  onSelect,
  reload,
}: {
  jobs: Assessment[];
  selected: string | null;
  onSelect: (id: string) => void;
  reload: () => void;
}) {
  async function abort(id: string) {
    await fetch(`/api/assessments/${id}/abort`, { method: "POST" });
    reload();
  }

  return (
    <section className="panel">
      <h2 className="pad-h">Assessments</h2>
      <table className="runs">
        <thead>
          <tr>
            <th>Target</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Started</th>
            <th>Findings</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => {
            const stats = j.stats ? JSON.parse(j.stats) : null;
            const sevClass =
              j.status === "done"
                ? "ok"
                : j.status === "running" || j.status === "queued"
                  ? "med"
                  : "err";
            return (
              <tr key={j.id}>
                <td>{j.target}</td>
                <td>{j.intensity}</td>
                <td>
                  <span className={`badge ${sevClass}`}>{j.status}</span>
                </td>
                <td className="muted">{rel(j.started_at || j.created_at)}</td>
                <td className="muted">{stats?.findings ?? "—"}</td>
                <td>
                  <button className="ghost" onClick={() => onSelect(j.id)}>
                    {selected === j.id ? "Selected" : "View"}
                  </button>
                  {(j.status === "queued" || j.status === "running") && (
                    <button className="ghost danger" onClick={() => abort(j.id)} style={{ marginLeft: 6 }}>
                      Abort
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {jobs.length === 0 && (
            <tr>
              <td colSpan={6} className="muted pad">
                No assessments yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function FindingsSection({ findings }: { findings: Finding[] }) {
  return (
    <section className="panel">
      <h2 className="pad-h">Findings ({findings.length})</h2>
      <div className="alert-list">
        {findings.length === 0 && <p className="muted pad">No findings yet for this assessment.</p>}
        {findings.map((f) => {
          const evidence = f.evidence ? JSON.parse(f.evidence) : null;
          return (
            <article key={f.id} className="alert">
              <div className={`sev-bar sev-${f.severity}`} />
              <div className="alert-body">
                <div className="alert-top">
                  <span className={`badge sev-${f.severity}`}>{f.severity}</span>
                  <span className="badge kind">{f.category}</span>
                  {f.cwe && <span className="badge kind">{f.cwe}</span>}
                  {f.related_cve && <span className="badge sys">{f.related_cve}</span>}
                  <span className="muted conf">score {f.score}</span>
                  <span className="spacer" />
                  <span className="muted">{rel(f.created_at)}</span>
                </div>
                <h3>{f.title}</h3>
                {f.recommendation && (
                  <p className="alert-rec">
                    <strong>Action:</strong> {f.recommendation}
                  </p>
                )}
                {evidence && (
                  <pre className="evidence">{JSON.stringify(evidence, null, 2)}</pre>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AuditSection({
  entries,
  chain,
}: {
  entries: AuditEntry[];
  chain: { ok: boolean; brokenAt?: number };
}) {
  return (
    <section className="panel">
      <h2 className="pad-h">
        Audit ledger{" "}
        <span className={`badge ${chain.ok ? "ok" : "err"}`}>
          chain {chain.ok ? "intact" : `broken @ ${chain.brokenAt}`}
        </span>
      </h2>
      <table className="runs">
        <thead>
          <tr>
            <th>When</th>
            <th>Action</th>
            <th>Actor</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="muted">{rel(e.ts)}</td>
              <td><span className="badge kind">{e.action}</span></td>
              <td className="muted">{e.actor ?? "system"}</td>
              <td className="muted note">{e.detail ?? "—"}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={4} className="muted pad">
                Ledger empty.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
