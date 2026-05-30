export const metadata = { title: "API — Underhack" };

type Method = "GET" | "POST" | "PATCH" | "DELETE";

function MethodBadge({ m }: { m: Method }) {
  return <span className={`method method-${m.toLowerCase()}`}>{m}</span>;
}

function Endpoint({
  method,
  path,
  curl,
  js,
  py,
  resp,
}: {
  method: Method;
  path: string;
  curl: string;
  js: string;
  py: string;
  resp?: string;
}) {
  return (
    <div className="endpoint">
      <div className="endpoint-head">
        <MethodBadge m={method} />
        <code className="endpoint-path">{path}</code>
      </div>
      <div className="req-tabs">
        <div className="req-tab">
          <p className="req-label">cURL</p>
          <pre>
            <code>{curl}</code>
          </pre>
        </div>
        <div className="req-tab">
          <p className="req-label">JavaScript (fetch)</p>
          <pre>
            <code>{js}</code>
          </pre>
        </div>
        <div className="req-tab">
          <p className="req-label">Python (requests)</p>
          <pre>
            <code>{py}</code>
          </pre>
        </div>
        {resp && (
          <div className="req-tab">
            <p className="req-label">Response</p>
            <pre>
              <code>{resp}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApiDocs() {
  return (
    <main className="docs">
      <header className="docs-head">
        <p className="kicker">REST API · v1</p>
        <h1>Underhack API</h1>
        <p className="lede">
          A small, stable HTTP API for retrieving security alerts and managing
          your watchlist. Authenticate with a Bearer token, get JSON back,
          stream alerts to your stack via webhooks.
        </p>
        <div className="docs-meta">
          <span className="badge">Base URL: <code>/api/v1</code></span>
          <span className="badge">Auth: Bearer</span>
          <span className="badge">Format: JSON</span>
          <span className="badge">Errors: RFC 9457</span>
        </div>
      </header>

      <nav className="docs-toc panel">
        <p className="kicker">On this page</p>
        <ul>
          <li><a href="#auth">Authentication</a></li>
          <li><a href="#errors">Errors</a></li>
          <li><a href="#pagination">Pagination</a></li>
          <li><a href="#alerts">Alerts</a></li>
          <li><a href="#watchlist">Watchlist</a></li>
          <li><a href="#subscriptions">Webhooks</a></li>
          <li><a href="#me">Key info</a></li>
          <li><a href="#health">Health</a></li>
        </ul>
      </nav>

      <section id="auth" className="docs-section">
        <h2>Authentication</h2>
        <p>
          Create a key from <a href="/settings/api-keys">Settings → API Keys</a>.
          Keys look like <code>uh_live_…</code> and are shown only once. Send
          them as a bearer token.
        </p>
        <Endpoint
          method="GET"
          path="/api/v1/me"
          curl={`curl https://your.underhack.io/api/v1/me \\
  -H "Authorization: Bearer uh_live_xxxxxxxxxxxxxxxxxxxx"`}
          js={`await fetch("/api/v1/me", {
  headers: { Authorization: \`Bearer \${process.env.UNDERHACK_KEY}\` },
}).then((r) => r.json());`}
          py={`import requests
requests.get(
  "https://your.underhack.io/api/v1/me",
  headers={"Authorization": f"Bearer {os.environ['UNDERHACK_KEY']}"},
).json()`}
          resp={`{
  "id": "key_abc123",
  "label": "production-app",
  "prefix": "uh_live_xy",
  "scopes": ["alerts:read", "webhooks:write"],
  "created_at": "2026-05-30T09:12:11.000Z",
  "last_used_at": "2026-05-30T14:55:01.000Z"
}`}
        />
      </section>

      <section id="errors" className="docs-section">
        <h2>Errors</h2>
        <p>
          Every error response is{" "}
          <code>Content-Type: application/problem+json</code> per{" "}
          <a href="https://www.rfc-editor.org/rfc/rfc9457.html">RFC 9457</a>.
          Use <code>status</code> for control flow, <code>title</code> for logs.
        </p>
        <pre className="block">
          <code>{`HTTP/1.1 401 Unauthorized
Content-Type: application/problem+json

{
  "type":   "https://underhack.io/problems/unauthorized",
  "title":  "Unauthorized",
  "status": 401,
  "detail": "Missing or invalid Authorization header"
}`}</code>
        </pre>
        <p>Common statuses: <code>400</code>, <code>401</code>, <code>403</code>, <code>404</code>, <code>409</code>, <code>429</code>, <code>500</code>.</p>
      </section>

      <section id="pagination" className="docs-section">
        <h2>Pagination</h2>
        <p>
          List endpoints return up to <code>limit</code> (default 50, max 100)
          items plus an opaque <code>next_cursor</code>. Pass it back as
          <code>?cursor=…</code> to fetch the next page. When there are no more
          results, <code>next_cursor</code> is <code>null</code>.
        </p>
        <pre className="block">
          <code>{`GET /api/v1/alerts?limit=25
→ { "object": "list", "data": [...], "next_cursor": "eyJjIjoxNzE2..." }

GET /api/v1/alerts?limit=25&cursor=eyJjIjoxNzE2...
→ { "object": "list", "data": [...], "next_cursor": null }`}</code>
        </pre>
      </section>

      <section id="alerts" className="docs-section">
        <h2>Alerts</h2>
        <p>
          The core of the API. Alerts are triaged findings — usually CVEs or
          breach disclosures — affecting things on your watchlist.
        </p>
        <h3>List alerts</h3>
        <p>
          Filters: <code>severity</code> (comma-separated{" "}
          <code>info,low,high,critical</code>), <code>status</code>{" "}
          (<code>new</code>, <code>acknowledged</code>, <code>resolved</code>,
          <code>ignored</code>, <code>all</code>), <code>since</code>{" "}
          (ISO-8601), <code>limit</code>, <code>cursor</code>.
        </p>
        <Endpoint
          method="GET"
          path="/api/v1/alerts?severity=high,critical&limit=25"
          curl={`curl "https://your.underhack.io/api/v1/alerts?severity=high,critical&limit=25" \\
  -H "Authorization: Bearer uh_live_xxxxxxxxxxxxxxxxxxxx"`}
          js={`const res = await fetch(
  "/api/v1/alerts?severity=high,critical&limit=25",
  { headers: { Authorization: \`Bearer \${KEY}\` } }
);
const { data, next_cursor } = await res.json();`}
          py={`r = requests.get(
  f"{BASE}/api/v1/alerts",
  params={"severity": "high,critical", "limit": 25},
  headers={"Authorization": f"Bearer {KEY}"},
).json()`}
          resp={`{
  "object": "list",
  "next_cursor": "eyJjIjoxNzE2ODg5MjEx...",
  "data": [
    {
      "id": "al_01HF…",
      "severity": "critical",
      "status": "new",
      "confidence": 92,
      "title": "CVE-2026-30815: RCE in OpenSSL 3.x",
      "summary": "Unauthenticated remote code execution via …",
      "affected_apis": ["openssl"],
      "recommendation": "Upgrade to 3.2.5 or apply vendor patch",
      "system_id": "sys_xyz",
      "system_name": "Production API",
      "source_url": "https://nvd.nist.gov/vuln/detail/CVE-2026-30815",
      "created_at": "2026-05-30T13:01:09.000Z"
    }
  ]
}`}
        />

        <h3>Get one alert</h3>
        <Endpoint
          method="GET"
          path="/api/v1/alerts/{id}"
          curl={`curl https://your.underhack.io/api/v1/alerts/al_01HF... \\
  -H "Authorization: Bearer uh_live_xxxxxxxxxxxxxxxxxxxx"`}
          js={`await fetch(\`/api/v1/alerts/\${id}\`, {
  headers: { Authorization: \`Bearer \${KEY}\` },
}).then((r) => r.json());`}
          py={`requests.get(
  f"{BASE}/api/v1/alerts/{alert_id}",
  headers={"Authorization": f"Bearer {KEY}"},
).json()`}
        />

        <h3>Update alert status</h3>
        <p>
          Acknowledge, resolve, or ignore an alert. Requires
          <code>alerts:write</code> scope.
        </p>
        <Endpoint
          method="PATCH"
          path="/api/v1/alerts/{id}"
          curl={`curl -X PATCH https://your.underhack.io/api/v1/alerts/al_01HF... \\
  -H "Authorization: Bearer uh_live_xxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"acknowledged"}'`}
          js={`await fetch(\`/api/v1/alerts/\${id}\`, {
  method: "PATCH",
  headers: {
    Authorization: \`Bearer \${KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ status: "acknowledged" }),
});`}
          py={`requests.patch(
  f"{BASE}/api/v1/alerts/{alert_id}",
  json={"status": "acknowledged"},
  headers={"Authorization": f"Bearer {KEY}"},
)`}
        />
      </section>

      <section id="watchlist" className="docs-section">
        <h2>Watchlist</h2>
        <p>
          Tell Underhack which products and keywords to watch. Each entry
          becomes a query against incoming feeds (NVD, CISA KEV, vendor RSS).
          Requires <code>watchlist:read</code> / <code>watchlist:write</code>.
        </p>
        <Endpoint
          method="POST"
          path="/api/v1/watchlist"
          curl={`curl -X POST https://your.underhack.io/api/v1/watchlist \\
  -H "Authorization: Bearer uh_live_xxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Production API",
    "vendor": "openssl",
    "keywords": ["openssl", "nginx", "node"],
    "criticality": "high"
  }'`}
          js={`await fetch("/api/v1/watchlist", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "Production API",
    vendor: "openssl",
    keywords: ["openssl", "nginx", "node"],
    criticality: "high",
  }),
});`}
          py={`requests.post(
  f"{BASE}/api/v1/watchlist",
  json={
    "name": "Production API",
    "vendor": "openssl",
    "keywords": ["openssl", "nginx", "node"],
    "criticality": "high",
  },
  headers={"Authorization": f"Bearer {KEY}"},
)`}
        />
      </section>

      <section id="subscriptions" className="docs-section">
        <h2>Webhook subscriptions</h2>
        <p>
          Stream <code>alert.created</code> events to any HTTPS endpoint.
          On creation you receive a <code>secret</code> <strong>once</strong> —
          store it, you'll need it to verify deliveries.
        </p>
        <Endpoint
          method="POST"
          path="/api/v1/subscriptions"
          curl={`curl -X POST https://your.underhack.io/api/v1/subscriptions \\
  -H "Authorization: Bearer uh_live_xxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://api.example.com/webhooks/underhack","min_severity":"high"}'`}
          js={`const sub = await fetch("/api/v1/subscriptions", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: "https://api.example.com/webhooks/underhack",
    min_severity: "high",
  }),
}).then((r) => r.json());

// store sub.secret somewhere safe — it won't appear again`}
          py={`r = requests.post(
  f"{BASE}/api/v1/subscriptions",
  json={
    "url": "https://api.example.com/webhooks/underhack",
    "min_severity": "high",
  },
  headers={"Authorization": f"Bearer {KEY}"},
).json()
secret = r["secret"]  # save me`}
          resp={`{
  "id": "sub_01HG…",
  "url": "https://api.example.com/webhooks/underhack",
  "min_severity": "high",
  "enabled": true,
  "secret": "whsec_a7c9…(shown once)",
  "created_at": "2026-05-30T15:02:11.000Z"
}`}
        />

        <h3>Delivery format</h3>
        <p>
          Each delivery is a POST with these headers:
        </p>
        <pre className="block">
          <code>{`User-Agent:           Underhack-Webhooks/1
X-Underhack-Event:    alert.created
X-Underhack-Delivery: dlv_5f6a2b1c
X-Underhack-Timestamp: 1748617331240
X-Underhack-Signature: t=1748617331240,v1=<hex-hmac-sha256>`}</code>
        </pre>
        <p>
          The signature is <code>HMAC_SHA256(secret, "{`{timestamp}.{rawBody}`}")</code>.
          Reject deliveries older than ~5 minutes.
        </p>
        <h4>Verify in Node</h4>
        <pre className="block">
          <code>{`import crypto from "node:crypto";
import express from "express";

const app = express();
app.use("/webhooks/underhack", express.raw({ type: "application/json" }));

app.post("/webhooks/underhack", (req, res) => {
  const sig = req.header("X-Underhack-Signature") ?? "";
  const ts  = req.header("X-Underhack-Timestamp") ?? "";
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) return res.sendStatus(400);
  const expected = crypto
    .createHmac("sha256", process.env.UNDERHACK_WEBHOOK_SECRET)
    .update(\`\${ts}.\${req.body.toString()}\`)
    .digest("hex");
  const ok = sig
    .split(",")
    .some((p) => p.startsWith("v1=") && crypto.timingSafeEqual(
      Buffer.from(p.slice(3), "hex"),
      Buffer.from(expected, "hex"),
    ));
  if (!ok) return res.sendStatus(401);
  const { type, data } = JSON.parse(req.body.toString());
  // ... do something useful
  res.sendStatus(204);
});`}</code>
        </pre>
        <h4>Verify in Python (FastAPI)</h4>
        <pre className="block">
          <code>{`import hmac, hashlib, time
from fastapi import FastAPI, Request, HTTPException

app = FastAPI()
SECRET = os.environ["UNDERHACK_WEBHOOK_SECRET"].encode()

@app.post("/webhooks/underhack")
async def receive(req: Request):
    body = await req.body()
    ts  = req.headers.get("x-underhack-timestamp", "0")
    sig = req.headers.get("x-underhack-signature", "")
    if abs(int(time.time() * 1000) - int(ts)) > 5 * 60 * 1000:
        raise HTTPException(400)
    expected = hmac.new(SECRET, f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    if not any(p.startswith("v1=") and hmac.compare_digest(p[3:], expected)
               for p in sig.split(",")):
        raise HTTPException(401)
    return {"received": True}`}</code>
        </pre>
      </section>

      <section id="me" className="docs-section">
        <h2>Key info</h2>
        <p>Useful for checking which scopes a key has at runtime.</p>
        <Endpoint
          method="GET"
          path="/api/v1/me"
          curl={`curl https://your.underhack.io/api/v1/me \\
  -H "Authorization: Bearer uh_live_xxxxxxxxxxxxxxxxxxxx"`}
          js={`fetch("/api/v1/me", { headers: { Authorization: \`Bearer \${KEY}\` }})`}
          py={`requests.get(f"{BASE}/api/v1/me",
  headers={"Authorization": f"Bearer {KEY}"})`}
        />
      </section>

      <section id="health" className="docs-section">
        <h2>Health</h2>
        <p>Unauthenticated. Returns <code>200</code> if the DB is reachable.</p>
        <Endpoint
          method="GET"
          path="/api/health"
          curl={`curl https://your.underhack.io/api/health`}
          js={`fetch("/api/health").then((r) => r.json())`}
          py={`requests.get(f"{BASE}/api/health").json()`}
          resp={`{
  "status": "ok",
  "alerts_indexed": 1681,
  "version": "1.0.0"
}`}
        />
      </section>

      <footer className="docs-foot">
        <p>
          Found a problem? <a href="https://github.com/underhack/underhack/issues">Open an issue</a>.
        </p>
      </footer>
    </main>
  );
}
