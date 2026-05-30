# 03 — API & Integrations Specification

The public API exists so a small company can pull alerts into their own systems and receive notifications programmatically — the "basic API endpoints for getting notifications" from the goal. It is deliberately small: read alerts, manage what's watched, manage how you're notified, receive webhooks. Resist scope creep here harder than anywhere.

## 1. Design principles

- REST + JSON over HTTPS, versioned under `/api/v1`. Breaking changes bump the version.
- Boring and predictable. Plural nouns, standard verbs, standard status codes. A developer should never need the docs for the second endpoint after seeing the first.
- Secure by default. Every endpoint requires a key except `/health`. Keys are hashed at rest. No data leaves the instance except via endpoints the user calls or webhooks the user registers.
- Self-documenting. Ship a generated OpenAPI 3.1 document at `/api/v1/openapi.json` and a minimal rendered reference. The spec below is the source for it.

## 2. Conventions

- Base URL: `{instance}/api/v1`
- Content type: `application/json` for requests and responses.
- Timestamps: UTC ISO-8601 strings.
- IDs: ULID strings.
- Pagination: cursor-based. List responses return `{ "data": [...], "next_cursor": "...|null" }`. Request with `?limit=` (default 25, max 100) and `?cursor=`.
- Filtering: documented per-endpoint via query params; unknown params are ignored, not errored.
- Errors: RFC 9457 problem+json shape:

```json
{ "type": "about:blank", "title": "Unauthorized",
  "status": 401, "detail": "API key missing or invalid." }
```

Always a machine-stable `status` + `title` and a human `detail`. Never leak stack traces.

## 3. Authentication

- Scheme: bearer API key in the `Authorization` header: `Authorization: Bearer uh_live_<random>`
- Keys are created in the UI (02 §7.7) or via the keys endpoint. The plaintext is shown once; the server stores only a hash + an 8-char prefix for identification.
- Scopes (least-privilege; a key carries a subset):
  - `alerts:read`, `alerts:write`
  - `watchlist:read`, `watchlist:write`
  - `subscriptions:read`, `subscriptions:write`
  - `webhooks:read`, `webhooks:write`
  - `metrics:read`
  - Extended breach-tracking scopes (defined and used in 05-sources-and-connectors.md §4): `sources:read`, `sources:write`, `exposure:read`, `enrich:read`, `vulns:read`, `ingest:write`. These gate the source-management, exposure-check, enrichment, vulnerability, and inbound-ingest endpoints; they follow the same key/scoping model as the core scopes above.
- Rotation/revocation: revoking sets `revoked_at`; the key fails immediately with 401.
- Rate limiting: per-key, e.g. 120 req/min. On exceed → 429 with `Retry-After` header. Return current limit state in `X-RateLimit-Limit` / `X-RateLimit-Remaining`.

## 4. Resources & endpoints

### 4.1 Health — `GET /health` (no auth)

Liveness + ingestion health. Used by Docker healthcheck and uptime monitors.

```json
{ "status": "ok",
  "sources": [ { "name": "CISA KEV", "last_status": "ok", "last_run_at": "..." } ],
  "version": "1.0.0" }
```

### 4.2 Alerts — `alerts:read`

- `GET /alerts` — the core read. Filters: `band` (info|low|high|critical, repeatable), `status`, `asset_id`, `source`, `since` (ISO ts), `q` (text). Cursor-paginated, newest first.
- `GET /alerts/{id}` — full alert incl. `match_reason`, asset, sources, technical detail.
- `PATCH /alerts/{id}` — update status (acknowledged|resolved|ignored) or `snoozed_until`. Requires `alerts:write`.

Alert object:

```json
{
  "id": "01J...",
  "severity_band": "critical",
  "severity_score": 91,
  "summary": "acme.com appeared in a credential leak.",
  "asset": { "id": "01J...", "type": "domain", "value": "acme.com", "label": "Primary domain" },
  "match_reason": "Matched watched domain 'acme.com' in leak record.",
  "status": "new",
  "sources": [ { "name": "LeakFeed", "url": "https://..." } ],
  "cve_id": null,
  "first_seen_at": "2026-05-30T10:00:00Z",
  "created_at": "2026-05-30T10:00:05Z",
  "technical": { "cvss": null, "raw_url": "https://..." }
}
```

### 4.3 Watchlist — `watchlist:read` / `watchlist:write`

- `GET /watchlist` — list assets (with `match_count`).
- `POST /watchlist` — `{ "type": "domain", "value": "acme.com", "label": "Primary" }`. Type may be omitted to trigger server-side auto-detection (mirror the UI rule). Returns 201 + object.
- `PATCH /watchlist/{id}` — update `label` / `enabled`.
- `DELETE /watchlist/{id}` — 204. Historical alerts are retained (un-scoped) unless `?purge=true`.

### 4.4 Subscriptions (notification routing) — `subscriptions:read` / `subscriptions:write`

Programmatic equivalent of the Integrations UI routing rules.

- `GET /subscriptions`
- `POST /subscriptions` — `{ "channel": "webhook", "target_ref": "<webhook_id>", "min_band": "high", "delivery": "immediate" }`
- `PATCH /subscriptions/{id}` / `DELETE /subscriptions/{id}`

### 4.5 Webhooks (outbound delivery endpoints) — `webhooks:read` / `webhooks:write`

- `GET /webhooks`
- `POST /webhooks` — `{ "url": "https://you.example/hook", "event_types": ["alert.created"] }`. Response includes a generated secret (shown once) used to sign deliveries (§5.2).
- `PATCH /webhooks/{id}` (enable/disable, update event types) / `DELETE /webhooks/{id}`
- `POST /webhooks/{id}/test` — sends a synthetic `alert.created` to verify the endpoint.

### 4.6 Metrics — `metrics:read`

Backs the Insights page and external dashboards. The UI and this endpoint share one query layer so they can never disagree (04-analytics-spec.md §8).

- `GET /metrics` — accepts the same `asset_id`, `since`, and a range/granularity (day|week) param as `/alerts`. Returns the user-facing security metrics of 04 §3:

```json
{
  "range": { "from": "2026-03-01", "to": "2026-05-30", "granularity": "week" },
  "volume": [ { "period": "2026-05-25", "critical": 1, "high": 3, "low": 5, "info": 2 } ],
  "open_backlog": 7,
  "mtta_seconds": 14400,
  "mttr_seconds": 86400,
  "aging_alerts": 2,
  "distinct_breach_exposure": 3,
  "per_asset": [ { "asset_id": "01J...", "value": "acme.com", "critical": 1, "high": 2, "trend": "down" } ],
  "source_contribution": [ { "source": "LeakFeed", "alerts": 4, "relevance_ratio": 0.12 } ]
}
```

Operational metrics (04 §4) stay on `/health` and the operator view; this endpoint is the company's own security data only. No single "security score" field is returned, by design (04 §3.1).

## 5. Outbound notifications (the heart of the integration story)

When an alert is created (or its band crosses a subscription threshold), Underhack delivers to every matching subscription/webhook.

### 5.1 Event types

- `alert.created` — a new alert was raised.
- `alert.updated` — status/severity changed (post-MVP if cheap).
- `digest.ready` — a scheduled digest is available (post-MVP).

### 5.2 Webhook payload & signing

POST to the registered URL with `Content-Type: application/json`:

```json
{
  "event": "alert.created",
  "id": "evt_01J...",
  "created_at": "2026-05-30T10:00:05Z",
  "data": { /* the Alert object from §4.2 */ }
}
```

Each request includes:

- `X-Underhack-Event: alert.created`
- `X-Underhack-Delivery: <delivery ulid>` (stable per attempt set — use for idempotency on the receiver)
- `X-Underhack-Signature: t=<unix>,v1=<hex hmac>` — HMAC-SHA256 of `"{t}.{raw_body}"` keyed by the webhook secret. Receivers verify by recomputing and constant-time comparing, and rejecting timestamps older than ~5 min (replay protection).

### 5.3 Delivery semantics

- At-least-once. A 2xx from the receiver = success. Anything else (or timeout) = failure.
- Retries with exponential backoff (e.g. 1m, 5m, 30m, 2h, 6h). After N consecutive failures, the webhook auto-disables and is flagged in the UI with `disabled_reason`; surfaced in the health banner.
- Idempotency: receivers should dedupe on `X-Underhack-Delivery`. Underhack records every attempt in `delivery_log`.
- Ordering: not guaranteed — receivers must tolerate out-of-order events and use `created_at`.

## 6. Built-in channel integrations

These are configured in the UI but documented here so the contract is one place.

### 6.1 Slack (incoming webhook)

User pastes a Slack incoming-webhook URL. Underhack posts a compact, severity-colored message: one-line summary, asset, band, and a link back to the alert detail. Send test posts a sample. Store only the URL; no Slack OAuth in MVP.

### 6.2 Email (SMTP)

User supplies SMTP host/port/credentials/from-address. Immediate alerts and the scheduled digest both go here. Emails are plain-language, single-column, dark-mode-safe HTML with a plain-text fallback. Send test mails a sample. Digest schedule from setting.

### 6.3 Generic webhook

The §5 mechanism, exposed as a channel for the user's own automation (a Lambda, an n8n flow, a PagerDuty events endpoint, etc.). This is the universal escape hatch — anything not natively supported is reachable through it.

## 7. Quickstart (put this verbatim in README + the API keys screen)

```bash
# 1. list your most recent critical/high alerts
curl -s "https://your-instance/api/v1/alerts?band=critical&band=high" \
  -H "Authorization: Bearer uh_live_xxx"

# 2. watch a new domain
curl -s -X POST https://your-instance/api/v1/watchlist \
  -H "Authorization: Bearer uh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"type":"domain","value":"acme.com","label":"Primary"}'

# 3. receive every new alert at your own endpoint
curl -s -X POST https://your-instance/api/v1/webhooks \
  -H "Authorization: Bearer uh_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://you.example/hook","event_types":["alert.created"]}'
# -> response includes the signing secret (shown once)
```

## 8. Versioning & stability

`/api/v1` is stable for the MVP's life. Additive changes (new fields, new optional params, new endpoints) are non-breaking and don't bump the version. Removing/renaming a field or changing auth → `/api/v2`. The OpenAPI doc is the canonical contract and ships with every release; treat a diff in it during review as the signal for whether a change is breaking.

## 9. Testing requirements

Every endpoint ships with at least: one happy-path test, one 401 (missing/invalid key) test, and — for writes — one validation-failure (422/400) test. Webhook delivery ships with a signature-verification test and a retry/backoff test. These are the regression net for the "everything stays simple" promise: simple to use is only true if it stays correct.
