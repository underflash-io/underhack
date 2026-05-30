"use client";

import { useEffect, useState, useCallback } from "react";
import { rel } from "@/lib/format";

type Source = {
  id: string;
  name: string;
  kind: string;
  url: string;
  enabled: number;
  last_polled_at: string | null;
  last_status: string | null;
};

type User = {
  id: string;
  email: string;
  role: string;
  xHandle?: string;
  googleSub?: string;
  xId?: string;
  createdAt: string;
};

type Settings = {
  alerting: {
    pollIntervalSec: number;
    defaultSeverityThreshold: string;
    slackWebhook: string;
    genericWebhook: string;
    slackConfigured: boolean;
    webhookConfigured: boolean;
  };
  auth: {
    baseUrl: string;
    providers: Record<
      string,
      { label: string; configured: boolean; clientId: string; clientSecret: string }
    >;
  };
};

const KINDS = ["kev", "nvd", "rss"];
const SEV = ["low", "medium", "high", "critical"];

export default function AdminPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [saved, setSaved] = useState("");

  const flash = (m: string) => {
    setSaved(m);
    setTimeout(() => setSaved(""), 2000);
  };

  const loadSources = useCallback(async () => {
    const r = await fetch("/api/sources", { cache: "no-store" });
    if (r.ok) setSources((await r.json()).sources);
  }, []);
  const loadSettings = useCallback(async () => {
    const r = await fetch("/api/settings", { cache: "no-store" });
    if (r.ok) setSettings(await r.json());
  }, []);
  const loadUsers = useCallback(async () => {
    const r = await fetch("/api/users", { cache: "no-store" });
    if (r.ok) setUsers((await r.json()).users);
  }, []);

  useEffect(() => {
    loadSources();
    loadSettings();
    loadUsers();
  }, [loadSources, loadSettings, loadUsers]);

  return (
    <main className="container">
      <header className="page-head">
        <h1>Admin</h1>
        <p className="muted">Sources, alerting, sign-in providers, and admin accounts.</p>
        {saved && <span className="saved">{saved} ✓</span>}
      </header>

      <Sources sources={sources} reload={loadSources} flash={flash} />
      {settings && <Alerting settings={settings} reload={loadSettings} flash={flash} />}
      {settings && <Providers settings={settings} reload={loadSettings} flash={flash} />}
      <Admins users={users} reload={loadUsers} flash={flash} />
    </main>
  );
}

function Sources({
  sources,
  reload,
  flash,
}: {
  sources: Source[];
  reload: () => void;
  flash: (m: string) => void;
}) {
  const [form, setForm] = useState({ name: "", kind: "rss", url: "" });

  async function add() {
    if (!form.name.trim() || !form.url.trim()) return;
    const r = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (r.ok) {
      setForm({ name: "", kind: "rss", url: "" });
      flash("source added");
      reload();
    }
  }
  async function toggle(id: string) {
    await fetch("/api/sources/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    reload();
  }
  async function remove(id: string) {
    if (!confirm("Delete source?")) return;
    await fetch("/api/sources/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    reload();
  }

  return (
    <section className="panel">
      <h2 className="pad-h">Sources</h2>
      <div className="rows">
        {sources.map((s) => (
          <div key={s.id} className={`row ${s.enabled ? "" : "disabled"}`}>
            <div className="row-main">
              <div className="row-title">
                {s.name}
                <span className="badge kind">{s.kind}</span>
                {s.last_status && s.last_status !== "ok" && (
                  <span className="badge err">{s.last_status}</span>
                )}
              </div>
              <div className="row-kw muted">{s.url}</div>
            </div>
            <span className="muted">{s.last_polled_at ? rel(s.last_polled_at) : "never"}</span>
            <button className="ghost" onClick={() => toggle(s.id)}>
              {s.enabled ? "Disable" : "Enable"}
            </button>
            <button className="ghost danger" onClick={() => remove(s.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="form-grid pad">
        <label>
          Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Kind
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="wide">
          URL
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </label>
        <div className="form-actions">
          <button onClick={add}>Add source</button>
        </div>
      </div>
    </section>
  );
}

function Alerting({
  settings,
  reload,
  flash,
}: {
  settings: Settings;
  reload: () => void;
  flash: (m: string) => void;
}) {
  const a = settings.alerting;
  const [poll, setPoll] = useState(a.pollIntervalSec);
  const [threshold, setThreshold] = useState(a.defaultSeverityThreshold);
  const [slack, setSlack] = useState("");
  const [webhook, setWebhook] = useState("");

  async function save() {
    const body: Record<string, unknown> = {
      pollIntervalSec: poll,
      defaultSeverityThreshold: threshold,
    };
    if (slack) body.slackWebhook = slack;
    if (webhook) body.genericWebhook = webhook;
    const r = await fetch("/api/settings/alerting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setSlack("");
      setWebhook("");
      flash("alerting saved");
      reload();
    }
  }

  return (
    <section className="panel">
      <h2 className="pad-h">Alerting</h2>
      <div className="form-grid pad">
        <label>
          Poll interval (seconds)
          <input type="number" value={poll} onChange={(e) => setPoll(Number(e.target.value))} />
        </label>
        <label>
          Default severity threshold
          <select value={threshold} onChange={(e) => setThreshold(e.target.value)}>
            {SEV.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="wide">
          Slack webhook {a.slackConfigured && <span className="muted">(configured)</span>}
          <input
            type="password"
            value={slack}
            onChange={(e) => setSlack(e.target.value)}
            placeholder={a.slackConfigured ? a.slackWebhook : "https://hooks.slack.com/…"}
          />
        </label>
        <label className="wide">
          Generic webhook {a.webhookConfigured && <span className="muted">(configured)</span>}
          <input
            type="password"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            placeholder={a.webhookConfigured ? a.genericWebhook : "https://your-system/api/alerts"}
          />
        </label>
        <div className="form-actions">
          <button onClick={save}>Save alerting</button>
        </div>
      </div>
    </section>
  );
}

function Providers({
  settings,
  reload,
  flash,
}: {
  settings: Settings;
  reload: () => void;
  flash: (m: string) => void;
}) {
  const [baseUrl, setBaseUrl] = useState(settings.auth.baseUrl);

  async function saveBase() {
    const r = await fetch("/api/settings/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl }),
    });
    if (r.ok) {
      flash("base URL saved");
      reload();
    }
  }

  return (
    <section className="panel">
      <h2 className="pad-h">Sign-in providers</h2>
      <div className="form-grid pad">
        <label className="wide">
          Base URL (for OAuth redirect URIs)
          <div className="inline-row">
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            <button onClick={saveBase}>Save</button>
          </div>
        </label>
      </div>
      <div className="provider-grid pad">
        {Object.entries(settings.auth.providers).map(([id, p]) => (
          <ProviderCard
            key={id}
            id={id}
            label={p.label}
            configured={p.configured}
            clientId={p.clientId}
            clientSecret={p.clientSecret}
            baseUrl={settings.auth.baseUrl}
            reload={reload}
            flash={flash}
          />
        ))}
      </div>
    </section>
  );
}

function ProviderCard({
  id,
  label,
  configured,
  clientId,
  clientSecret,
  baseUrl,
  reload,
  flash,
}: {
  id: string;
  label: string;
  configured: boolean;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  reload: () => void;
  flash: (m: string) => void;
}) {
  const [cid, setCid] = useState("");
  const [secret, setSecret] = useState("");

  async function save() {
    const body: Record<string, unknown> = { id };
    if (cid) body.clientId = cid;
    if (secret) body.clientSecret = secret;
    const r = await fetch("/api/settings/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setCid("");
      setSecret("");
      flash(`${label} saved`);
      reload();
    }
  }

  return (
    <div className="provider-card">
      <div className="provider-head">
        <strong>{label}</strong>
        <span className={`badge ${configured ? "ok" : "med"}`}>
          {configured ? "configured" : "demo mode"}
        </span>
      </div>
      <label>
        Client ID
        <input
          value={cid}
          onChange={(e) => setCid(e.target.value)}
          placeholder={clientId || "not set"}
        />
      </label>
      <label>
        Client secret
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={clientSecret || "not set"}
        />
      </label>
      <div className="redirect">
        Redirect URI: <code>{baseUrl}/auth/{id}/callback</code>
      </div>
      <button onClick={save}>Save {label}</button>
    </div>
  );
}

function Admins({
  users,
  reload,
  flash,
}: {
  users: User[];
  reload: () => void;
  flash: (m: string) => void;
}) {
  const [form, setForm] = useState({ email: "", password: "", xHandle: "" });
  const [err, setErr] = useState("");

  async function add() {
    setErr("");
    const r = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    if (r.ok) {
      setForm({ email: "", password: "", xHandle: "" });
      flash("admin added");
      reload();
    } else {
      setErr(d.error || "failed");
    }
  }
  async function remove(id: string) {
    if (!confirm("Remove this admin?")) return;
    const r = await fetch("/api/users/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const d = await r.json();
    if (!r.ok) setErr(d.error || "failed");
    reload();
  }

  return (
    <section className="panel">
      <h2 className="pad-h">Admins</h2>
      <div className="rows">
        {users.map((u) => (
          <div key={u.id} className="row">
            <div className="row-main">
              <div className="row-title">
                {u.email}
                {u.xHandle && <span className="muted"> · @{u.xHandle}</span>}
              </div>
              <div className="row-kw muted">
                {[u.googleSub && "google", u.xId && "x", "password"].filter(Boolean).join(" · ")}
              </div>
            </div>
            <span className="muted">{rel(u.createdAt)}</span>
            <button className="ghost danger" onClick={() => remove(u.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="form-grid pad">
        <label>
          Email
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label>
          X handle (optional)
          <input
            value={form.xHandle}
            onChange={(e) => setForm({ ...form, xHandle: e.target.value })}
          />
        </label>
        <div className="form-actions">
          <button onClick={add}>Add admin</button>
        </div>
      </div>
      {err && <p className="pad err">{err}</p>}
    </section>
  );
}
