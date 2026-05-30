"use client";

import { useEffect, useState } from "react";

type Key = {
  id: string;
  label: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<{ token: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const r = await fetch("/api/keys", { cache: "no-store" });
    if (r.ok) setKeys(((await r.json()).data ?? []) as Key[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || busy) return;
    setBusy(true);
    const r = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim() }),
    });
    if (r.ok) {
      const j = await r.json();
      setRevealed({ token: j.token, label: j.label });
      setLabel("");
      await load();
    }
    setBusy(false);
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Existing integrations will stop working.")) return;
    await fetch(`/api/keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <main className="settings-page">
      <header className="page-head">
        <h1>API keys</h1>
        <p className="page-sub">
          Create tokens to read alerts and register webhooks via the <code>/api/v1</code> endpoints.
        </p>
      </header>

      <section className="panel">
        <form className="form-row" onSubmit={create}>
          <label className="form-label">
            <span>New key label</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. production-cron"
              maxLength={80}
              required
            />
          </label>
          <button type="submit" className="btn" disabled={busy || !label.trim()}>
            {busy ? "Creating…" : "Create key"}
          </button>
        </form>
      </section>

      {revealed && (
        <section className="panel callout">
          <h2 className="kicker">One-time token for &ldquo;{revealed.label}&rdquo;</h2>
          <div className="token-row">
            <pre className="token">{revealed.token}</pre>
            <button
              type="button"
              className="btn-ghost sm"
              onClick={async () => {
                await navigator.clipboard.writeText(revealed.token);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <p>Copy this now. It will never be shown again — we only keep a hash.</p>
          <button type="button" className="btn" onClick={() => setRevealed(null)}>I&apos;ve saved it</button>
        </section>
      )}

      <section className="panel">
        <h2 className="kicker">Active keys</h2>
        {keys.length === 0 && <p className="empty">No keys yet. Create one above.</p>}
        <ul className="key-list">
          {keys.map((k) => (
            <li key={k.id} className={k.revoked_at ? "revoked" : ""}>
              <div>
                <div className="key-label">{k.label}</div>
                <div className="key-meta">
                  <code>{k.prefix}…</code>
                  <span>created {new Date(k.created_at).toLocaleDateString()}</span>
                  {k.last_used_at && <span>last used {new Date(k.last_used_at).toLocaleDateString()}</span>}
                  {k.revoked_at && <span className="revoked-tag">REVOKED</span>}
                </div>
              </div>
              {!k.revoked_at && (
                <button className="btn btn-ghost" onClick={() => revoke(k.id)}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="kicker">Quick start</h2>
        <pre className="code">{`curl -H "Authorization: Bearer YOUR_KEY" \\
  https://your-host/api/v1/alerts?severity=critical`}</pre>
        <p>
          See <a href="/docs/api">API docs</a> for the full reference and webhook signing.
        </p>
      </section>
    </main>
  );
}
