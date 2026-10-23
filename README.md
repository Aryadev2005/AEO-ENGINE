# AEO Engine

Measures and improves how often a business is **recommended by AI assistants**
(ChatGPT, Gemini, Perplexity, Claude) and how healthy its Google reviews are,
then generates the fixes. See the full build spec for product scope and
milestones; this README covers setup and what's implemented so far.

## Status

- ✅ **M1 — Engine core (CLI first):** provider adapters, extraction, source
  classification, scoring, cost logging, CLI, unit tests.
- ✅ **M2 — DB + worker:** Drizzle/Postgres schema + migrations, seed data,
  DB-backed job queue, worker loop (+ weekly/daily cron scheduling), 24h
  result cache, budget enforcement, minimal scan API routes.
- ✅ **M3 — Free checker + landing + pricing:** `/`, `/check`, `/pricing`,
  leads capture, per-IP/global rate limiting, 7-day checker cache, rule-based
  recommendation engine.
- ✅ **M4 — Dashboard:** Auth.js (Google OAuth + a local-only dev sign-in),
  multi-tenant workspaces, 5-step onboarding wizard, brand dashboard with
  trend chart, prompt × engine matrix with highlighted answer viewer,
  settings/usage.
- ✅ **M5 — Fixes + reviews + report:** rule-based recommendations now
  generate real content and persist automatically after every scan; a Fixes
  page to action them; a Google Places reviews module (review-request
  templates + AI-drafted replies, never AI-written reviews); a printable
  report page.

All five milestones from the build spec are implemented, and the app is
deployed against real Postgres (Supabase) — see **Deploying** below for the
full Vercel + Supabase setup.

## Setup (6 commands)

The DB is Postgres from day one (Supabase, Neon, or any Postgres host) — no
local SQLite file, no Docker. Create a free [Supabase](https://supabase.com)
project (or use an existing one) before you start.

```bash
npm install
cp .env.example .env.local      # fill in DATABASE_URL + whichever API keys you have (or none, for mock mode)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # paste into AUTH_SECRET
npm run db:generate              # generates SQL migrations from src/db/schema.ts
npm run db:migrate               # applies them to DATABASE_URL
npm run db:seed                  # demo workspace: brand "Velectico" + 2 scans a week apart
npm run dev                      # Next.js app + API routes
```

Open [localhost:3000/login](http://localhost:3000/login) and use "Dev sign-in" with `demo@aeo-engine.local` (the email the seed script used) to land in the seeded workspace — no Google OAuth app required for local dev.

For `DATABASE_URL` locally, use Supabase's **direct connection** (port 5432,
`db.<project-ref>.supabase.co`) — the pooler is only needed for serverless
(see Deploying). `npm run test` also needs `DATABASE_URL` set (see Database
+ job queue below for what it touches).

Scans only run when something processes the `jobs` table. Locally, run the
standalone worker in a second terminal:

```bash
npm run worker
```

In production there's no worker process — `/api/cron/run-due` does the same
job on a schedule (see Deploying).

## Database + job queue (M2)

- **Schema**: `src/db/schema.ts` (Drizzle, Postgres). `npm run db:generate` regenerates migrations from the schema; `npm run db:migrate` applies them. The schema mirrors spec §4 exactly (users/workspaces/memberships/brands/competitors/prompts/scans/scan_results/citations/scores/recommendations/review_snapshots/leads/checker_results/llm_calls/jobs).
- **Job queue**: `jobs` table, `src/db/jobs.ts`. `claimNextJob()` atomically claims the oldest due job (`UPDATE ... WHERE status='queued'` guard, so two processors can never double-process one job); failures retry with exponential backoff up to 3 attempts, then move to `failed`. `src/db/job-runner.ts` dispatches a claimed job to its handler (`scan` → `processScanJob`, `generate_recs` → `processGenerateRecsJob`) — shared by both the standalone worker and the serverless cron route below.
- **Two ways to process the queue** (same underlying logic, `src/db/scheduler.ts` + `job-runner.ts`):
  - **Standalone worker** (`npm run worker`, `src/worker/index.ts`): polls every 3s, continuously, plus an hourly `node-cron` tick for scheduled brand scans. Needs an always-on process somewhere (not Vercel).
  - **Serverless cron** (`GET /api/cron/run-due`): on each invocation, enqueues any due weekly/daily scans, then claims and runs jobs for up to ~50s (leaving headroom under the function timeout) before returning. `vercel.json` hits this every 5 minutes via Vercel Cron; protect it with `CRON_SECRET` in production (Vercel sends it automatically as `Authorization: Bearer $CRON_SECRET`). Check your Vercel plan's cron frequency limits — Hobby is more restrictive than Pro — and fall back to an external scheduler (e.g. [cron-job.org](https://cron-job.org), a GitHub Actions scheduled workflow) hitting the same URL with that header if you need tighter intervals than your plan allows.
- **24h result cache**: `src/db/cache.ts` backs the engine's `ScanCacheAdapter` with the `scan_results` table itself — an identical (prompt, engine) pair for the same brand within 24h is reused instead of calling the provider again, at zero extra cost.
- **Budget enforcement**: `src/db/budget.ts` sums this month's `llm_calls.cost_usd` per workspace and caps each scan's estimate against `workspace.monthly_budget_usd` before any calls are made.
- **Minimal API**:
  - `POST /api/brands/:id/scans` — enqueues a scan, returns `{ scanId, estimatedCostUsd }`.
  - `GET /api/scans/:id` — returns scan status + scores once done.
- **Batched writes/reads**: every scan persists its results, citations, LLM-call log, and scores as one `INSERT ... VALUES (...), (...), ...` per table, not one round-trip per row — same for the reads that power the dashboard and the recommendation generator. This matters a lot more once the DB is a network hop away (Supabase) than it did against a local file; a naive per-row loop here was the actual bottleneck when this went from SQLite to Postgres.

## Free checker, landing, pricing (M3)

- **`/check`** (and a compact version embedded in the `/` hero): business name,
  category, city, website → generates 3 buyer-style prompts (cheap LLM call,
  template fallback with zero keys), runs them on 2 engines (Gemini + one
  other configured engine, mock if none configured — satisfying "6 answers"
  either way), and shows a mini report (score, mention count, top
  competitors, one blurred sample answer). Unlocking with an email or
  WhatsApp number (`src/lib/checker.ts` → `POST /api/checker/:id/unlock`)
  saves a `leads` row and reveals every answer (brand highlighted green,
  competitors amber via `src/components/answer-text.tsx`) plus the top 3
  fixes from `src/engine/recommend.ts`.
- **Guardrails** (`src/lib/rate-limit.ts`): 3 checks/IP/day, 50/day globally,
  and a `CHECKER_DAILY_USD_CAP` spend cap — all in-memory, which is a real
  limitation on Vercel: each serverless invocation can get a cold instance,
  so these counters don't reliably share state across requests in production
  the way they do against one long-lived local dev server. Swap for a
  DB/Redis-backed counter before relying on this for abuse prevention at
  scale. Turnstile (`src/lib/turnstile.ts`, `TURNSTILE_SITE_KEY`/`_SECRET_KEY`)
  verifies the checker form server-side and is a stub (always passes) with no
  key configured. Results are cached 7 days by a hash of (name, category,
  city, country), so a repeat check costs nothing.
- **`/pricing`**: India (₹)/Global ($) toggle, each plan opens a "book a
  call"/"join waitlist" dialog that posts to `POST /api/leads` — no payments
  wired up yet, as per spec.
- **`/admin`**: leads table + CSV export (`GET /api/admin/leads/export`),
  checker runs/unlocks, total LLM spend across all workspaces. Gated by
  `ADMIN_EMAILS` (comma-separated) against the signed-in user's email —
  returns a 404 for anyone else, not a visible "forbidden" page.
- **Recommendation rules** (`src/engine/recommend.ts`): all 8 rules from spec
  §5.5 (get_listed, faq_page, comparison_page, schema, llms_txt, community,
  reviews, reputation) operating on a completed scan's results; schema/llms_txt
  need a live homepage fetch to evaluate and are skipped until M5 wires that
  up. Content generation (the actual JSON-LD/FAQ draft/etc.) also arrives in M5
  — this milestone only needed title + why + priority for the checker teaser.

### A real bug worth knowing about: Next 16's "Cache Components"

The scaffolded `next.config.ts` had `cacheComponents: true` by default. In
dev, this silently served stale data from several API routes — e.g.
`GET /api/scans/:id` kept returning `"queued"` long after the worker (a
separate process) had marked the scan `"done"` in the database, and a couple
of `POST` routes appeared to succeed (200 + a real id back) without the row
ever landing in the DB. It's disabled in `next.config.ts` now, since nothing
in this app benefits from prerendering and the experimental caching fights
live DB state at every turn. If `cacheComponents` ever gets re-enabled,
every route doing a fresh DB read/write needs `export const dynamic =
"force-dynamic"` (already set on all current API routes) or an explicit
`await connection()`. Keep route handlers thin — do the actual `db.insert`/
`db.update` inside a `src/lib/*.ts` or `src/db/*.ts` function, not directly
in `route.ts` — both as good separation of concerns and because that's
exactly the boundary where this class of bug showed up.

## Dashboard (M4)

- **Auth** (`src/lib/auth.ts` / `auth.config.ts`): Google OAuth when
  `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set, plus a **local-only "Dev
  sign-in"** credentials provider (`/login`) that creates/reuses a user +
  workspace for any email typed in — no password, refuses to run once
  `NODE_ENV=production`. JWT sessions throughout; first sign-in auto-creates
  a workspace with that user as `owner`. Email magic link is **not** wired up
  — it needs a DB session adapter (accounts/sessions/verification_token
  tables) that this schema doesn't have yet; `EMAIL_SERVER`/`EMAIL_FROM` are
  reserved for when that lands.
  - **Edge/Node split**: `auth.config.ts` has zero DB imports and is what
    `src/proxy.ts` (Next 16's renamed `middleware.ts`, Edge Runtime) uses for
    route gating. `auth.ts` adds the DB-backed `jwt`/`session` callbacks and
    is what route handlers and server components use. Don't import `auth.ts`
    from proxy.ts — the Edge Runtime can't open a raw TCP Postgres connection
    (the `postgres` driver needs Node).
- **Onboarding wizard** (`/app/brands/new`): 5 steps — basics (creates the
  brand immediately), competitors (manual add + LLM-suggested, template
  fallback is just an empty list without a key), prompts (LLM-generated
  across all 5 intents, template fallback otherwise), engines with a live
  cost estimate, run first scan (polls `/api/scans/:id` every 3s).
- **Brand dashboard** (`/app/brands/[id]`): headline score + Recharts trend
  line, per-engine visibility/position/share-of-voice cards, competitor
  leaderboard, top cited sources with a "you're there" column, suggested
  competitors pulled from the latest scan's extraction, schedule picker +
  "run scan now" (also polls to completion).
- **Prompt × engine matrix** (`/app/brands/[id]/prompts`): ✅/❌/⚠ per cell;
  click one to open the full answer with the brand highlighted green and
  competitors amber (`src/components/answer-text.tsx`, shared with the
  checker's full report).
- **Settings** (`/app/settings`): workspace name/budget (owner-only), team
  list, this-month API usage by purpose/engine.
- Every brand/competitor/prompt mutation route now checks the caller's
  session and that the resource belongs to their workspace (the M2 routes'
  "auth arrives in M4" TODO is done).

## Fixes, reviews, report (M5)

- **Recommendations now generate automatically**: every completed scan
  enqueues a `generate_recs` job (`src/db/recommend-service.ts`), which reruns
  the M3 rule engine against that scan's results and, for any rule that
  doesn't already have an **open** recommendation of the same type for this
  brand, generates real content via the cheap model (`src/engine/generate-content.ts`
  — markdown for most types, ready-to-paste JSON-LD for `schema`) and persists
  it. Re-scanning doesn't spam duplicates; dismissed/done ones can reopen.
- **Fixes page** (`/app/brands/[id]/fixes`): filter by open/done/dismissed,
  expand to view/copy the generated content, mark done, dismiss, or
  regenerate (re-runs content generation with the same title/why).
- **Reviews** (`/app/brands/[id]/reviews`, `src/lib/places.ts` + `reviews.ts`):
  Google Places API (New) search → connect → fetch rating/review
  count/recent reviews into `review_snapshots`. Request templates
  (WhatsApp/SMS/email) are static, interpolating the real
  `search.google.com/local/writereview?placeid=...` link — reply drafts to
  existing reviews use the cheap model. **Never** generates or suggests
  posting a review; hides the whole module behind a "Connect Google Places"
  note when `GOOGLE_PLACES_API_KEY` isn't set.
- **Printable report** (`/app/brands/[id]/report`): score, per-engine
  breakdown, competitor leaderboard, top open fixes, workspace name at the
  top. `print:hidden` on the dashboard chrome and brand sub-nav so printing
  (or "Save as PDF") only captures the report itself.
- A small brand sub-nav (Dashboard / Prompts / Fixes / Reviews / Report) now
  wraps every `/app/brands/[id]/*` page (`src/app/app/brands/[id]/layout.tsx`).

## Running the engine from the CLI

```bash
npm run scan:cli -- \
  --brand "Velectico" \
  --city Kolkata \
  --country India \
  --website "https://velectico.com" \
  --prompts data/prompts.sample.txt \
  --engines chatgpt,gemini,perplexity \
  --competitors "TCS|tcs.com,Northwind Solutions|northwind.example.com" \
  --budget 1.00
```

- `--prompts` points at a text file, one prompt per line (`#` comments ignored). See `data/prompts.sample.txt`.
- `--engines` defaults to all four real engines; any engine without a configured key is skipped and reported, not failed.
- `--competitors` is `Name|website.com` pairs, comma-separated; website is optional.
- `--budget` caps estimated spend before any calls are made (throws if the estimate exceeds it).

With zero API keys set, every engine automatically falls back to the deterministic **mock** provider, so the whole pipeline — extraction, source classification, scoring — works and looks the same with no cost and no network calls. Set `LLM_MOCK_MODE=true` to force mock mode even with real keys configured (useful for demos).

## Getting each API key (all optional, all cheap)

| Engine label | Provider | Where to get a key | Notes |
|---|---|---|---|
| ChatGPT / Claude | OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) | One key covers both — set `OPENROUTER_API_KEY`. Pay-as-you-go, no subscription. |
| Gemini | Google AI Studio | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Free tier available. Set `GEMINI_API_KEY`. |
| Perplexity | Perplexity API | [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api) | Set `PERPLEXITY_API_KEY`. Pay-as-you-go. |

Model ids and per-token prices live in [`src/engine/config.ts`](src/engine/config.ts), overridable via `MODEL_CHATGPT` / `MODEL_CLAUDE` / `MODEL_GEMINI` / `MODEL_PERPLEXITY` / `MODEL_UTILITY` env vars — no code changes needed to swap models.

**Provider APIs move fast** — the defaults here were verified against each provider's docs as of October 2026:
- OpenRouter: standard `/chat/completions`, web search via the `web` plugin (billed per 1,000 results fetched, not per token).
- Gemini: the **Interactions API** (`v1beta/interactions`), which replaced the older `generateContent` grounding tool during 2026. **Verified against the live API** (not just docs) once a real key was available — three things the docs got wrong or didn't cover, all now fixed in `src/engine/providers/gemini.ts`:
  - There's no `instructions` field for a system prompt — the request is rejected with `400 invalid_request, "Unknown parameter 'instructions'"`. The system prompt is folded into `input` instead.
  - The usage object's real field names are `total_input_tokens`/`total_output_tokens`/`total_thought_tokens`, not `input_tokens`/`output_tokens` — thinking-enabled models bill thought tokens as output, so both are summed for cost.
  - **Citation URLs are Google's own redirect host** (`vertexaisearch.cloud.google.com/grounding-api-redirect/...`), not the source — useless for domain classification on its own. The actual source's bare domain reliably comes back in the citation's `title` field instead; `src/engine/extract.ts`'s `resolveDomain()` prefers `title` whenever it parses as a bare domain, which only ever matches this case (other providers' titles are human-readable article titles with spaces).
  - Default model is `gemini-3.1-flash-lite` (not the full `gemini-3.8-flash`) — confirmed to support the same Interactions API + Google Search grounding, at roughly 1/3 the input cost and 2/5 the output cost ($0.25/$1.50 per M vs $0.75/$3.75, per [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)).
- Perplexity: Sonar's Chat Completions endpoint is in legacy winddown (support "ended" Sept 2026 but synchronous/streaming calls keep working); the newer Agent API is the forward path if Perplexity cuts Sonar Chat Completions off entirely. If calls start failing, check [docs.perplexity.ai](https://docs.perplexity.ai) for the current recommended endpoint. Not yet verified against a live key — only Gemini has been.

If any of these have changed again, update the adapter in `src/engine/providers/` — the `Provider` interface is the only contract the rest of the engine depends on.

## Keeping spend minimal

This deployment runs with **only `GEMINI_API_KEY` configured** — every other
engine (chatgpt/claude/perplexity) is automatically skipped at zero cost,
real scans just run narrower (Gemini-only) rather than failing. Concretely:
- Google Search grounding includes 5,000 free queries/month across Gemini 3+
  models; `gemini-3.1-flash-lite` token pricing is the cheapest Flash tier.
  Our cost accounting doesn't track the free-tier allowance and always prices
  grounding as paid — safely conservative for budget enforcement, not a
  precise bill forecast.
- A single grounded call can issue multiple search queries in one
  interaction (observed up to 4 for a specific prompt) — `estimateCallCostUsd`
  assumes 3 per Gemini call so the pre-scan estimate doesn't undercount.
- Every workspace gets a hard `monthly_budget_usd` cap (free tier: $1/month)
  enforced *before* a scan's calls go out (`assertWithinBudget` — the whole
  scan is refused, not partially run, if the estimate would exceed what's
  left). The public checker has its own separate `CHECKER_DAILY_USD_CAP`
  (set to $1 in `.env.local` here, down from the $2 code default) plus a
  per-IP daily limit.
- The ultimate kill switch: `LLM_MOCK_MODE=true` forces every engine to the
  free deterministic mock provider regardless of what keys are configured —
  useful for demoing the full product with zero spend.
- Utility-model calls (sentiment extraction, checker/onboarding prompt
  generation, recommendation content) go through OpenRouter specifically
  (`callUtilityModel`), not whichever scan engines happen to be configured.
  With no `OPENROUTER_API_KEY` set, those calls fail fast and fall back to
  deterministic templates — free, by design, not a bug to fix. Adding an
  OpenRouter key would unlock the "smart" versions of those features at the
  cost of more LLM calls.

## Cost per scan (rough estimate)

With defaults (4 engines, web search on) a single prompt costs roughly:

| Engine | ~cost/call |
|---|---|
| ChatGPT (gpt-4o-mini via OpenRouter) | ~$0.0002 tokens + $0.02 web search |
| Claude (Haiku via OpenRouter) | ~$0.003 tokens + $0.02 web search |
| Gemini (Flash + grounding) | ~$0.0002 tokens + $0.014 per search query |
| Perplexity (Sonar) | ~$0.0007 tokens + $0.005 request fee |

So a 10-prompt scan across all 4 engines costs roughly **$0.50–$0.70** — comfortably inside the default free-plan monthly budget of $1. The CLI prints both the estimated cost (before calling) and actual cost (after) on every run; `npm run scan:cli` exits with an error instead of spending anything if `--budget` would be exceeded.

## Project structure

```
src/
  engine/
    providers/   mock.ts openrouter.ts gemini.ts perplexity.ts http.ts index.ts types.ts
    config.ts    model ids, pricing, scoring weights, budgets — the knobs to turn
    extract.ts   Pass A (deterministic) + Pass B (cheap LLM, JSON-validated) extraction
    classify-source.ts   domain -> source_type lookup
    score.ts     visibility / position / share-of-voice / citation-share / overall score
    cost.ts      LLM call ledger + budget enforcement
    runner.ts    orchestrates a scan: concurrency, retries, extraction, scoring, caching hook
    prompts.ts   prompt file parsing + intent inference
    recommend.ts rule-based recommendation drafts (spec §5.5)
    generate-content.ts   LLM content per recommendation type (markdown/json-ld/text)
    llm-utility.ts  shared cheap-model caller (extraction + checker prompt generation + content gen)
  lib/
    auth.ts, auth.config.ts   Auth.js setup (see Dashboard section for the edge/node split)
    session.ts   requireSessionOrResponse() — 401 helper for route handlers
    brands.ts    brand/competitor/prompt CRUD + LLM suggest/generate + score/result reads
    recommendations.ts   list/update-status/regenerate for the Fixes page
    places.ts, reviews.ts   Google Places (New) search/details + review-request templates + reply drafts
    workspace.ts workspace settings, team list, usage summary
    checker.ts   free checker orchestration: prompts, 2-engine scan, cache, mini/full report
    leads.ts     saveLead() — the only place that writes to the leads table
    rate-limit.ts   per-IP/global daily checker limits + daily spend cap (in-memory)
    admin.ts     admin-only reads (leads, spend, checker usage) + CSV export
    turnstile.ts stub-when-unconfigured Cloudflare Turnstile verification
    load-env.ts  loads .env then .env.local for scripts/tools outside the Next.js runtime
  components/
    answer-text.tsx       brand/competitor highlighting (shared by checker + dashboard)
    checker/checker-widget.tsx   the full check → unlock → full-report flow
    dashboard/   brand-controls, score-trend-chart, prompt-matrix
    marketing/site-header.tsx, site-footer.tsx
    ui/          shadcn/ui primitives
  proxy.ts       route gating for /app/** (Next 16's renamed middleware.ts)
  db/
    schema.ts    full Drizzle Postgres schema (spec §4)
    client.ts    postgres-js connection + drizzle instance (prepare:false for pooler compatibility)
    jobs.ts      job queue: enqueue / atomic claim / complete / fail-with-backoff
    job-runner.ts     dispatchJob() — routes a claimed job to its handler
    scheduler.ts      enqueueDueScheduledScans() — shared by the worker's cron tick and /api/cron/run-due
    cache.ts     ScanCacheAdapter backed by scan_results (24h reuse)
    budget.ts    remaining monthly budget per workspace
    scan-service.ts   enqueueScan() + processScanJob() (scan job handler) + batched persistence
    recommend-service.ts   processGenerateRecsJob() — post-scan fix-list generator
    migrate.ts   applies src/db/migrations/*.sql to DATABASE_URL
    seed.ts      demo workspace/brand/competitors/prompts + 2 scans a week apart
  worker/
    index.ts     standalone alternative to /api/cron/run-due: continuous poll loop + hourly cron tick
  app/
    page.tsx, check/page.tsx, pricing/page.tsx, login/page.tsx   public pages
    app/         the authed dashboard (page.tsx, brands/new, brands/[id], brands/[id]/prompts, settings)
    api/
      auth/[...nextauth]/route.ts    Auth.js handlers
      brands/route.ts                GET list / POST create
      brands/[id]/route.ts           GET / PATCH / DELETE
      brands/[id]/competitors/route.ts, competitors/[id]/route.ts
      brands/[id]/competitors/suggest/route.ts
      brands/[id]/prompts/route.ts, prompts/[id]/route.ts
      brands/[id]/prompts/generate/route.ts
      brands/[id]/results/route.ts   GET ?scanId=
      brands/[id]/scores/route.ts    GET latest + history
      brands/[id]/scans/route.ts     POST — enqueue a scan
      scans/[id]/route.ts            GET — scan status + scores
      workspace/route.ts             PATCH — name/budget (owner only)
      checker/route.ts               POST — run (or reuse cached) free check
      checker/[id]/unlock/route.ts   POST — save lead, return full report
      leads/route.ts                 POST — pricing/waitlist capture
      recommendations/[id]/route.ts, recommendations/[id]/regenerate/route.ts
      cron/run-due/route.ts          GET — serverless job-queue processor (see Database + job queue)
      admin/leads/export/route.ts    GET — CSV export, ADMIN_EMAILS-gated
scripts/
  scan-cli.ts    terminal report (M1 deliverable; DB-free, always fresh calls)
tests/           vitest unit tests for extract/score/classify/mock-scan/jobs/recommend
```

Everything in `src/engine` is framework-agnostic — the CLI, the DB-backed worker (M2), and the dashboard (M4) all call into the same `runScan()`. The CLI never touches the DB (no caching, always live calls); the worker always does (DB-backed cache + budget).

## Deploying

**Stack**: Vercel (app + API routes + cron) + Supabase (Postgres). No separate
worker host needed — `/api/cron/run-due` replaces it.

1. **Database**: in your Supabase project, go to **Project Settings → Database
   → Connection string** and grab two URLs:
   - **Transaction pooler** (port 6543, `...pooler.supabase.com:6543`) — use
     this as `DATABASE_URL` in Vercel. Serverless functions open a fresh
     connection per invocation; the pooler is what keeps that from exhausting
     Postgres's connection limit. `src/db/client.ts` already passes
     `prepare: false`, which the pooler's transaction mode requires.
   - **Direct connection** (port 5432) — handy for local dev and for running
     `npm run db:migrate`/`db:seed` from your machine against prod before
     first deploy, since migrations work equally well through either.
2. **Run migrations against the real database** once, from your machine:
   `DATABASE_URL=<direct or pooler> npm run db:migrate && npm run db:seed`
   (seed is optional — skip it for a real production workspace).
3. **Deploy to Vercel**: import this repo, set the environment variables
   below, and deploy. `vercel.json` already declares the cron job.
4. **Set `CRON_SECRET`** to a random value in Vercel's env vars — Vercel
   automatically sends it as `Authorization: Bearer $CRON_SECRET` to your own
   cron jobs, and `/api/cron/run-due` checks it. Without it, the endpoint has
   no auth, which is fine for testing but not for a public URL long-term.
5. **Set `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`** (a real Google Cloud OAuth
   client) — the "Dev sign-in" credentials provider refuses to issue a
   session once `NODE_ENV=production`, so Google is the only way in without
   it. Add your Vercel domain's `/api/auth/callback/google` as an authorized
   redirect URI in the Google Cloud Console.
6. **Set `AUTH_SECRET`**, at least one LLM provider key (or the app runs in
   mock mode), and `NEXT_PUBLIC_APP_URL` to your real domain.

**Environment variables to set in Vercel** (beyond what local dev needs):
`DATABASE_URL` (pooler), `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
`CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `ADMIN_EMAILS` (to use `/admin`), plus
whichever of `OPENROUTER_API_KEY`/`GEMINI_API_KEY`/`PERPLEXITY_API_KEY`/
`GOOGLE_PLACES_API_KEY`/`TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` you have.

**Known gaps** (see inline TODOs for context):
- Email magic-link sign-in isn't wired up — needs a DB session adapter this
  schema doesn't have. Google OAuth + dev sign-in are the only providers.
- Rate limiting and checker daily-spend tracking are in-memory — not
  reliable across multiple serverless instances. Fine for a low-traffic
  launch; swap for a DB-backed counter before counting on it to stop abuse.
- `npm run worker` still works (and is handy for local dev — scans run
  immediately instead of waiting for the next cron tick) but isn't needed
  in production with the cron endpoint in place.
