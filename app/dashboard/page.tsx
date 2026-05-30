"use client";

import { useEffect, useState, useCallback } from "react";
import { rel, parseList } from "@/lib/format";

type Alert = {
  id: string;
  finding_id: string;
  system_id: string | null;
  system_name: string | null;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  title: string;
  summary: string | null;
  recommendation: string | null;
  affected_apis: string | null;
  status: string;
  triage_method: string;
  finding_url: string | null;
  created_at: string;
};

type Stats = {
  alertsOpen: number;
  alertsCritical: number;
  alertsHigh: number;
  findingsTotal: number;
  findingsUntriaged: number;
  systemsMonitored: number;
  sourcesEnabled: number;
};

type Run = {
  id: string;
  agent: string;
  status: string;
  items_in: number;
  items_out: number;
  started_at: string;
  finished_at: string | null;
  note: string | null;
};

const SEVERITIES: { value: string; label: string }[] = [
  { value: "all", label: "All severities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];
const STATUSES: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "ack", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("open");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (severity !== "all") qs.set("severity", severity);
    if (status !== "all") qs.set("status", status);
    const r = await fetch(`/api/dashboard?${qs}`, { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setStats(d.stats);
      setAlerts(d.alerts);
      setRuns(d.runs);
    }
    setLoading(false);
  }, [severity, status]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function setAlertStatus(id: string, s: string) {
    await fetch("/api/alerts/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: s }),
    });
    load();
  }

  const lastCollector = runs.find((r) => r.agent === "collector");
  const lastTriage = runs.find((r) => r.agent === "triage");

  const q = query.trim().toLowerCase();
  const visible = q
    ? alerts.filter((a) =>
        [a.title, a.summary, a.system_name, a.affected_apis]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q))
      )
    : alerts;

  const onboardingNeeded =
    stats && stats.systemsMonitored === 0;

  return (
    <main className="container">
      <header className="page-head">
        <h1>Breach Monitor</h1>
        <p className="muted">
          Autonomous agents watching {stats?.sourcesEnabled ?? "—"} sources for threats to{" "}
          {stats?.systemsMonitored ?? "—"} systems you care about.
        </p>
      </header>

      {onboardingNeeded && (
        <div className="onboard-cta">
          <div>
            <strong>You haven&apos;t added any systems yet.</strong>{" "}
            <span className="muted">Add what your team runs so we can surface what matters.</span>
          </div>
          <a className="btn-primary" href="/onboarding">Get started →</a>
        </div>
      )}

      <section className="stat-grid">
        <Stat label="Open alerts" value={stats?.alertsOpen} />
        <Stat label="Critical" value={stats?.alertsCritical} tone="crit" />
        <Stat label="High" value={stats?.alertsHigh} tone="high" />
        <Stat label="Findings" value={stats?.findingsTotal} />
        <Stat label="Untriaged" value={stats?.findingsUntriaged} tone="med" />
        <Stat label="Systems" value={stats?.systemsMonitored} />
      </section>

      <section className="agent-health">
        <AgentPill label="Collector" run={lastCollector} />
        <AgentPill label="Triage" run={lastTriage} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Alerts</h2>
          <div className="filters">
            <input
              type="search"
              placeholder="Search title, system, API…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search"
            />
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Filter by severity">
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="alert-list">
          {loading && (
            <div className="empty">
              <p className="muted">Loading alerts…</p>
            </div>
          )}
          {!loading && visible.length === 0 && (
            <div className="empty">
              <h3>No matching alerts</h3>
              <p>
                {query
                  ? "Try clearing the search or changing filters."
                  : status === "open"
                    ? "You're all caught up. New findings appear here within seconds of being triaged."
                    : "No alerts in this state right now."}
              </p>
              {query && (
                <button type="button" className="btn-ghost sm" onClick={() => setQuery("")}>
                  Clear search
                </button>
              )}
            </div>
          )}
          {visible.map((a) => (
            <article key={a.id} className="alert">
              <div className={`sev-bar sev-${a.severity}`} />
              <div className="alert-body">
                <div className="alert-top">
                  <span className={`badge sev-${a.severity}`}>{a.severity}</span>
                  {a.system_name && <span className="badge sys">{a.system_name}</span>}
                  <span className="badge method">{a.triage_method}</span>
                  <span className="muted conf">{Math.round(a.confidence * 100)}% conf</span>
                  <span className="spacer" />
                  <span className="muted">{rel(a.created_at)}</span>
                </div>
                <h3>{a.title}</h3>
                {a.summary && <p className="alert-sum">{a.summary}</p>}
                {a.recommendation && (
                  <p className="alert-rec">
                    <strong>Action:</strong> {a.recommendation}
                  </p>
                )}
                {parseList(a.affected_apis).length > 0 && (
                  <div className="api-tags">
                    {parseList(a.affected_apis).map((api) => (
                      <span key={api} className="api-tag">
                        {api}
                      </span>
                    ))}
                  </div>
                )}
                <div className="alert-actions">
                  {a.finding_url && (
                    <a href={a.finding_url} target="_blank" rel="noreferrer" className="link">
                      source ↗
                    </a>
                  )}
                  <span className="spacer" />
                  {a.status !== "ack" && (
                    <button type="button" className="btn-ghost sm" onClick={() => setAlertStatus(a.id, "ack")}>
                      Acknowledge
                    </button>
                  )}
                  {a.status !== "resolved" && (
                    <button type="button" className="btn-ghost sm" onClick={() => setAlertStatus(a.id, "resolved")}>
                      Resolve
                    </button>
                  )}
                  {a.status !== "dismissed" && (
                    <button type="button" className="btn-ghost sm ghost-quiet" onClick={() => setAlertStatus(a.id, "dismissed")}>
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone?: string;
}) {
  return (
    <div className="stat">
      <div className={`stat-val ${tone ? "t-" + tone : ""}`}>{value ?? "—"}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function AgentPill({ label, run }: { label: string; run?: Run }) {
  const ok = run?.status === "ok";
  return (
    <div className="agent-pill">
      <span className={`dot ${run ? (ok ? "ok" : "err") : "idle"}`} />
      <span className="agent-name">{label}</span>
      <span className="muted">
        {run ? `${rel(run.finished_at || run.started_at)} · +${run.items_out}` : "no runs yet"}
      </span>
    </div>
  );
}
