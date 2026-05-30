Underhack MVP — Specification Package

Goal (verbatim from session): Refactor the solution into an MVP that is the best open-source tool for monitoring breaches and leaks, useful for ongoing tracking by small companies. Add features that keep it simple to use, apply UI best practices, set up a landing page for profitability, expose basic API endpoints for notifications, and keep everything simple.

This folder is the implementation contract for that goal. It is written to be handed directly to Claude Code (and the document/frontend skills) as the source of truth for the refactor.

Underhack is used as the product name throughout — it is a placeholder and can be renamed in one pass (see 01-product-spec.md §12).

## What's here

| File | Owns | Use it when |
|------|------|-------------|
| 01-product-spec.md | Vision, MVP scope, feature list, data model, non-functional requirements, OSS-readiness, landing page / pricing model | Deciding what to build and what to leave out |
| 02-ui-spec.md | Design tokens, component contracts, page-by-page layouts, accessibility, UI best-practice checklist | Building or refactoring any screen |
| 03-api-spec.md | REST endpoints, API-key auth, webhook + notification delivery, integration guides, error/pagination conventions | Building the public API and connectors |
| 04-analytics-spec.md | User-facing security metrics, operational metrics, privacy-gated product metrics, opt-in telemetry contract | Building the Insights page, the /metrics endpoint, and anything measured |
| 05-sources-and-connectors.md | Connector/adapter contract, catalog of real breach/vuln/threat-intel sources, expanded breach-tracking API (sources, exposure, enrichment, vulns), and the Claude Code build handoff | Adding any data source or building the breach-tracking API surface |

Read in order. Each later doc assumes the entities and scope defined earlier.

## Assumed starting point

This spec is grounded in the architecture surfaced during the codebase audit. If the real code diverges, the audit wins on facts and this spec wins on direction — reconcile explicitly before coding.

- Stack: Next.js (App Router assumed) + SQLite, single-process self-hostable.
- Ingestion: RSS, CISA KEV, NVD feeds already pull and normalize.
- Pipeline: triage / scoring layer exists.
- Connectors: Slack + email already send.
- Gaps to close (MVP): public landing page, public notification API with keys, onboarding wizard, UI polish, OSS quickstart assets (README, Docker, .env.example).

## Recommended build phases

Each phase is independently shippable and leaves the tool working.

1. Foundations & data model — reconcile schema in 01 §6, add watchlist, api_key, webhook, subscription tables (plus acknowledged_at/resolved_at on alert for metrics), run migrations.
2. Public API + keys — 03 §3–§6. Read endpoints first, then webhooks. Ship /api/v1/alerts + key management before anything UI-facing.
3. Watchlist / asset tracking — the "future tracking" core (01 §5.2). Wire ingestion → match → alert.
4. Connectors & sources — 05. Land the adapter contract + scheduler, migrate existing RSS/KEV/NVD onto it, then add Tier-0 sources (OSV, EPSS, Certificate Transparency) and the source-management API. Keyed sources (abuse.ch, OTX, GreyNoise, HIBP, Ransomware.live) follow once the UI can configure them. See 05 §7 for the exact build order.
5. UI refactor — apply 02 tokens + component contracts to existing dashboard, then build onboarding wizard.
6. Insights & metrics — 04. Build the shared metrics query layer once, expose it via the Insights page and GET /api/v1/metrics. Operational metrics drive the health banner.
7. Landing page — 02 §11 + 01 §10. Marketing + conversion + self-host CTA.
8. OSS quickstart — README, Dockerfile + compose, .env.example, LICENSE, CONTRIBUTING (01 §9).
9. Polish pass — empty/loading/error states, accessibility audit, digest emails, saved views.

## How to drive this with Claude Code

- Point Claude Code at this folder and one phase at a time. Phases are intentionally small enough to fit a focused session.
- For document deliverables (README, CONTRIBUTING) the docx/md workflow is overkill — keep them as plain Markdown in-repo.
- For any screen, load the frontend-design skill and follow 02-ui-spec.md tokens; do not let the model invent its own palette mid-build.
- Treat every endpoint in 03 as a test target: each ships with at least one happy-path and one auth-failure test.

## Definition of done (MVP)

A small-company admin can, in under 10 minutes and without reading source code: self-host via docker compose up, finish the onboarding wizard, add the assets they want watched, connect one notification channel, generate an API key, and receive their first real alert through both the UI and a webhook.
