# Contributing to Underhack

Thanks for considering a contribution! Underhack is intentionally small and
easy to hack on — the whole app fits in your head.

## Ground rules

- **Keep it small.** If a feature can be done with 200 lines and no new
  dependency, that's the preferred shape.
- **Single-binary friendly.** Don't introduce a separate service unless we
  truly can't avoid it. SQLite + a worker is the deployment story.
- **Cite sources.** If you're adding a new intel feed, link the publisher's
  TOS in the PR. We don't want to scrape ourselves into trouble.

## Local setup

```bash
git clone https://github.com/your-org/underhack
cd underhack
npm install
cp .env.example .env       # add REQUESTY_API_KEY at minimum
npm run dev                # web on :4317
npm run worker             # background collector
```

## Repo layout

```
app/                 Next.js App Router (UI + API)
  api/v1/            Public REST API (Bearer-authed)
  api/                Internal API (session-authed)
src/
  agents/            collector / triage / notifier
  db/                schema + repos (better-sqlite3)
  services/          auth, settings, connectors
  worker.ts          background poll loop
lib/                 small shared helpers
```

## Adding a source

1. Add a `kind` to `src/db/index.ts` (e.g. `"github-advisory"`).
2. Implement a fetcher in `src/agents/collector.ts`.
3. Update the onboarding presets in `app/onboarding/page.tsx`.

## Adding a connector

1. Add a `kind` to the connectors table.
2. Implement dispatch in `src/services/notifications.ts` (or wherever
   `dispatchNotification` lives).
3. Add a row to the Connectors page UI.

## Style

- TypeScript everywhere. No `any` in new code if you can help it.
- Prefer plain functions over classes.
- One screen per file. If a file is bigger than ~400 lines, it probably
  wants to be split.

## PR checklist

- [ ] `npm run build` passes
- [ ] `npm run lint` clean (if linter is configured)
- [ ] Manual test: open the dashboard, trigger the new path, see expected behavior
- [ ] README / docs updated if you changed setup or API surface

## Security

Please **do not** open a public issue for security bugs. Email
security@underhack.example with details. We'll acknowledge within 72 hours.
