"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StepId = "system" | "sources" | "notify" | "done";

const STEPS: { id: StepId; title: string; sub: string }[] = [
  { id: "system", title: "What are you protecting?", sub: "Tell us about one product or stack." },
  { id: "sources", title: "Pick intel sources", sub: "Where should we watch for new threats?" },
  { id: "notify", title: "How should we ping you?", sub: "Optional — you can also use the API." },
  { id: "done", title: "All set", sub: "Your first scan kicks off in the background." },
];

const SOURCE_PRESETS = [
  { id: "kev", name: "CISA KEV", url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", kind: "kev", desc: "Known exploited vulns, the must-watch list." },
  { id: "nvd", name: "NVD Recent", url: "https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=200", kind: "nvd", desc: "Fresh CVEs from the National Vulnerability Database." },
  { id: "hibp", name: "HaveIBeenPwned breaches", url: "https://haveibeenpwned.com/api/v3/breaches", kind: "rss", desc: "Newly disclosed data breaches." },
];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("system");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // step 1
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [keywords, setKeywords] = useState("");

  // step 2
  const [enabledSources, setEnabledSources] = useState<Set<string>>(new Set(["kev"]));

  // step 3
  const [notify, setNotify] = useState<"none" | "slack" | "email">("none");
  const [slackUrl, setSlackUrl] = useState("");
  const [emailTo, setEmailTo] = useState("");

  // skip if already onboarded
  useEffect(() => {
    fetch("/api/dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if ((d?.stats?.systemsMonitored ?? 0) > 0) router.replace("/dashboard");
      })
      .catch(() => {});
  }, [router]);

  async function saveSystem() {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/systems", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        vendor: vendor.trim() || undefined,
        keywords: keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
      }),
    });
    setBusy(false);
    if (!r.ok) {
      setErr("Couldn't save. Check the name and try again.");
      return false;
    }
    return true;
  }

  async function saveSources() {
    setBusy(true);
    setErr(null);
    const picks = SOURCE_PRESETS.filter((s) => enabledSources.has(s.id));
    for (const s of picks) {
      await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: s.name, url: s.url, kind: s.kind }),
      });
    }
    setBusy(false);
    return true;
  }

  async function saveNotify() {
    if (notify === "none") return true;
    setBusy(true);
    setErr(null);
    let body: unknown = null;
    if (notify === "slack") {
      if (!/^https:\/\/hooks\.slack\.com\//.test(slackUrl)) {
        setErr("Slack URL should start with https://hooks.slack.com/");
        setBusy(false);
        return false;
      }
      body = {
        kind: "slack",
        name: "Slack",
        config: { webhookUrl: slackUrl.trim() },
        minSeverity: "high",
      };
    } else {
      if (!emailTo.includes("@")) {
        setErr("Enter a valid email address.");
        setBusy(false);
        return false;
      }
      // The full SMTP config will come later from the Connectors page; for now
      // just record an email destination so onboarding is non-blocking.
      body = null;
    }
    if (body) {
      const r = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setBusy(false);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? "Couldn't save notification settings.");
        return false;
      }
    } else {
      setBusy(false);
    }
    return true;
  }

  async function next() {
    if (step === "system") {
      if (!name.trim()) {
        setErr("Give it a name (e.g. 'Production stack').");
        return;
      }
      if (await saveSystem()) setStep("sources");
    } else if (step === "sources") {
      if (enabledSources.size === 0) {
        setErr("Pick at least one source.");
        return;
      }
      if (await saveSources()) setStep("notify");
    } else if (step === "notify") {
      if (await saveNotify()) setStep("done");
    } else {
      router.push("/dashboard");
    }
  }

  function back() {
    setErr(null);
    if (step === "sources") setStep("system");
    else if (step === "notify") setStep("sources");
    else if (step === "done") setStep("notify");
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <main className="onboarding">
      <div className="onb-progress">
        {STEPS.map((s, i) => (
          <div key={s.id} className={`onb-step ${i <= stepIndex ? "active" : ""}`}>
            <span>{i + 1}</span>
            <em>{s.title.split(" ")[0]}</em>
          </div>
        ))}
      </div>

      <div className="onb-card">
        <p className="kicker">Step {stepIndex + 1} of {STEPS.length}</p>
        <h1>{STEPS[stepIndex].title}</h1>
        <p className="onb-sub">{STEPS[stepIndex].sub}</p>

        {step === "system" && (
          <div className="onb-body">
            <label className="form-label">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Production stack" maxLength={80} required />
            </label>
            <label className="form-label">
              <span>Primary vendor or product</span>
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Stripe, Vercel, Postgres" maxLength={80} />
            </label>
            <label className="form-label">
              <span>Keywords to track <em>(comma separated)</em></span>
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="nginx, openssl, postgres" />
            </label>
          </div>
        )}

        {step === "sources" && (
          <div className="onb-body">
            <ul className="source-list">
              {SOURCE_PRESETS.map((s) => {
                const on = enabledSources.has(s.id);
                return (
                  <li key={s.id} className={on ? "on" : ""}>
                    <button
                      type="button"
                      onClick={() => {
                        const n = new Set(enabledSources);
                        if (on) n.delete(s.id);
                        else n.add(s.id);
                        setEnabledSources(n);
                      }}
                    >
                      <div>
                        <div className="src-name">{s.name}</div>
                        <div className="src-desc">{s.desc}</div>
                      </div>
                      <span className="check">{on ? "✓" : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="onb-hint">You can add custom RSS feeds later in <a href="/dashboard">Sources</a>.</p>
          </div>
        )}

        {step === "notify" && (
          <div className="onb-body">
            <div className="notify-picker">
              <label className={notify === "none" ? "on" : ""}>
                <input type="radio" name="notify" checked={notify === "none"} onChange={() => setNotify("none")} />
                <div>
                  <div className="src-name">Skip for now</div>
                  <div className="src-desc">Use the dashboard or API. You can wire alerts up later.</div>
                </div>
              </label>
              <label className={notify === "slack" ? "on" : ""}>
                <input type="radio" name="notify" checked={notify === "slack"} onChange={() => setNotify("slack")} />
                <div>
                  <div className="src-name">Slack</div>
                  <div className="src-desc">Paste an Incoming Webhook URL.</div>
                </div>
              </label>
              <label className={notify === "email" ? "on" : ""}>
                <input type="radio" name="notify" checked={notify === "email"} onChange={() => setNotify("email")} />
                <div>
                  <div className="src-name">Email</div>
                  <div className="src-desc">We&apos;ll save the destination; finish SMTP in Settings.</div>
                </div>
              </label>
            </div>

            {notify === "slack" && (
              <label className="form-label">
                <span>Slack incoming webhook URL</span>
                <input value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
              </label>
            )}
            {notify === "email" && (
              <label className="form-label">
                <span>Send alerts to</span>
                <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="security@yourco.com" type="email" />
              </label>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="onb-body">
            <p className="onb-done">
              You&apos;re monitoring <strong>{name || "your stack"}</strong>. Underhack will start
              checking your sources and routing critical alerts your way.
            </p>
            <ul className="onb-checklist">
              <li>System configured</li>
              <li>{enabledSources.size} source{enabledSources.size === 1 ? "" : "s"} enabled</li>
              <li>{notify === "none" ? "Notifications: dashboard only" : `Notifications: ${notify}`}</li>
            </ul>
          </div>
        )}

        {err && <div className="onb-error">{err}</div>}

        <div className="onb-actions">
          {step !== "system" && step !== "done" && (
            <button className="btn btn-ghost" onClick={back} disabled={busy}>Back</button>
          )}
          <button className="btn" onClick={next} disabled={busy}>
            {busy ? "Saving…" : step === "done" ? "Open dashboard" : step === "notify" && notify === "none" ? "Finish" : "Continue"}
          </button>
        </div>
      </div>
    </main>
  );
}
