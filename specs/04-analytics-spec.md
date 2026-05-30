# 04 — Analytics & Metrics Specification

Metrics serve three different audiences, and conflating them is the most common way analytics goes wrong. This doc separates them on purpose:

- §3 **User-facing security metrics** — what the small company sees about their own posture over time. This is the "useful for future tracking" promise from the goal and the product's biggest differentiator over a one-shot breach checker.
- §4 **Operational metrics** — whether the instance is healthy (ingesting, matching, delivering). Feeds the health banner and an operator view.
- §5 **Product & business metrics** — whether the project is succeeding (activation, retention, conversion). Privacy-gated; expands 01-product-spec.md §8.

Governing principle: never instrument anything you can't justify to the user. This is a security and privacy tool — its analytics must hold a higher bar than the products it monitors. See §7.

## 1. Implementation approach

At small-company scale (typically hundreds to low-thousands of alerts), compute on read directly from SQLite. Do not build a metrics pipeline, a time-series DB, or rollup tables in the MVP — it violates the simplicity NFR and earns nothing at this volume. Index the timestamp/status columns the queries below need and cache results for a short TTL (e.g. 60s) if a page feels slow.

Pre-aggregated daily rollup tables are a documented post-MVP optimization, triggered only when an instance crosses a row count where on-read aggregation misses the dashboard's 1.5s budget — not before.

## 2. Required data-model support

The metrics in §3 depend on status-transition timestamps that a plain status column can't reconstruct. 01-product-spec.md §6 has been updated so the alert entity carries `acknowledged_at` and `resolved_at` (nullable). Set them on the corresponding PATCH transition; never overwrite once set (first transition wins, so MTTA/MTTR reflect reality). Everything else needed is already in `item`, `alert`, `watchlist_item`, `source`, and `delivery_log`.

## 3. User-facing security metrics

Surfaced on a new Insights page (added to the nav rail in 02-ui-spec.md §5) and returned by `GET /api/v1/metrics` (03-api-spec.md §4.6). All respect the active dashboard filters (asset, time range) so a user can scope "show me just acme.com, last 90 days."

| Metric | Definition | Source | Why it matters |
|--------|------------|--------|----------------|
| Alert volume over time | Count of alerts per day/week, split by severity_band | alert.created_at, severity_band | The headline trend — is exposure rising or falling? |
| Open backlog | Alerts in new or acknowledged over time | alert.status | Is work piling up? |
| MTTA (mean time to acknowledge) | avg(acknowledged_at − first_seen_at) over resolved/acked alerts in range | alert timestamps | How fast the company notices. The honest measure of whether the tool is being used. |
| MTTR (mean time to resolve) | avg(resolved_at − first_seen_at) | alert timestamps | How fast they act. |
| Aging alerts | Alerts acknowledged but unresolved > N days | alert | Surfaces the silently-ignored. Drives the health banner. |
| Per-asset exposure | Alert count + band breakdown + trend, per watchlist_item | alert ⋈ watchlist_item | The "what has ever hit acme.com" view — the tracking payoff. |
| Riskiest assets | Watchlist items ranked by weighted recent critical/high volume | alert | Where to focus, in one glance. |
| Distinct breach/leak exposure | Count of unique breach/leak items touching any asset in range | item (breach adapters) ⋈ alert | The number a founder actually wants: "how many leaks have hit us." |
| Source contribution | Alerts per source, and relevance ratio (matched / ingested) | source, item, alert | Which feeds earn their keep; tune ingestion. |
| Severity distribution | This period's band mix vs the previous period | alert | "More criticals than last month" framing. |

### 3.1 Posture summary — and the score we deliberately do NOT ship

A small company wants a one-glance "are we OK?" There is strong pull toward a single 0–100 "security score." **Do not build one.** A vanity score for a monitoring tool is actively harmful: it manufactures false confidence (a low alert count can mean "secure" or "not watching enough"), it gamifies in the wrong direction, and it can't be honest about what the tool doesn't see. Instead ship an honest posture summary: open critical/high count, trend arrow vs last period, MTTA, and oldest unresolved critical. Plain numbers, plainly framed, no aggregate fiction. If a future version wants a composite, it must be transparent about inputs and explicitly bounded ("based only on what we monitor"). Capture this as a standing product rule, not just an MVP cut.

### 3.2 Presentation (cross-ref 02-ui-spec.md)

Calm-by-default applies to charts too: muted neutral lines, severity color only on the band-split series, no dashboard of red gauges. Each chart has the universal empty/loading/error states (§6 of the UI spec). Trends use sparkline-density visuals over heavy dashboards — a founder reads them on a phone. Every metric pairs with a plain-English caption ("You're acknowledging alerts in about 4 hours on average — down from 9 last month.").

## 4. Operational metrics

For the operator/admin — instance reliability. Most are already derivable from existing tables; surface them in an operator view and the `/health` endpoint (03 §4.1).

| Metric | Definition | Source |
|--------|------------|--------|
| Feed freshness | Age of last_run_at per source; flag if stale beyond expected interval | source |
| Feed success rate | ok runs / total runs, per source, rolling window | source run history |
| Ingestion throughput | Items ingested per run; dedup rate (deduped / fetched) | item, ingestion log |
| Match rate | Alerts created / items ingested | item, alert |
| Notification delivery rate | Successful deliveries / attempts, per channel | delivery_log |
| Webhook reliability | Retry counts, auto-disable events, current failure_count | webhook, delivery_log |

Any operational metric breaching threshold drives the dashboard health banner (02 §7) — the operator should never have to open an analytics page to learn a feed died.

## 5. Product & business metrics

Expands 01-product-spec.md §8 with measurement detail. These are computed locally and shown to the operator in their own admin view by default — nothing leaves a self-hosted instance unless opt-in telemetry (§6) is enabled.

| Metric | Definition / formula | Notes |
|--------|----------------------|-------|
| Activation rate | installs that complete onboarding AND add ≥1 watchlist item | Target > 60%. Onboarding-complete flag + watchlist count. |
| Time-to-first-alert (TTFA) | first run → first delivered notification (median) | Target < 10 min. From setting.first_run_at → first delivery_log success. |
| 30-day retention proxy | instances still ingesting after 30 days | Self-host: local "alive" check. Hosted: account activity. |
| Channel adoption | % of instances with ≥1 verified channel | Leading indicator of TTFA. |
| Hosted conversion | free → paid on the hosted tier | Lives entirely on the hosted side; not in the OSS build. |

## 6. Opt-in telemetry (self-host) — strict contract

Self-hosted instances send **nothing** by default. An operator may enable anonymous telemetry to help the project; if they do, the contract is non-negotiable:

- Off by default. Enabling is an explicit toggle in Settings with a plain-language explanation and a link to exactly what's sent.
- Strict allowlist — only aggregate, non-identifying counts: instance version, OS/arch, install age bucket, counts of (sources enabled, watchlist items, alerts, channels by type), and the activation/TTFA/retention aggregates above.
- **Never sent, under any circumstance**: asset values (domains, emails, IPs, keywords), alert content or titles, API keys, SMTP/Slack/webhook URLs or secrets, IP addresses beyond coarse geo, or anything reconstructable into who the company is or what they watch.
- Inspectable & reversible: the operator can preview the exact payload before enabling and disable at any time. Document the schema in CONTRIBUTING.md / a TELEMETRY.md.

A security tool that quietly exfiltrates its users' watchlists would be indefensible. This section is a hard boundary, not a guideline.

## 7. Analytics ethics & privacy guardrails

- Honor Do Not Track and never use third-party analytics SDKs in the OSS build (no Google Analytics, no session-replay). The landing page may use privacy-respecting, cookieless analytics; the app ships with none beyond the local metrics above.
- The app's own metrics are first-party, on-device (the SQLite file), and never sold or shared — the same promise made to the user about their alert data.
- No metric should incentivize the wrong behavior. Frame MTTA/MTTR as informational, never as a leaderboard or a number to "beat" that could push users to ack-and-ignore. Wording matters: "down from 9 last month," not "your score improved."

## 8. Definition of done (analytics)

The Insights page renders every §3 metric with empty/loading/error states and AA contrast; MTTA/MTTR compute correctly off the new transition timestamps; `GET /api/v1/metrics` returns the same numbers the UI shows (single source of truth — UI calls the same query layer the API does); operational metrics drive the health banner; telemetry is off by default and, when on, provably sends only the §6 allowlist (covered by a test asserting the payload contains no asset values).
