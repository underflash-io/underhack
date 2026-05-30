# Autonomous AI-News Brand — Build Spec (Hour Zero)

**Hand this entire file to Claude Code as the project brief before writing any code.**

---

## 1. What we're building

An autonomous news brand with zero humans in the loop. A single orchestrator runs a "newsroom" of agent roles that: watch sources → pick a story → take an angle → write platform-native posts → render a headline-card image → fact-check → publish to X (and Instagram second) → log results → learn from engagement and adjust strategy.

- **Niche:** AI tools for creators and developers. Every story answers "what does this mean for people who build things."
- **Voice:** Sharp, useful, opinionated, no hype, no fluff. Talks to builders like a smart peer, not a press release. Short sentences. A point of view, never a neutral recap.
- **Pitch:** "A newsroom with zero humans — it finds the story, takes a position, ships it the moment it breaks, and gets better every cycle."

### The three things that MUST be real (protect these; mock everything else)
1. The agent loop produces a genuinely good, on-brand post + card from a live story.
2. **Real-time trigger** — a breaking story fires the loop on its own, not on a fixed schedule.
3. **The learning loop closes once** — it reads a real engagement result and changes its next decision.

---

## 2. Architecture (solo-dev shape — NOT microservices)

One codebase, one orchestrator. The "multi-agent newsroom" is implemented as **one loop calling the LLM router with different role prompts.** Do not build five services.

```
                ┌─────────────────────────────────────────────┐
                │              ORCHESTRATOR LOOP               │
                │                                              │
  feeds ──────► │  SCOUT     → rank stories, pick candidate    │
  (RSS/API)     │  EDITOR    → angle + voice + KILL gate       │
                │  WRITER    → X post + IG caption + visual pick │
                │  VISUAL    → card (HTML→PNG) OR illustration   │
                │              (gen, no people) OR screenshot     │
                │  FACTCHECK → verify, source link, no copied     │
                │              text, BLOCK real-person likeness    │
                │                                              │
                │  PUBLISH   → X API (IG second)                │
                │  LOG       → store post + metadata            │
                └───────────────┬──────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        │  WATCHER (cron, every N min): breaking score    │
        │  over threshold → trigger loop immediately      │
        └─────────────────────────────────────────────────┘
        ┌─────────────────────────────────────────────────┐
        │  LEARNER (periodic): read engagement → update     │
        │  strategy.json (preferred hook style, format)     │
        └─────────────────────────────────────────────────┘
```

**Each role = one router call with a role-specific system prompt.** Keep role prompts in separate version-controlled files under `/prompts`, not hardcoded, so voice can be tuned without touching plumbing.

---

## 3. Tech stack (sponsor credits — spend $0 of your own)

| Concern | Use | Notes |
|---|---|---|
| LLM brain | **Requesty router → OpenAI models** | One API, swap model per role. Cheap/fast model for Scout ranking; stronger for Editor angle + Writer prose. |
| Dev-time inference | **Google AI Studio (free until Sun EOD)** | Use while iterating so you DON'T burn router credits. Switch critical path to Requesty before Sunday. |
| Always-on watcher + queue | **Google Cloud** | Hosts the cron watcher and scheduler. Anything depending on AI Studio dies Sunday — keep critical path on Requesty. |
| Domain + VPS + brand email | **Hostinger** | Real domain = "real brand" pitch. Kick off DNS early (propagation is slow). VPS can host the persistent loop past the gcloud cutoff. |
| Image hosting | **Hostinger VPS or GCloud bucket** | Cards must be at a public URL (required for IG, nice for X). |
| Newsletter channel | **openmail** | Add AFTER core loop works. Same content → email = second channel + paid-tier monetization beat. |
| Token efficiency | **condense.chat** | Wire in AFTER the loop works. Compresses context passed between roles. Optimization, not spine. |
| Builder | **Claude Code** | Single driver. (Cursor $50 is fallback only — don't split workflow.) |

---

## 4. Visuals: decision tree (cards + safe illustration, NEVER real-person likeness)

The brand runs unattended, so the visual rules are **hard safety gates**, not preferences. Two things are forbidden because they are account-enders for an autonomous news bot:

- **NEVER pull/republish real photos of named people.** Press/agency photos are copyrighted; auto-republishing them is infringement on autopilot and gets accounts struck.
- **NEVER generate a photorealistic image of a real named person.** A realistic fabricated image of a real person attached to a news claim is a deepfake — both X and Instagram ban misleading synthetic media of real people, and it's defamation risk with no human reviewing. The autonomy is exactly what makes this fatal.

### The visual decision tree (the agent picks ONE path per story)

| Story is about… | Visual | Notes |
|---|---|---|
| A **tool / company / product / theme** (most stories) | **Generated conceptual illustration** (abstract/product theme, NO people) | This is where image generation belongs. Safe + impressive. |
| A **named person** | **Name-forward headline card** — their name styled large typographically + company/product logo as subject | NO photo, NO generated face. Looks more editorial than a scraped headshot. |
| A **launch / release** | Official product **screenshot** (linked + credited) OR generated concept illustration | Screenshot only from the official source. |
| Fallback / anything uncertain | **Headline card** | Default safe path. |

### Headline card (the backbone — always available)
Rendered programmatically: **HTML/CSS template → PNG via Puppeteer** (flexible) or `satori` (SVG→PNG, fast). Writer outputs the text fields; renderer fills the fixed template.
- `headline` (≤ 10 words, Writer's framing — NOT the source title verbatim)
- `kicker` (e.g. "NEW TOOL", "SHIPPED", "HOT TAKE")
- `subject_name` (optional — the person's name, styled large, when it's person-news)
- `source_name` (attribution, small)
- brand logo + fixed color/type system

### Generated illustration path (tools/themes only)
Generate via an image model **through the Requesty router** (same key, one integration). Subjects allowed: abstract concepts, product/UI motifs, objects, environments — **never a real person's likeness.** Host the result at a public URL (Hostinger VPS / GCloud bucket) so X and IG can pull it.

Keep the card template fixed so every card is on-brand automatically. Build one clean template; don't over-design.

---

## 5. Agent role prompts (starting drafts — iterate these)

Store each under `/prompts/<role>.md`. Inject shared `BRAND_VOICE` block into every call.

**Shared BRAND_VOICE block:**
```
You are part of an autonomous news brand covering AI tools for creators and developers.
Voice: sharp, useful, opinionated, zero hype. Short sentences. Always a point of view,
never a neutral recap. Talk to builders as a smart peer. Never paste text from sources —
summarize in your own words and always credit + link the original.
```

**SCOUT** — input: raw feed items. Output: JSON ranked list.
```
Rank these stories for a brand about AI tools for creators/devs.
Score each 0-100 on: relevance to creators/devs, freshness, signal (real news vs noise).
Return JSON: [{title, url, source, score, one_line_why}]. Pick nothing off-niche.
Output JSON only, no prose.
```

**EDITOR** — input: top candidates + current `strategy.json`. Output: decision.
```
You are the editor and the KILL gate. Choose AT MOST ONE story worth posting now.
If nothing clears the bar, return {"decision":"kill","reason":...}. Quality over volume.
For the chosen story decide: the angle (the take/why-it-matters for builders),
the format (thread | single | carousel), and the hook style — and prefer the hook style
marked best in the strategy input. Return JSON: {decision, story, angle, format, hook_style, reason}.
```

**WRITER** — input: editor decision + story. Output: posts + visual choice.
```
Write platform-native content in brand voice from the angle given, and choose ONE visual path.
Visual rules (HARD):
- Story about a tool/company/product/theme -> visual:"illustration" with an image_prompt
  describing an ABSTRACT/product concept with NO people.
- Story about a named person -> visual:"card" with subject_name set. NO photo, NO generated face.
- Launch/release -> visual:"screenshot" (official source) OR "illustration".
- Uncertain -> visual:"card".
NEVER request a real person's likeness in image_prompt.
Return JSON:
{
  "x_post": "...",            // <=280 chars, hook-first, link at end
  "ig_caption": "...",        // longer, line breaks, ends with CTA + link-in-bio note
  "visual": "card" | "illustration" | "screenshot",
  "image_prompt": "...",      // only if illustration; abstract/product, no people
  "card": {"kicker":"...", "headline":"<=10 words", "subject_name":"" , "source_name":"..."}
}
Never copy phrasing from the source. Your own words only.
```

**FACTCHECK** — input: writer output + source. Output: pass/fix. **Also the visual safety gate.**
```
Verify: (1) claims match the source, (2) the original source is credited + linked,
(3) NO sentence is copied or near-copied from the source (paraphrase only),
(4) no fabricated quotes or stats.
VISUAL SAFETY GATE (hard): if visual=="illustration", reject any image_prompt that depicts,
names, or implies a real person's likeness -> force fallback to visual:"card" with subject_name.
Never allow a real photo of a named person. Never allow a generated realistic real person.
Return {"status":"pass"|"fixed", "content":{...}, "issues":[...]}.
```

---

## 6. Data models

```
Story        { id, title, url, source, fetched_at, score, status }
Post         { id, story_id, platform, body, visual_type, image_url, card_url, hook_style,
               format, posted_at, x_post_id, metrics:{likes,reposts,impressions} }
Strategy     { best_hook_style, best_format, notes, updated_at }   // the learned state
RunLog       { id, trigger:"scheduled"|"breaking", role_outputs:{...}, ts }
```

`strategy.json` is the memory the learning loop writes and the Editor reads. This file closing the loop is the whole differentiator — treat it as sacred.

---

## 7. Real-time trigger (the "90 seconds after it broke" beat)

Watcher runs every N minutes. For each new item compute a **breaking score** = recency × source authority × velocity (how many sources carry it). If max breaking score > threshold, trigger the loop immediately instead of waiting for the next scheduled batch. Log `trigger:"breaking"` so the demo can show it fired on its own.

**Demo safety:** pre-cache a known "breaking" story and a way to inject it, so the live demo doesn't depend on real news timing during judging.

---

## 8. The learning loop (close it ONCE, convincingly)

> On X **Free tier, reads are effectively unavailable** — you cannot reliably pull engagement back. The loop is driven through a **metrics adapter** (Section 8a) so this beat is real and reliable regardless of tier.

1. After posting, store `hook_style` + `format` with the post.
2. Pull engagement via the **metrics adapter** (live on paid tier; seed adapter on free tier).
3. Compare performance across hook styles seen so far.
4. Write the winner to `strategy.json` (`best_hook_style`, `best_format`).
5. Editor reads `strategy.json` next cycle → demonstrably different decision.

Even two data points is enough to show the loop closing on stage. Don't over-engineer ML — the point is *the agent changed its own behavior based on its own results.*

**Honesty framing for judges:** the loop, the strategy memory, and the behavior change are all real. Only the *metrics input* is adapter-swapped because of a free-tier read limit — a legitimate engineering tradeoff. Say so plainly if asked; don't claim live reads you don't have.

---

## 8a. X Free-tier constraints — build these in from line one

Free tier ≈ **17 posts/day, ~500/month, and almost no read access.** Two consequences baked into the architecture:

**DRY_RUN mode (default ON).** Every real post burns scarce budget, so you cannot iterate by posting. The loop must run fully — Scout→Editor→Writer→Visual→Factcheck, render the card/illustration — and when `DRY_RUN` is ON, log/save the exact payload that *would* be sent **without calling the X API.** Flip `DRY_RUN=OFF` only for milestones and the live demo.

**Metrics adapter (one interface, two impls).** Because reads are gated, abstract metrics behind an interface:
```
interface MetricsSource { getMetrics(postId): {likes, reposts, impressions} }
  - LiveMetrics  -> X API (use on paid tier / whatever free tier returns on your own posts)
  - SeedMetrics  -> reads from a local seed file you can set; used for the learning-loop demo
```
The learner depends on `MetricsSource`, not on X directly. For the "it got smarter" beat, feed two posts' engagement into `SeedMetrics`; the learner reads it, `strategy.json` changes, the Editor decides differently. Swapping to `LiveMetrics` on a paid tier requires no other code change.

**Budget discipline:** track posts used today; refuse to post (even with DRY_RUN off) past a safe daily cap so you don't exhaust the month before the demo.

---

## 9. Mock vs real boundaries

**Real:** the agent loop, X publishing (with DRY_RUN), the headline card render, the visual decision tree + Factcheck gate, the real-time trigger, the learning loop + strategy memory + behavior change.
**Adapter-swapped (free tier):** engagement metrics — `SeedMetrics` for the demo, `LiveMetrics` on a paid tier. The loop itself is real.
**Mock/defer:** generated illustration path (card-only is fine for v1 — add illustration once the spine works), Instagram, video, newsletter (openmail), multi-data-point ML, fancy dashboard.

---

## 10. Build sequence (32h, solo)

| Hours | Goal |
|---|---|
| 0–3 | Spec → repo scaffold. Requesty key wired. RSS ingestion working. X auth + **test tweet (text+image) with DRY_RUN built in from line one**. Kick off Hostinger DNS in background. |
| 3–11 | Orchestrator loop (in DRY_RUN): ONE story flows Scout→Editor→Writer→Visual(card)→Factcheck→would-post. Card-only is fine here. Flip DRY_RUN off ONCE to confirm a real post. This is the spine — don't move on until it works end-to-end. |
| 11–16 | Real-time watcher + breaking score → auto-trigger. Add inject-a-story demo hook. Then add the illustration path (gen via router, no people) + the Factcheck visual gate. |
| 16–22 | Learning loop via the **metrics adapter** (LiveMetrics + SeedMetrics): store hook_style/format, read engagement, write strategy.json, Editor reads it. Close it once. |
| 22–27 | Minimal UI: show the role hand-offs (the "newsroom") + live feed of published posts + the strategy change. condense.chat wired here if time. |
| 27–30 | Stretch: Instagram posting AND/OR openmail newsletter — whichever is closer. Cut without mercy if shaky. |
| 30–32 | Rehearse the 3 demo beats. Buffer for breakage (posting APIs always break). |

---

## 11. The three demo beats (script these)

1. **The newsroom works** — trigger a run; show Scout→Editor→Writer→Factcheck hand-offs and the finished post + card going live on X.
2. **The newsjack** — inject a "breaking" story; the watcher fires the loop on its own within minutes.
3. **It got smarter** — show `strategy.json` changed from real engagement, and the Editor making a different call because of it.

---

## 12. Hard rules for Claude Code

- Build and verify the spine (Section 10, hours 3–11) end-to-end before adding reactivity or learning.
- Role prompts live in `/prompts/*.md`, version-controlled, not inline.
- Write tests for the orchestrator loop so refactors are safe solo.
- Never let any agent paste source text — paraphrase + link only. The Factcheck role enforces this.
- NEVER use real photos of named people, and NEVER generate realistic images of real people. Person-news routes to a name-forward card. Factcheck is the hard gate; if unsure, fall back to a card.
- Image generation is for abstract/product/theme illustrations only (tools, not people).
- Critical path runs on Requesty (not AI Studio) so nothing dies at Sunday EOD.
- One platform fully working beats two half-wired. X first, always.
- We are on X **Free tier**: DRY_RUN defaults ON; real posts only for milestones/demo; enforce a daily post cap; engagement comes through the metrics adapter, never assume live reads.