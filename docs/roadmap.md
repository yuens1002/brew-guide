# Roadmap

Tracks planned work by phase. Completed items move to `CHANGELOG.md`.

---

## Phase 2 — Recommendation Engine ✅ Done

Replace static stub responses with real recommendations backed by logged brew data.

- [x] `compare_brew` tool — delta analysis between logged brew and method baseline
- [x] `recommend` tool — wired as deterministic community consensus (`computeBestBrew`): weighted scoring by origin/roast/method similarity, recency decay, source trust; confidence: high/medium/low based on match count and quality
- [x] Structured confidence scoring with `sources` attribution and `data_points_used`

**Owner**: `/backend-architect`
**Note**: Implemented as deterministic consensus over logged brews (no LLM/OpenRouter dependency). LLM-powered narrative recommendations remain a future option — see Phase 6.

---

## Phase 3 — Grounded Retrieval ✅ Done (partial)

Make the knowledge base queryable from logged brew history.

- [x] `search_brews` MCP tool — filter brew log by origin, method, limit
- [x] `get_brew` / `GET /brews/:id` — fetch a single brew by ID
- [x] Scraping pipeline — roaster guides shipped via `scripts/scrape-roasters.ts` (32 brews from 12 roasters)
- [ ] Semantic similarity on brew notes — keyword search before committing to embeddings; deferred to Phase 8

**Owner**: `/backend-architect`

---

## Phase 4 — Persistent Storage ✅ Done

Move off sql.js (in-process WASM) to a hosted database.

- [x] Migrate to Neon Postgres + Prisma ORM (chose Neon over Turso/Supabase — direct connection URL for Railway)
- [x] Schema migration tooling — Prisma Migrate (`prisma/migrations/`)
- [x] Update `src/lib/db.ts` with new client; function signatures kept identical so tests are unchanged

**Owner**: `/backend-architect`, `/devops`

---

## Phase 5 — Public Deployment ✅ Done

Ship a stable, publicly reachable MCP endpoint.

- [x] Deploy to Railway — auto-deploys from `main` on `yuens1002/brew-guide`
- [x] Set production URL in CLAUDE.md (`https://brew-guide-production.up.railway.app`)
- [x] Rate limiting — 60 req/min REST, 20 req/min MCP (`hono-rate-limiter`)
- [x] Claude Desktop + MCP client connection docs in README
- [x] Landing page (`landing/index.html`) wired to live API
- [ ] Submit to MCP Registry (registry.modelcontextprotocol.io) — deferred, low priority

**Owner**: `/devops`

---

## Phase 6 — Technique Intelligence 🔲 Next

Surface method-specific brew technique from community data — aggregated into consensus guidance and synthesized into narrative at query time.

### Motivation

The current engine outputs aggregate parameters (temp, ratio, grind, time). These are necessary but not sufficient. Experienced brewers think in sequences: bloom weight, bloom duration, pour stages, agitation, drawdown targets. This knowledge exists densely in roaster brew cards and community posts — unstructured and method-specific. Capturing and surfacing it is what differentiates this server from a generic recipe lookup.

### Technique is method-scoped

Each brewing method has its own technique vocabulary:

| Method | Key technique dimensions |
|--------|-------------------------|
| Pour Over | bloom weight/duration, pour stages (timing + volume), agitation, drawdown target |
| French Press | steep time, plunge speed, pre-wet |
| AeroPress | inverted vs standard, steep time, pressure, paper vs metal filter |
| Espresso | preinfusion time/pressure, yield ratio, pressure profiling, shot time |
| Cold Brew | steep time, temperature, coarse grind variance, dilution ratio |
| Moka Pot | heat level, preheat water |
| Chemex | filter rinse, bloom, pour cadence |
| Siphon | heat source, stir pattern, drawdown time |

### Iteration 5 — Technique foundations

**Goal:** Per-brew technique data in the DB. LLM provider wired in.

- [ ] `technique` JSONB column on `brews` — stores per-brew technique conforming to the method's schema
- [ ] Prisma migration + type updates in `src/types.ts`
- [ ] LLM provider setup — Anthropic SDK via `ANTHROPIC_API_KEY` env var (Railway secret); wrapper in `src/lib/llm.ts`
- [ ] LLM extraction at ingest — when `POST /brews` or `log_brew` includes technique-rich `notes`, extract and normalise technique fields into the schema; fire-and-forget background job, non-blocking to the response
- [ ] Backfill extraction job — one-shot script to extract technique from existing scraped brews that have notes

**Owner**: `/backend-architect`, `/devops` (LLM env setup)
**Branch**: `feat/iteration-5-technique-foundations`

---

### Iteration 6 — Technique consensus + narrative synthesis

**Goal:** `recommend` returns community-consensus technique steps and an optional LLM-generated narrative.

- [ ] Technique consensus in `computeBestBrew` — aggregate technique patterns across top-scoring matched brews: weighted mode for categorical fields (`agitation`), weighted average for numeric fields (`bloom_duration_s`, `pour_stages`)
- [ ] `technique` object in `POST /recommend` response — consensus technique or method-default fallback
- [ ] Narrative synthesis — opt-in (`"include_narrative": true` in request body), gated on `medium`/`high` confidence; passes consensus params + technique through LLM; non-blocking to callers that don't request it
- [ ] MCP `recommend` tool updated to support `include_narrative` parameter
- [ ] Landing page renders narrative when present (replaces static technique steps)
- [ ] API-SPEC.md + architecture/overview.md updated

**Owner**: `/backend-architect`, `/frontend-dev`
**Branch**: `feat/iteration-6-technique-consensus-narrative`
**Depends on**: Iteration 5 (technique on brews, LLM wired)

---

## Phase 7 — Feedback Loop Activation 🔲 Post-Phase 6

Consume `brew_recommendation_links` to make the engine self-improving.

### What's already captured

`brew_recommendation_links` is populated on every `POST /brews` — but never consumed. The data to improve recommendations is sitting there.

### Deliverables (Iteration 7)

- [ ] Analytics query: did brews following a recommendation rate higher than deviations?
- [ ] Adjust `sourceTrust` coefficients in `computeBestBrew` based on outcome data
- [ ] `match_confidence` on link rows — currently a placeholder `0.85`; compute from actual param delta between recommendation and logged brew
- [ ] Surface accuracy signal on landing page ("X% of brews following this recommendation rated 4+ stars")

**Owner**: `/backend-architect`
**Branch**: `feat/iteration-7-feedback-loop`
**Depends on**: Sufficient link data (grows naturally with usage)

---

## Phase 8 — Community Data Growth 🔲 Post-Phase 7

More data = higher-confidence recommendations. Most queries currently return `medium` or `low` with 32 seeded brews.

### Deliverables (Iteration 8)

- [ ] Expand scraper — more roasters, community forums (home-barista.com, r/coffee)
- [ ] Semantic similarity on brew notes — keyword search first, embeddings if justified by volume
- [ ] Landing page contribution loop — improve brew logging UX to drive community submissions
- [ ] Submit to MCP Registry (registry.modelcontextprotocol.io)

**Owner**: `/backend-architect`, `/devops`, `/frontend-dev`
**Branch**: `feat/iteration-8-data-growth`

---

## Icebox

- Community brew leaderboard (highest-rated brews by method)
- Weekly coffee literature digest
- User accounts / personal brew history

---

## Open question before Iteration 5

LLM provider for extraction + narrative synthesis: **Anthropic direct** (simpler auth, same model family) vs **OpenRouter** (broader model access, single API key for multiple providers). Decision affects `devops` secrets setup and `src/lib/llm.ts` implementation.
