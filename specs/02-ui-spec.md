# 02 — UI Specification

This is the visual and interaction contract. It applies to every screen. When building any UI, load the frontend-design skill and follow these tokens; do not invent a parallel palette or type scale mid-build.

## 1. Design philosophy

Underhack is a security tool used by anxious non-experts. The interface's primary job is to reduce anxiety through clarity: say what happened, say whether it matters, say what to do. Three principles, in priority order:

- **Calm by default.** Most days, nothing is critical. The UI should feel quiet and reassuring when all is well — not a wall of red. Severity color is earned, not ambient.
- **Plain language over jargon.** No raw CVSS vectors, no acronyms without expansion, on any default surface. The expert detail exists but is one click away, never the first thing seen.
- **Every state is designed.** Empty, loading, error, and success are first-class screens, not afterthoughts. A monitoring tool spends most of its life in the "nothing wrong" state — that state must look intentional.

## 2. Aesthetic direction

Avoid generic AI aesthetics (no Inter-on-white, no purple-gradient hero, no cookie-cutter SaaS template). Commit to a calm, editorial, technically-credible direction: think a well-made developer tool crossed with a clean newsroom. Restraint over decoration — this is the "refined minimalism" path from the design skill, executed with precision in spacing and type rather than effects.

- Default to a dark theme for the app (operators live in it; it reads as a serious tool), with a fully-supported light theme. The landing page may run light/editorial to feel open and trustworthy — the two surfaces can differ in mood while sharing tokens.
- One distinctive display face for headings, one highly-readable workhorse for body and data. Use a monospace for technical values (domains, CVE IDs, hashes, API keys) — it signals precision and aids scanning. Do not use Inter/Roboto/Arial as the display face.
- Severity is the only place saturated color appears in the app chrome. Everything else lives in a near-neutral scale.

The exact display font is a build-time choice (pick something with character — a humanist or grotesque with personality, not a default); whatever is chosen, register it as `--font-display` so it is swappable in one place.

## 3. Design tokens

Define once as CSS custom properties; never hard-code a hex or px in a component. Values below are the contract — a build may tune them but must keep the structure and the contrast guarantees.

### 3.1 Color (dark theme canonical; light theme mirrors with inverted neutrals)

```css
:root {
  /* neutrals — the 90% of the UI */
  --bg:            #0e1116;  /* app background */
  --surface:       #161b22;  /* cards, panels */
  --surface-2:     #1c232c;  /* raised / hover */
  --border:        #2a323c;
  --text:          #e6edf3;  /* primary */
  --text-muted:    #9aa7b4;  /* secondary */
  --text-faint:    #6b7785;  /* tertiary / placeholder */

  /* brand — sparse, used for primary actions + links */
  --accent:        #4ea1ff;
  --accent-hover:  #6db3ff;

  /* severity — the ONLY saturated chrome color */
  --sev-critical:  #ff5c5c;
  --sev-high:      #ff9f43;
  --sev-low:       #ffd76a;
  --sev-info:      #5fb0c9;
  /* each severity also has a -bg (12% alpha) for badge fills */

  /* status */
  --ok:            #3fb950;
  --warn:          #d29922;
  --danger:        #f85149;
}
```

Contrast: body text on --bg/--surface must meet WCAG 2.2 AA (4.5:1); large text and UI components meet 3:1. Severity colors are never the sole carrier of meaning — always paired with a label/icon (§4 badges, and §10 accessibility).

### 3.2 Typography

```css
--font-display: /* distinctive, character-rich; NOT Inter/Roboto/Arial */;
--font-body:    /* highly readable workhorse */;
--font-mono:    ui-monospace, "JetBrains Mono", SFMono-Regular, monospace;

--text-xs: 0.75rem;  --text-sm: 0.875rem; --text-base: 1rem;
--text-lg: 1.125rem; --text-xl: 1.375rem; --text-2xl: 1.75rem; --text-3xl: 2.5rem;
--leading-tight: 1.2; --leading-normal: 1.55;
```

Domains, CVE IDs, IPs, hashes, keys → always `--font-mono`. Headings → `--font-display`. Everything else → `--font-body`.

### 3.3 Spacing, radius, shadow, motion

```css
/* 4px base scale */
--space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
--space-6:24px; --space-8:32px; --space-12:48px; --space-16:64px;

--radius-sm:6px; --radius:10px; --radius-lg:16px; --radius-full:9999px;

--shadow-sm: 0 1px 2px rgba(0,0,0,.3);
--shadow:    0 4px 16px rgba(0,0,0,.35);

--ease: cubic-bezier(.2,.7,.2,1);
--dur-fast:120ms; --dur:200ms; --dur-slow:360ms;
```

Motion is purposeful and quiet: state changes, entrances of new alerts, toast in/out. One orchestrated staggered reveal on first dashboard load is welcome; scattered hover gimmicks are not. All motion respects prefers-reduced-motion (§10).

## 4. Core components (contracts)

Each component is defined by states, not just appearance. Build them once; reuse everywhere.

- **Button** — variants primary (accent fill), secondary (border, transparent), ghost, danger. States: default / hover / active / focus-visible / disabled / loading (spinner + disabled, label retained). Min touch target 40px.
- **Severity badge** — band label + a shape/icon cue + color. critical and high use a filled treatment; low/info use a subtle outline. Never color-only.
- **Status pill** — new (accent dot) / acknowledged / resolved / ignored, each with a distinct shape, not just hue.
- **Input / Select / Toggle** — visible label (never placeholder-as-label), focus ring using --accent, inline error text + aria-describedby, helper text slot.
- **Card / Panel** — --surface, --border, --radius, --space-6 padding. The alert row is a specialized card (§7.2).
- **Table** — sticky header, zebra via --surface vs --surface-2, sortable columns, responsive collapse to stacked cards under --bp-md.
- **Toast** — transient confirmation for optimistic actions (ack/resolve/snooze); auto-dismiss with an undo affordance for destructive ones.
- **Modal / Drawer** — focus-trapped, Esc closes, returns focus to trigger; alert detail opens in a right-side drawer so the feed stays in context.
- **Empty state** — illustration-light, one sentence of what goes here + one primary action. Distinct per surface (§6).
- **Banner** — top-of-dashboard health/error notice (§7), dismissible, severity-styled.

## 5. Layout & responsive

- App shell: persistent left nav rail (Dashboard, Insights, Watchlist, Integrations, API keys, Settings) that collapses to a top bar + hamburger under --bp-md. Content max-width ~1200px, generous gutters.
- Breakpoints: `--bp-sm:640px --bp-md:768px --bp-lg:1024px --bp-xl:1280px`.
- Mobile is real: a founder checks alerts on their phone. The feed, alert detail, ack/resolve, and onboarding must all be fully usable at 375px. Tables collapse to cards; the drawer becomes a full-screen sheet.

## 6. Universal state rules (apply to every data surface)

| State | Rule |
|-------|------|
| Loading | Skeleton rows matching final layout (not a centered spinner) for lists; inline spinner inside buttons for actions. Show within 100ms. |
| Empty (first run) | Friendly, instructive, one CTA. Dashboard empty = "No alerts yet — we're watching. Add assets to watch →". Never a blank panel. |
| Empty (filtered to nothing) | "No alerts match these filters" + a one-tap clear-filters. Distinct from first-run empty. |
| Error | Plain-language cause + a retry. Never a raw stack trace or HTTP code as the whole message. |
| Success | Optimistic update + toast. The change appears instantly; reconcile/rollback silently on failure with a toast. |

## 7. Page specs

### 7.1 Dashboard (/) — the home surface

- Top: health banner if any feed/channel is unhealthy; otherwise absent (calm-by-default).
- Header row: instance name, a quiet summary ("3 new · 1 critical this week"), and the active saved view selector. Default view on first run: Critical & high, last 30 days.
- Filter bar: band, asset, source, status — as toggle chips, multi-select, reflected in the URL so views are shareable/bookmarkable.
- Body: reverse-chronological alert feed of alert rows. New alerts since last visit are subtly marked.
- Each row click → alert drawer (7.3). Row-level quick actions (ack / snooze) without opening.

### 7.2 Alert row (the most-seen component)

Left: severity badge. Center: plain-English one-liner ("acme.com appeared in a credential leak") + the affected asset as a mono chip + source + relative time. Right: status pill + quick actions. Mono for the asset value; everything else body font. The row answers what / does it matter / what asset in one glance.

### 7.3 Alert detail (right drawer)

Plain-English summary first ("what this means for you"). Then: affected asset, match reason ("matched keyword acme in title"), severity (band prominent, raw score/CVSS available under a "technical details" disclosure — collapsed by default per principle 2), source link(s), first-seen/last-seen, and a status control. Footer: links to related alerts for the same asset (the "future tracking" payoff — here's everything that's ever hit this domain).

### 7.4 Onboarding wizard (/welcome)

Full-bleed, three steps (per 01 §5.5), a progress indicator, Back/Skip always available, no dead ends. Each step writes real config. Step 3 shows already-matched alerts so the user sees value before finishing. Completion sets the onboarding flag; never shown again unless reset from settings.

### 7.5 Watchlist (/watchlist)

The asset manager. Add via a single input with type auto-detection (looks like a domain → domain; has @ → email) with manual override. Each asset shows its match count and a sparkline/trend of recent activity. Bulk paste supported (one per line). Empty state nudges to add the company domain.

### 7.6 Integrations (/integrations)

Channel cards: Slack, Email/SMTP, Webhook. Each: connect form, a "send test" button with live result, and a verified_at indicator. A misconfigured channel is visibly flagged. Routing rules (band→channel, immediate vs digest) edited here with plain-language sentences ("Send critical alerts to Slack immediately").

### 7.7 API keys (/settings/api)

List keys by name + prefix + last-used. Create flow shows the full key exactly once, with a copy button and an explicit "you won't see this again" warning. Revoke is immediate with confirm. Link to 03-api-spec.md quickstart and a copy-paste curl example inline.

### 7.8 Settings (/settings)

Instance name, theme, digest schedule, retention, reset onboarding, export. Quiet and short — most users never come here.

## 8. Microcopy & tone

Direct, calm, second person, no fear-mongering. "We found a credential leak affecting acme.com" not "⚠️ CRITICAL SECURITY ALERT!!!". Buttons are verbs ("Add asset", "Send test", "Acknowledge"). Errors are honest and actionable. Never blame the user. The product's voice should make a non-expert feel handled, not alarmed.

## 9. Iconography & imagery

Lightweight line icons (one set, consistent weight). Severity gets a distinct shape per band (so it survives grayscale/colorblindness). Avoid stock "hacker in a hoodie" imagery entirely — it's a cliché and undermines credibility. Product screenshots over illustrations on the landing page.

## 10. Accessibility (WCAG 2.2 AA — non-negotiable)

- Full keyboard operability; visible `:focus-visible` ring on every interactive element; logical tab order; Esc closes overlays and returns focus.
- Color contrast meets AA; no meaning by color alone — severity and status always carry a label and/or shape.
- Semantic HTML and ARIA: live region (aria-live="polite") announces new alerts and toast confirmations; modals/drawers use role="dialog" + focus trap; form errors linked via aria-describedby.
- prefers-reduced-motion: disable non-essential transitions, keep instant state changes.
- Hit targets ≥ 40px; text resizable to 200% without loss of function.
- Test with keyboard-only and a screen reader before any UI phase is "done."

## 11. Landing page (/ public, pre-auth or separate marketing route)

Job: convert to a self-host or a hosted signup (01 §10). Editorial, trustworthy, honest. Structure top-to-bottom:

1. Hero — one-line value ("Know when a breach touches your business — before your customers do."), a real product screenshot (the dashboard), and two CTAs: primary Self-host free (→ docs/quickstart), secondary Try hosted. Self-host is the honest default for the technical audience.
2. The problem — three plain sentences on why small companies are exposed and underserved.
3. How it works — three steps mirroring onboarding (watch your assets → we match the world's breach/leak/vuln signal → you get a plain-English alert). Use real UI fragments, not abstract icons.
4. Features — scannable, benefit-led, not a checklist of jargon.
5. Open-source — repo link, license, "the whole tool is free and yours," star count. This builds trust and is the distribution engine.
6. Pricing — transparent table: Self-host (free, everything) vs Hosted (tiers). No dark patterns, no fake scarcity.
7. Footer — docs, GitHub, security policy, contact.

Performance budget: fast first paint, no heavy hero video, screenshots optimized. The landing page's credibility is the product's credibility — polish it to the same standard as the app, using the shared tokens (§3).

## 12. UI definition-of-done checklist

A screen ships only when: every state (loading/empty/error/success) is designed; keyboard + screen-reader pass; AA contrast verified; reduced-motion respected; mobile usable at 375px; no hard-coded colors/sizes (tokens only); copy is plain-language and on-tone; optimistic actions have toast + rollback.
