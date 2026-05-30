# Security policy

## Reporting a vulnerability

If you've found a security issue in Underhack, **please do not open a public
GitHub issue**. Instead, email **security@underhack.dev** with:

- A description of the issue and its impact
- Steps to reproduce (a minimal proof-of-concept is ideal)
- The commit SHA or release tag you tested against
- Whether you'd like public credit when the fix ships

We'll acknowledge your report within **3 business days** and aim to ship a
fix or mitigation within **30 days** for high-impact issues. We'll keep you in
the loop while we work on it.

## Scope

In scope:

- The Underhack web app (`app/`) and worker (`src/`)
- The public REST API (`/api/v1/*`)
- Default Docker image and `docker-compose.yml`
- Authentication, session handling, and API key issuance

Out of scope:

- Third-party feed providers (CISA, NVD, HIBP, GitHub Advisories, etc.) — please
  report issues there directly
- Self-hosted misconfiguration that requires attacker access to the host
- Rate-limiting absence on self-hosted deployments behind your own gateway

## Supported versions

We patch the latest minor release on `main`. Older self-hosted builds may be
patched on request — get in touch.

## Coordinated disclosure

We follow standard 90-day coordinated disclosure. If you need to publish
research sooner, let us know and we'll work out a timeline together.

## Hardening notes for operators

A few things worth knowing if you're running Underhack yourself:

- **API keys are hashed with SHA-256 at rest.** The token is only shown once,
  at creation. If you lose it, revoke and re-issue.
- **Webhook payloads are signed.** Verify the `X-Underhack-Signature` header
  (HMAC-SHA256 of `<timestamp>.<body>`) before trusting the payload — see
  `/docs/api`.
- **Sessions use HTTP-only cookies** with the `Secure` flag in production.
  Run behind TLS.
- **The SQLite database file contains everything** (sessions, API keys,
  alerts). Back it up encrypted; don't commit it.
- **OAuth client secrets** live in `.env`. Don't commit `.env`; the
  `.dockerignore` and `.gitignore` already exclude it.
