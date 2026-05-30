# Underhack

> Open-source breach & vulnerability monitoring for small teams. Watch CVE feeds, breach dumps, and threat intel — get only the alerts that matter to your stack.

[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Self-hosted](https://img.shields.io/badge/self--hosted-friendly-black)](#self-hosting)

Underhack is a single, self-hostable web app + worker that **continuously polls
breach and vulnerability sources, triages them against the systems you care
about, and pings you only when something is actually relevant.** No SaaS lock-in,
no per-seat pricing, no telemetry phoning home.

```
  CVE feeds ──┐
  KEV ────────┼──►  Collector ──► Triage agent ──► Alert ──► Slack / Email / Webhook
  Breaches ───┤                    (LLM-graded)              + Public API
  Custom RSS ─┘
```

---

## Why Underhack

Most security tools are built for SOCs with full-time staff. Small teams need
something simpler: tell it what you run, give it your Slack webhook, walk away.
It tells you when a CVE in `nginx` actually applies to *your* nginx, not the
fifty other ones disclosed today.

**Built for:**
- Bootstrapped SaaS founders without a security hire
- Indie operators wanting a "did anything explode overnight?" feed
- Engineering teams that need an auditable record of "we saw it, we triaged it"

---

## Features

- **Multi-source polling** — CISA KEV, NVD, HaveIBeenPwned, arbitrary RSS, custom collectors.
- **LLM triage** — Each finding is graded for severity, confidence, and relevance to your systems. Only the loud ones page you.
- **Public REST API** — `/api/v1/alerts`, webhook subscriptions, HMAC-signed deliveries. Build your own dashboards.
- **Webhooks & Slack/Email** — First-class connectors. Min-severity gates per destination.
- **Onboarding wizard** — Pick your stack, pick your feeds, paste a Slack URL. ~60 seconds to first alert.
- **Single-binary deploy** — SQLite + Next.js. No Postgres, no Redis, no Kafka.
- **MIT licensed** — Fork it, modify it, ship it.

---

## Quick start

### Docker (recommended)

```bash
git clone https://github.com/your-org/underhack
cd underhack
cp .env.example .env       # set ADMIN_EMAIL, ADMIN_PASSWORD, REQUESTY_API_KEY
docker compose up -d
open http://localhost:4317
```

### Local dev

```bash
git clone https://github.com/your-org/underhack
cd underhack
npm install
cp .env.example .env
npm run dev                # web on :4317
npm run worker             # background collector (in a second terminal)
```

The first time you sign in, the onboarding wizard walks you through:

1. **Tell us your stack** — name a system (e.g. "Production API"), drop in keywords.
2. **Pick sources** — KEV, NVD, HIBP, or paste an RSS URL.
3. **Pick a destination** — Slack webhook, email, or skip and use the dashboard.

That's it. Alerts start landing within minutes.

---

## REST API

All v1 endpoints accept `Authorization: Bearer uh_live_...` keys (create at `/settings/api-keys`).

```bash
# list open alerts
curl -H "Authorization: Bearer $UH_KEY" \
  "https://your-instance/api/v1/alerts?severity=high&status=open"

# subscribe a webhook (will get HMAC-signed POSTs)
curl -X POST -H "Authorization: Bearer $UH_KEY" \
  -H "Content-Type: application/json" \
  https://your-instance/api/v1/subscriptions \
  -d '{"url":"https://example.com/hook","min_severity":"high"}'

# acknowledge an alert
curl -X PATCH -H "Authorization: Bearer $UH_KEY" \
  -H "Content-Type: application/json" \
  https://your-instance/api/v1/alerts/alrt_123 \
  -d '{"status":"acknowledged"}'
```

Full docs with copy-paste examples at **`/docs/api`** once the app is running.

Errors follow [RFC 9457 `application/problem+json`](https://www.rfc-editor.org/rfc/rfc9457). Lists are cursor-paginated (`?cursor=...&limit=50`).

### Webhook verification

Every webhook delivery includes:

- `X-Underhack-Signature: t=<unix>, v1=<hex>` — HMAC-SHA256 of `"<t>.<rawBody>"` using your subscription secret.
- `X-Underhack-Event: alert.created`

Reject any payload where the signature doesn't match or `t` is more than ~5 minutes old.

---

## Self-hosting

Underhack is a single Next.js app with a SQLite database and a worker process.
A 1-vCPU / 1 GB VPS is plenty.

**Minimum env vars:**

| Var | Required | Notes |
|---|---|---|
| `ADMIN_EMAIL` | yes | first admin user |
| `ADMIN_PASSWORD` | yes | bcrypt'd on first boot |
| `REQUESTY_API_KEY` | yes | LLM gateway for triage (drop-in OpenAI compatible) |
| `DB_PATH` | no | defaults to `./data/underhack.db` |
| `SLACK_WEBHOOK` | no | global fallback if no per-key webhook |
| `BASE_URL` | no | for OAuth redirects, e.g. `https://underhack.example.com` |

See [`.env.example`](.env.example) for the full list.

### Backups

The entire state is one SQLite file. Snapshot it.

```bash
sqlite3 ./data/underhack.db ".backup ./backups/$(date +%Y%m%d).db"
```

### Upgrading

```bash
docker compose pull && docker compose up -d
```

Migrations run on boot.

---

## Architecture

```
app/                 — Next.js 16 App Router (UI + API)
  api/v1/            — Public REST API (Bearer-authed)
  api/                — Internal API (session-authed)
  dashboard/         — Triaged alerts feed
  onboarding/        — Wizard
  settings/api-keys/ — Key management
src/
  agents/            — Collector, triage, notifier (LLM-driven)
  db/                — SQLite schema + repos (better-sqlite3)
  services/          — Auth, settings, connectors
  worker.ts          — Background poll loop
```

No queue, no broker. The worker is a `setInterval` over `POLL_INTERVAL_SEC`.
If you outgrow that you're probably ready for something bigger than Underhack.

---

## Roadmap

- [ ] Slack slash commands (`/underhack ack 1234`)
- [ ] PagerDuty / Opsgenie connectors
- [ ] Per-system Slack channels
- [ ] GitHub Advisory Database source
- [ ] SBOM-aware triage (upload a `cyclonedx` and we'll match)
- [ ] Multi-tenant mode (team plans)

Vote with thumbs on [issues](https://github.com/your-org/underhack/issues).

---

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Run `npm run dev` and
poke around — the codebase is intentionally small.

---

## Security

Found a vulnerability? Please email **security@underhack.dev** — see
[SECURITY.md](SECURITY.md) for the full disclosure policy and operator
hardening notes.

---

## License

MIT. See [LICENSE](LICENSE).
