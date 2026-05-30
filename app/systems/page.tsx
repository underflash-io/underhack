"use client";

import { useEffect, useState, useCallback } from "react";

type System = {
  id: string;
  name: string;
  vendor: string | null;
  keywords: string;
  criticality: string;
  severity_threshold: string;
  enabled: number;
};

const SEV = ["low", "medium", "high", "critical"];
const CRIT = ["low", "medium", "high"];

const EMPTY = {
  name: "",
  vendor: "",
  keywords: "",
  criticality: "medium",
  severityThreshold: "medium",
};

export default function SystemsPage() {
  const [systems, setSystems] = useState<System[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/systems", { cache: "no-store" });
    if (r.ok) setSystems((await r.json()).systems);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!form.name.trim()) return;
    setBusy(true);
    await fetch("/api/systems", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ ...EMPTY });
    setBusy(false);
    load();
  }

  async function toggle(s: System) {
    await fetch("/api/systems/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, enabled: !s.enabled }),
    });
    load();
  }

  async function updateThreshold(s: System, severityThreshold: string) {
    await fetch("/api/systems/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, severityThreshold }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this system?")) return;
    await fetch("/api/systems/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <main className="container">
      <header className="page-head">
        <h1>Monitored Systems</h1>
        <p className="muted">
          Each system defines keywords the triage agent matches findings against, plus the minimum
          severity that raises an alert.
        </p>
      </header>

      <section className="panel">
        <h2 className="pad-h">Add a system</h2>
        <div className="form-grid pad">
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Production Kubernetes"
            />
          </label>
          <label>
            Vendor
            <input
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              placeholder="e.g. VMware"
            />
          </label>
          <label className="wide">
            Keywords (comma-separated)
            <input
              value={form.keywords}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              placeholder="kubernetes, k8s, container, ingress-nginx"
            />
          </label>
          <label>
            Criticality
            <select
              value={form.criticality}
              onChange={(e) => setForm({ ...form, criticality: e.target.value })}
            >
              {CRIT.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Alert threshold
            <select
              value={form.severityThreshold}
              onChange={(e) => setForm({ ...form, severityThreshold: e.target.value })}
            >
              {SEV.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button onClick={add} disabled={busy}>
              {busy ? "Adding…" : "Add system"}
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="pad-h">Systems ({systems.length})</h2>
        <div className="rows">
          {systems.map((s) => (
            <div key={s.id} className={`row ${s.enabled ? "" : "disabled"}`}>
              <div className="row-main">
                <div className="row-title">
                  {s.name}
                  {s.vendor && <span className="muted"> · {s.vendor}</span>}
                  <span className={`badge crit-${s.criticality}`}>{s.criticality}</span>
                </div>
                <div className="row-kw muted">{s.keywords || "no keywords"}</div>
              </div>
              <label className="inline">
                threshold
                <select
                  value={s.severity_threshold}
                  onChange={(e) => updateThreshold(s, e.target.value)}
                >
                  {SEV.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <button className="ghost" onClick={() => toggle(s)}>
                {s.enabled ? "Disable" : "Enable"}
              </button>
              <button className="ghost danger" onClick={() => remove(s.id)}>
                Delete
              </button>
            </div>
          ))}
          {systems.length === 0 && <p className="muted pad">No systems yet.</p>}
        </div>
      </section>
    </main>
  );
}
