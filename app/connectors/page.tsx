"use client";

import { useEffect, useState, useCallback } from "react";
import { rel } from "@/lib/format";

type PublicConnector = {
  id: string;
  kind: "slack" | "email";
  name: string;
  enabled: number;
  min_severity: string;
  last_used_at: string | null;
  last_status: string | null;
  created_at: string;
  config: Record<string, string>;
  fields: string[];
};

const SEV = ["low", "medium", "high", "critical"];

export default function ConnectorsPage() {
  const [list, setList] = useState<PublicConnector[]>([]);
  const [adding, setAdding] = useState<"slack" | "email" | null>(null);
  const [saved, setSaved] = useState("");
  const flash = (m: string) => {
    setSaved(m);
    setTimeout(() => setSaved(""), 1800);
  };

  const load = useCallback(async () => {
    const r = await fetch("/api/connectors", { cache: "no-store" });
    if (r.ok) setList((await r.json()).connectors);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(c: PublicConnector) {
    await fetch(`/api/connectors/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !c.enabled }),
    });
    load();
  }
  async function setSeverity(c: PublicConnector, s: string) {
    await fetch(`/api/connectors/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minSeverity: s }),
    });
    flash("threshold saved");
    load();
  }
  async function remove(c: PublicConnector) {
    if (!confirm(`Delete connector "${c.name}"?`)) return;
    await fetch(`/api/connectors/${c.id}`, { method: "DELETE" });
    load();
  }
  async function testIt(c: PublicConnector) {
    const r = await fetch(`/api/connectors/${c.id}/test`, { method: "POST" });
    const d = await r.json();
    flash(d.result?.ok ? "test sent ✓" : `test failed: ${d.result?.detail}`);
    load();
  }

  return (
    <main className="container">
      <header className="page-head">
        <h1>Connectors</h1>
        <p className="muted">
          Outbound notification channels. Each connector receives any alert or assessment finding whose
          severity meets its threshold. Add as many as you need.
        </p>
        {saved && <span className="saved">{saved}</span>}
      </header>

      <section className="panel">
        <h2 className="pad-h">Active connectors ({list.length})</h2>
        <div className="rows">
          {list.length === 0 && (
            <p className="muted pad">No connectors yet. Add one below.</p>
          )}
          {list.map((c) => (
            <div key={c.id} className={`row ${c.enabled ? "" : "disabled"}`}>
              <div className="row-main">
                <div className="row-title">
                  {c.name}
                  <span className="badge kind">{c.kind}</span>
                  <span className={`badge ${c.last_status?.startsWith("ok") ? "ok" : c.last_status?.startsWith("error") ? "err" : "kind"}`}>
                    {c.last_status ? c.last_status.slice(0, 40) : "no sends yet"}
                  </span>
                </div>
                <div className="row-kw">
                  {c.kind === "slack"
                    ? `webhook ${c.config.webhookUrl}`
                    : `${c.config.user}@${c.config.host}:${c.config.port} → ${c.config.to}`}
                  {c.last_used_at && <span className="muted"> · last sent {rel(c.last_used_at)}</span>}
                </div>
              </div>
              <label className="inline">
                threshold
                <select value={c.min_severity} onChange={(e) => setSeverity(c, e.target.value)}>
                  {SEV.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <button className="ghost" onClick={() => testIt(c)}>
                Test
              </button>
              <button className="ghost" onClick={() => toggle(c)}>
                {c.enabled ? "Disable" : "Enable"}
              </button>
              <button className="ghost danger" onClick={() => remove(c)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="pad-h">Add a connector</h2>
        <div className="pad" style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setAdding("slack")} className={adding === "slack" ? "" : "ghost"}>
            + Slack
          </button>
          <button onClick={() => setAdding("email")} className={adding === "email" ? "" : "ghost"}>
            + Gmail / SMTP
          </button>
        </div>
        {adding === "slack" && <NewSlack onDone={() => { setAdding(null); load(); }} />}
        {adding === "email" && <NewEmail onDone={() => { setAdding(null); load(); }} />}
      </section>
    </main>
  );
}

function NewSlack({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [minSeverity, setMinSeverity] = useState("high");
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    const r = await fetch("/api/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "slack",
        name,
        minSeverity,
        config: { webhookUrl },
      }),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error || "failed");
    onDone();
  }
  return (
    <div className="form-grid pad">
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="#security alerts" />
      </label>
      <label>
        Min severity
        <select value={minSeverity} onChange={(e) => setMinSeverity(e.target.value)}>
          {SEV.map((s) => (<option key={s}>{s}</option>))}
        </select>
      </label>
      <label className="wide">
        Slack incoming webhook URL
        <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/services/T…/B…/…" />
      </label>
      <div className="form-actions">
        <button onClick={save} disabled={!name || !webhookUrl}>
          Save
        </button>
      </div>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function NewEmail({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("smtp.gmail.com");
  const [port, setPort] = useState("465");
  const [secure, setSecure] = useState(true);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minSeverity, setMinSeverity] = useState("high");
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    const r = await fetch("/api/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "email",
        name,
        minSeverity,
        config: { host, port: Number(port), secure, user, pass, from: from || user, to },
      }),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error || "failed");
    onDone();
  }
  return (
    <div className="form-grid pad">
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="security@team.com" />
      </label>
      <label>
        Min severity
        <select value={minSeverity} onChange={(e) => setMinSeverity(e.target.value)}>
          {SEV.map((s) => (<option key={s}>{s}</option>))}
        </select>
      </label>
      <label>
        SMTP host
        <input value={host} onChange={(e) => setHost(e.target.value)} />
      </label>
      <label>
        Port
        <input value={port} onChange={(e) => setPort(e.target.value)} />
      </label>
      <label className="wide">
        <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} style={{ width: "auto", marginRight: 8 }} />
        Use TLS (true for port 465, false for 587/STARTTLS)
      </label>
      <label>
        Gmail address
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="you@gmail.com" />
      </label>
      <label>
        App password
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="16-char app password" />
      </label>
      <label>
        From
        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="defaults to the Gmail address" />
      </label>
      <label>
        To (comma-separated)
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="alerts@team.com" />
      </label>
      <div className="form-actions">
        <button onClick={save} disabled={!name || !user || !pass || !to}>
          Save
        </button>
      </div>
      <p className="muted pad" style={{ gridColumn: "1/-1", fontSize: 12 }}>
        For Gmail, enable 2-Step Verification on your Google account, then create an{" "}
        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">App password</a>{" "}
        and paste it above. Standard account passwords don&apos;t work for SMTP.
      </p>
      {err && <p className="err pad">{err}</p>}
    </div>
  );
}
