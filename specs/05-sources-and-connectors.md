# 05 — Sources, Connectors & Breach-Tracking API

This doc owns: the connector contract (how a data source plugs into Underhack), the catalog of real breach/vuln/threat-intel sources we can ship (free first, keyed later), and the extension of the public API for breach tracking (sources, exposure, enrichment, vulnerabilities, ingest).

It extends `03-api-spec.md` — read that first for auth, errors, pagination, webhook signing.

## 1. Connector / adapter contract

Sources are isolated. A connector is a small TypeScript module exposing this minimal interface:

```ts
interface Connector {
  id: string;                       // stable kind, e.g. "cisa-kev"
  name: string;                     // display name
  modes: ("poll" | "lookup" | "stream")[];
  serves: WatchlistType[];          // which asset types this can match against
  config_schema: JSONSchema;        // operator config (URLs, keys, intervals)
  auth: "none" | "key" | "oauth";   // how the operator authenticates
  rate_limit?: { rpm?: number; rps?: number };

  // pull data (poll) or check a specific value (lookup); return normalized items
  fetch(ctx: ConnectorContext, opts?: FetchOpts): Promise<NormalizedItem[]>;

  // turn provider-native rows into the canonical item shape
  normalize(raw: unknown, ctx: ConnectorContext): NormalizedItem[];

  // optional: long-lived stream (e.g. CertStream); framework manages reconnects
  stream?(ctx: ConnectorContext, onItem: (it: NormalizedItem) => void): Disposable;

  // shallow probe used by "Send test" in the UI and by /sources/{id}/test
  health(ctx: ConnectorContext): Promise<{ ok: boolean; detail?: string }>;
}
```

The framework owns: scheduling, retry/backoff, per-source rate limiting, response caching, dedup, persisting `raw_json`, updating `last_run_at` / `last_status` / `last_error`, and matching `NormalizedItem` against the watchlist. A connector author only writes `fetch`/`normalize`/`health`.

`NormalizedItem` is the same `item` shape from `01-product-spec.md §6`. Match metadata (which `watchlist_item.type` candidates an item references) is produced by the connector and used by the router to skip irrelevant sources for a given watchlist mix.

### Modes

- **poll** — scheduled fetch on an interval declared by the connector or operator. Most sources.
- **lookup** — on-demand query for a specific value (e.g. "is this domain in HIBP?"). Backs `/api/v1/exposure/{type}/{value}` and `/api/v1/enrich`. Cached aggressively.
- **stream** — long-lived connection (e.g. CertStream WebSocket). Framework reconnects with jitter and persists checkpoints.

## 2. Source catalog (real, attribution + auth tier)

Ship tiers in order: Tier-0 first (no key required), Tier-1 when the UI can configure keys, Tier-2 only as opt-in adapters with operator-supplied credentials.

### Tier 0 — free, no auth

| Source | What it gives | Mode | Notes |
|--------|---------------|------|-------|
| CISA KEV | Known-exploited vulnerabilities (highest-priority CVEs) | poll | Already shipping. Single JSON file, daily. |
| NVD CVE feeds | All published CVEs with CVSS | poll | Already shipping. Use the 2.0 JSON feed; respect 6 req/30s without an API key. |
| OSV.dev | Vulns across open-source ecosystems (npm, PyPI, Go, etc.) | poll + lookup | Free, no key. Critical for software-bill-of-materials matching. |
| EPSS | Daily exploit-probability score per CVE | poll | Pairs with KEV/NVD for severity composition (§3). |
| Generic RSS/Atom | Vendor advisories, blogs, newsrooms | poll | Already shipping. |
| crt.sh | Certificate Transparency lookup by domain | lookup | Catches `*.acme.com` issued by anyone — phishing/typosquat signal. |
| CertStream | Real-time CT log firehose | stream | Optional; high volume. Off by default. |

### Tier 1 — free with a key (operator supplies)

| Source | What it gives | Mode | Notes |
|--------|---------------|------|-------|
| HIBP (breach metadata) | Public list of breaches; "is this breach in DB?" | poll | Free for breach metadata. Domain/email search is paid (Tier 2). |
| abuse.ch (URLhaus / ThreatFox / MalwareBazaar / SSLBL) | Malware URLs, IOCs, malware samples, bad TLS certs | poll | Free with auth-key; high-quality IOCs. |
| AlienVault OTX | Community threat indicators | poll | Free API key. Pulse subscription model. |
| GreyNoise Community | "Is this IP background internet noise vs targeted?" | lookup | Free community tier; 10k requests/day. |
| SSLMate Cert Spotter | Cert-issuance notifications for your domains | poll/webhook | Free tier limited to a few domains. |

### Tier 2 — paid (always optional, operator-supplied)

| Source | What it gives | Notes |
|--------|---------------|-------|
| HIBP (domain / email / stealer logs) | Active breach exposure for owned domains/emails | Paid subscription. Domain ownership must be verified. |
| Commercial leak APIs (DeHashed, IntelX, LeakCheck, SpyCloud, Flare, etc.) | Direct credential-leak search | Pick one or two and ship as adapters; never bundle keys. |
| Shodan / Censys | Internet-exposed services on owned IPs | Useful for "my asset is exposed" signal. |

### Sources we will NOT ship

- Direct dark-web crawlers, Telegram/Discord scrapers, anything that requires participating in illicit channels. Underhack reads aggregator feeds; it does not collect raw stolen data itself.
- Ransomware.live and similar are personal-use-only per their terms — see legal/ethical guardrails (§5). Treat as opt-in personal mode, not multi-tenant.

## 3. Severity composition

The 0–100 score + 4-band label (info|low|high|critical) is computed from whichever inputs the item has:

- Base: CVSS (NVD) when present; else heuristic from title/keywords.
- Multipliers/boosts:
  - **+ Big boost** if the CVE is in CISA KEV (actively exploited).
  - **+ Scale by EPSS** percentile (higher prob → push toward critical).
  - **+ Bump** if any public exploit known (Exploit-DB, GitHub PoC presence).
  - **+ Bump** for asset-relevance (matched watchlist item is `domain`/`email` and source is a credential leak).

Document the formula in code (one pure function, fully unit-tested). The UI only ever shows the band; raw inputs are visible under the "technical details" disclosure (per `02-ui-spec.md §7.3`).

## 4. API extensions (extends `03-api-spec.md`)

All endpoints follow §1–§3 of the API spec: bearer key, problem+json errors, cursor pagination. New scopes:

| Scope | Endpoints |
|-------|-----------|
| `sources:read` | `GET /sources`, `GET /sources/catalog`, `GET /sources/{id}` |
| `sources:write` | `POST /sources`, `PATCH /sources/{id}`, `DELETE /sources/{id}`, `POST /sources/{id}/test` |
| `exposure:read` | `GET /exposure/{type}/{value}`, `POST /exposure/password` |
| `enrich:read` | `GET /enrich?type=...&value=...` |
| `vulns:read` | `GET /vulnerabilities` |
| `ingest:write` | `POST /scan`, future `POST /ingest` for pushed items |

### 4.1 Sources — `/sources`

- `GET /sources/catalog` → the static list of buildable connectors (id, name, modes, serves, config_schema). UI renders forms from this.
- `GET /sources` → configured-and-installed sources with health/last-run.
- `POST /sources` → install a catalog entry with operator config. Validates against `config_schema`.
- `PATCH /sources/{id}` → toggle enabled, edit config, edit interval.
- `DELETE /sources/{id}` → remove (raw items stay for history).
- `POST /sources/{id}/test` → invokes `health()` + a minimal `fetch` and returns the result without writing.

### 4.2 Exposure — `/exposure`

- `GET /exposure/domain/{domain}` — has this domain appeared in known breaches we have access to?
- `GET /exposure/email/{email}` — same, per email.
- `POST /exposure/password` with `{ "prefix": "21BD1" }` — k-anonymity SHA-1 prefix lookup against HIBP Pwned Passwords. We never accept full passwords; the prefix protocol is mandatory.

Always returns a typed result with `sources` listed so the user knows where the answer came from.

### 4.3 Enrichment — `/enrich?type=ip|domain|hash|cve&value=...`

Aggregates lookups across configured sources for the given type: GreyNoise/abuse.ch/OTX for IPs, crt.sh/CT for domains, VT/abuse.ch for hashes, NVD/EPSS/KEV for CVEs. Returns one normalized envelope with per-source verdicts; the UI shows the consensus.

### 4.4 Vulnerabilities — `GET /vulnerabilities`

Prioritized list of vulnerabilities the operator should care about: KEV-listed first, then high-EPSS, then high-CVSS, filtered by watchlist relevance when possible. Mirrors `/alerts` filters; not a duplicate — this is the catalog view ("what should we patch?") versus the event view ("what just hit us?").

### 4.5 Scan — `POST /scan`

Triggers an immediate match run against all configured sources for the operator's current watchlist. Returns a job id; status via `GET /scan/{job_id}` (post-MVP) or surfaced via the next `/alerts` poll. Used by the wizard's "show me what's already there" step.

### 4.6 New webhook events

Extends `03-api-spec.md §5.1`:

- `exposure.found` — a watchlist item newly appeared in a breach/leak source.
- `cert.issued` — a new certificate was issued for (or a subdomain of) a watched domain.
- `ransomware.victim` — a watched org/vendor was named on a ransomware site (personal-use connectors only).
- `vuln.kev_added` — a CVE that affects an installed product (matched via vendor/keyword watchlist) just landed in KEV.

Payload shape matches §5.2: `{ event, id, created_at, data }`. Same signing headers.

## 5. Legal, ethical, and reliability guardrails

- **Terms of service.** Every connector states its provider terms in its config_schema description. The framework refuses to install a connector whose terms forbid the configured use (e.g. Ransomware.live → block multi-tenant).
- **No illicit access.** Never bundle dark-web crawlers, paste-site scrapers that require auth-bypass, or anything that ingests data exfiltrated from non-public sources directly.
- **Minimize egress.** A lookup connector sends only the necessary identifier; never the whole watchlist. Where k-anonymity protocols exist (HIBP passwords), they are mandatory.
- **Operator-supplied keys only.** Underhack ships zero bundled paid keys; the OSS build has no commercial-API credentials baked in. Keys are stored encrypted at rest using a key derived from the instance's `setting.encryption_seed`.
- **Caching & rate limiting are framework concerns**, not connector concerns. The connector declares its limits; the framework enforces them, retries with jitter, and stagger-schedules to prevent thundering herds.
- **Persist raw payloads.** Every fetched batch keeps its raw JSON in `item.raw_json` so re-normalization after a scoring bugfix doesn't require re-fetching.
- **Per-source isolation.** A connector crash never blocks others (per `01-product-spec.md §7`).

## 6. UI surfaces (cross-ref `02-ui-spec.md`)

- **Integrations → Sources** tab (new). Lists installed sources with health pill, last run, items/run, throughput chart. "Add source" opens a catalog modal rendered from `GET /sources/catalog`; the form is generated from `config_schema`.
- **Watchlist** — when adding a domain or email, suggest enabling the lookup connectors that serve those types (e.g. enable HIBP exposure + crt.sh when a domain is added).
- **Insights** — source-contribution chart powered by §4.4 numbers.

## 7. Implementation handoff (Claude Code build order)

Build in this order; each step is independently shippable and testable.

1. **Connector framework.** Implement the contract in §1: scheduler, retry/backoff, rate-limiter, cache, health wiring, raw-payload persistence. Migrate the existing RSS, CISA KEV, and NVD collectors onto it (no behavior change — just structural). This is the highest-leverage refactor; every later step lands on top of it.
2. **Tier-0 free sources.** Ship OSV, EPSS, and crt.sh (lookup) on the new framework. Each gets unit tests for `normalize` and a contract test against a recorded fixture.
3. **Severity composition.** Land the §3 scoring function with full unit tests; backfill scores on existing items in a one-shot migration.
4. **Source management API + UI.** Land `GET /sources/catalog`, `POST /sources`, `PATCH`, `DELETE`, `POST /sources/{id}/test`. Build the Integrations → Sources page rendering forms from `config_schema`.
5. **Tier-1 keyed sources.** abuse.ch, OTX, GreyNoise (lookup). UI configures keys; framework stores encrypted.
6. **Exposure / Enrichment / Vulnerabilities API.** Land §4.2–§4.4 endpoints, plus the new webhook events (§4.6).
7. **HIBP + Ransomware.live (opt-in).** Implement domain-ownership verification for HIBP; gate Ransomware.live behind a personal-use confirmation in settings. Skippable for the first OSS release.

The CLAUDE-FOR-AGENTS rules apply throughout: small surface, plain language errors, tested at the public boundary, and never broaden a connector's permissions beyond what its config_schema declares.
