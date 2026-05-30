# 01 — Product & Feature Specification

## 1. One-line positioning

Underhack is the self-hostable, open-source way for a small company to know — within minutes and without a security team — when a breach, leak, or exploited vulnerability touches the assets they care about.

## 2. Why this, why now

Small companies are the worst-served segment of breach monitoring. Enterprise threat-intel platforms are expensive, heavy, and assume a SOC. Consumer tools (single-email breach checkers) don't track company assets over time. The opportunity is a tool that is (a) trivial to self-host, (b) opinionated enough that a non-specialist can use it on day one, and (c) genuinely good at the one job that matters: continuous tracking of a defined set of assets against breach/leak/vuln signal.

The design tension to hold throughout: power users want signal depth; the target user wants to not think about it. Default to the second. Every feature must survive the question "does a five-person company with no security hire actually use this?"

## 3. Target users

| Persona | Context | What they need |
|---------|---------|----------------|
| Solo founder / IT generalist (primary) | Wears every hat, no security background | Set it up once, get a plain-English alert only when it matters, ignore the rest |
| Small-team ops / office manager | Owns vendors and accounts, not infra | A watchlist of company domains, key vendors, and exec emails; a weekly digest |
| Indie / OSS self-hoster (secondary, distribution) | Technical, runs it for themselves or others | One-command Docker deploy, clean config, an API to build on |

Non-target for MVP: enterprise SOC analysts, MSSPs managing hundreds of tenants. Multi-tenant is explicitly out (§11).

## 4. Existing capability (do not rebuild)

Reconcile against the audit, but treat these as present and working: feed ingestion (RSS, CISA KEV, NVD), normalization into a common item shape, a triage/scoring layer, and Slack + email delivery. The MVP wraps and exposes these — it does not replace them.

## 5. Feature set

Priority uses MoSCoW. Must = required for the Definition of Done in the index. Should = ship in MVP if cheap. Could = post-MVP. Won't = explicitly excluded now.

### 5.1 Core monitoring (mostly exists — harden it) — Must

- Scheduled ingestion from RSS / KEV / NVD with per-source health visible in the UI.
- Deterministic deduplication: an item seen twice (across sources or polls) collapses to one alert with merged sources. Key on a stable hash of (canonical_url || cve_id || normalized_title).
- Severity scoring normalized to a single 0–100 scale plus a 4-band label (info / low / high / critical) so the UI never shows a raw CVSS to a non-specialist. Document the scoring inputs in code; expose only the band by default.

### 5.2 Asset / watchlist tracking — Must (this is the "future tracking" core; it is the product's spine)

The thing that turns a feed reader into a monitoring tool. A company defines what it owns, and every ingested item is matched against it.

- Watchlist item types: domain, email, vendor/product name, keyword, ip_or_cidr.
- Each ingested item runs through a matcher; matches create an alert scoped to the asset so the user sees "this affects acme.com", not "here is some news."
- Per-asset history: every match is retained so a user can answer "what has hit this domain over the last year?" Retention is configurable; default keep-forever (SQLite is cheap).
- Matching must be explainable: each alert stores why it matched (which asset, which rule), shown in the UI and returned by the API.

### 5.3 Breach / leak signal — Should

- Pluggable breach source adapters behind the same normalized item shape (e.g. a HIBP-style "has this domain/email appeared in a known breach" lookup; public paste/leak feeds). Adapters are optional and key-gated; the tool is fully functional with only the free public feeds.
- Treat third-party breach APIs as adapters configured by the user with their own keys — never bundle paid API keys.

### 5.4 Notifications — Must

- Channels: Slack (incoming webhook), email (SMTP), generic webhook (for the user's own systems — see 03-api-spec.md).
- Routing rules: "send critical to Slack immediately; everything else into the weekly digest." Keep the rule model dead simple — a few band→channel mappings, not a rules engine.
- Digest: scheduled (daily/weekly) roll-up email so low-severity signal never becomes notification noise. This is the single biggest lever against alert fatigue — make it the default for everything below critical.
- Snooze / mute per asset and per source.

### 5.5 Onboarding wizard — Must

Three steps, skippable, resumable, no dead ends:

1. Add what you watch — paste your domain(s); we pre-fill suggested watchlist items (the email domain, the company name as a keyword).
2. Pick how you hear about it — connect one channel (Slack URL paste or SMTP), or "just the dashboard for now."
3. You're set — show the first matched alerts already waiting (run a backfill match against recent items so the dashboard is never empty on first load).

The wizard writes real config; it is not a tour. Completion state is stored so it never re-nags.

### 5.6 Dashboard — Must

The home surface. A reverse-chronological, severity-aware feed of alerts scoped to the user's watchlist, with filters (band, asset, source, status) and saved views. See 02-ui-spec.md §7.

### 5.7 Simplicity / quality-of-life features — Should

These are the "additional features to be as simple to use" from the goal. Each removes a decision from the user:

- Saved views / smart defaults — first run lands on "Critical & high, last 30 days."
- Status on each alert — new → acknowledged → resolved / ignored, one tap, optimistic.
- Plain-English summaries — every alert has a one-sentence "what this means for you" line. If a summarizer model is available, generate it; otherwise template from severity + asset + source.
- Health banner — if a feed is failing or a channel is misconfigured, say so at the top of the dashboard, not buried in settings.

### 5.8 Public API & keys — Must

Read access to alerts, watchlist management, and notification subscriptions over a versioned REST API authenticated by API keys, plus outbound webhooks. Fully specified in 03-api-spec.md.

### 5.9 Could (post-MVP, name them so they're not silently scoped in)

RSS/Atom output of a user's own feed; CSV/JSON export; per-asset risk trend chart; Discord/Teams/PagerDuty connectors; scheduled reports as PDF; basic multi-user (read-only viewer).

### 5.10 Won't (this cycle)

Multi-tenant/org isolation; RBAC beyond a single shared admin; active scanning/probing of assets; takedown or remediation workflow; mobile apps.

## 6. Data model (SQLite)

Authoritative entity set for the MVP. Names are guidance; reconcile with existing tables and migrate rather than duplicate. Timestamps are UTC ISO-8601 stored as TEXT; ids are ULIDs (sortable) stored as TEXT.

**source** — a configured feed/adapter
- id, kind (rss|kev|nvd|breach_adapter), name, config_json, enabled, last_run_at, last_status (ok|error), last_error.

**item** — a normalized ingested record (pre-match, deduped)
- id, dedup_hash (unique), source_ids_json (merged on dedup), title, summary, canonical_url, cve_id (nullable), published_at, severity_score (0–100), severity_band, raw_json, created_at.

**watchlist_item** — an asset the company tracks
- id, type (domain|email|vendor|keyword|ip_cidr), value, label, enabled, created_at.

**alert** — an item matched to an asset (the user-facing unit)
- id, item_id (fk), watchlist_item_id (fk, nullable for un-scoped global criticals), match_reason, severity_band, status (new|acknowledged|resolved|ignored), snoozed_until (nullable), first_seen_at, acknowledged_at (nullable), resolved_at (nullable), created_at. Unique on (item_id, watchlist_item_id). (acknowledged_at/resolved_at are set once on first transition and power MTTA/MTTR — see 04-analytics-spec.md §2.)

**subscription** — a routing rule
- id, channel (slack|email|webhook), target_ref (fk to a channel config), min_band, delivery (immediate|digest), enabled.

**channel_*** — channel configs (channel_slack, channel_email, channel_webhook): connection details + a verified_at.

**api_key** — id, name, hashed_key (store hash only, never plaintext), prefix (first 8 chars, shown in UI for identification), scopes_json, last_used_at, created_at, revoked_at.

**webhook** — outbound endpoint: id, url, secret (for HMAC signing), event_types_json, enabled, failure_count, disabled_reason.

**delivery_log** — id, alert_id, channel/webhook_id, status, attempts, last_attempt_at, response_code. Enables idempotency + retry visibility.

**setting** — single-row app config (digest schedule, onboarding-complete flag, instance name).

Relationships: item 1—N alert; watchlist_item 1—N alert; subscription references a channel config; delivery_log references alert + channel/webhook.

## 7. Non-functional requirements

- **Self-host first.** Single command (docker compose up) to a working instance on commodity hardware. SQLite file is the entire database; back it up by copying one file.
- **Zero-config defaults.** Every setting has a sane default. The tool runs and ingests before the user touches anything.
- **Simplicity is a hard requirement, not a vibe.** If a feature needs a manual or a tooltip to be usable, redesign it. Target: first useful alert in under 10 minutes from docker compose up.
- **Performance.** Dashboard interactive < 1.5s on a 1k-alert instance. Ingestion is async/background and never blocks the UI.
- **Security & privacy.** No telemetry by default; if added later it is opt-in and documented. API keys hashed at rest. Third-party API keys are user-supplied and stored locally only. No company data leaves the instance unless the user configures an outbound channel.
- **Reliability.** Feed failure is isolated — one broken source never stops the others, and its failure is surfaced (§5.7 health banner).

## 8. Success metrics

- Activation: % of installs that complete onboarding and add ≥1 watchlist item. Target > 60%.
- Time-to-first-alert: median minutes from first run to first delivered notification. Target < 10 min.
- Retention proxy (OSS): instances still ingesting after 30 days.
- Conversion (hosted): free → paid on the hosted tier (§10).

## 9. OSS-readiness deliverables

The refactor is not done until a stranger can adopt it. Ship as plain Markdown / standard files in the repo root:

- README.md — what it is, a 30-second docker compose up quickstart, a screenshot, feature bullets, link to this spec, license badge.
- Dockerfile + docker-compose.yml — app + persistent volume for the SQLite file; sensible env defaults; healthcheck.
- .env.example — every env var with a comment and a safe default; secrets clearly marked.
- LICENSE — permissive (MIT or Apache-2.0) to maximize adoption; choose explicitly and state the rationale in the PR.
- CONTRIBUTING.md — local dev setup, how to run tests, how to add a source adapter (the most likely community contribution — make this path obvious).
- SECURITY.md — how to report a vulnerability. A security tool without a disclosure policy is a bad look.

## 10. Landing page & profitability

Open-source core stays free and complete. Monetize convenience, not capability — the "profitability" hook from the goal.

Model: open-core + hosted.

- **Free / self-host:** the entire tool. No artificial limits, no gated features in the OSS build. This is the distribution engine; crippling it kills adoption.
- **Hosted (paid):** "don't want to run it yourself" — managed instance, automatic updates, backups, optional bundled premium breach-data adapters (where the cost is the third-party data, not the software). Tiered by number of watched assets / notification volume.
- **Optional support / sponsorship:** GitHub Sponsors + a "supported" badge for companies that want SLA-backed help.

Landing page job: convert a visitor into either a docker compose up (OSS adopter, grows the funnel) or a hosted-tier signup (revenue). Design and copy live in 02-ui-spec.md §11. It must show the product (real screenshot, not an illustration), state the one-line value, present both CTAs with self-host as the honest default, and include a transparent pricing block for the hosted tier. No dark patterns — the audience is technical and allergic to them.

## 11. Constraints & explicit non-goals

Single shared admin (no multi-user/RBAC), single tenant, no active scanning, no remediation workflow. These keep the MVP honest. Revisit only after activation metrics justify it.

## 12. Renaming

Product name Underhack appears in: page titles, README, landing copy, default instance name setting, email "from" name, and webhook user-agent. Centralize it in one constant / config value so a rename is a single edit, not a grep-and-pray.
