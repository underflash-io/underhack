"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ERRORS: Record<string, string> = {
  no_admin: "No admin account exists yet.",
  not_provisioned: "That account isn't a provisioned admin.",
  oauth_cancelled: "Sign-in was cancelled.",
  oauth_failed: "OAuth sign-in failed. Try again.",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<{ google: boolean; x: boolean }>({
    google: false,
    x: false,
  });

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("e");
    if (e && ERRORS[e]) setErr(ERRORS[e]);
    fetch("/api/auth/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (c) setDemo({ google: !c.google, x: !c.x });
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next || "/dashboard");
      router.refresh();
    } else {
      setErr("Invalid email or password.");
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand">
          UNDER<span>HACK</span>
        </div>
        <p className="tagline">Breach monitoring console</p>

        {err && <div className="login-err">{err}</div>}

        <form onSubmit={submit}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@underhack.local"
            required
          />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <button className="btn-primary" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="divider"><span>or</span></div>

        <a className="btn-oauth" href="/auth/google">
          Continue with Google {demo.google && <em>· demo</em>}
        </a>
        <a className="btn-oauth" href="/auth/x">
          Continue with X {demo.x && <em>· demo</em>}
        </a>

        {(demo.google || demo.x) && (
          <p className="demo-hint">
            Providers in <strong>demo mode</strong> sign you in as the base admin.
            Add real credentials in Admin → Sign-in providers.
          </p>
        )}
      </div>
    </div>
  );
}
