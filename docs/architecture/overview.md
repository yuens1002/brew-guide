# Architecture Overview

## Purpose

A public MCP server that acts as an agentic coffee knowledge base — answering "how to brew the best coffee" from logged community brew data, and capturing structured brew experiments for grounded retrieval and recommendation improvement.

## Stack

| Layer | Technology |
|-------|-----------|
| HTTP framework | Hono 4 |
| MCP transport | `@hono/mcp` (Streamable HTTP) |
| MCP protocol | `@modelcontextprotocol/sdk` |
| Runtime | Node 24, TypeScript strict, ESM |
| Database | Neon Postgres + Prisma ORM |
| Test runner | Vitest |

## Module map

```
src/
  server.ts             → entrypoint: binds port, never imported by tests
  index.ts              → pure Hono app: mounts routes, safe to import anywhere
  routes/
    brewing.ts          → REST routes (/origins, /brewing-methods, /brews,
                          /recommend, /tasting-notes, /tasting-suggestions)
    mcp.ts              → MCP tool handlers + Streamable HTTP transport
    admin.ts            → protected admin MCP endpoint (/admin/mcp): bearer token auth, 15 CRUD tools
  lib/
    db.ts               → Prisma client wrapper: all DB access; mock this in tests
    recommend.ts        → recommendation engine: computeBestBrew, tryLinkBrew, resolveOrigin
    llm.ts              → OpenRouter/Haiku wrappers: extractTechnique, generateOriginBrewProfile
    origin-profile.ts   → getOrTriggerOriginProfile (fire-and-forget), generateAndUpsertProfile
    mcp-common.ts       → checkOrigin, corsHeaders
  types.ts              → all shared interfaces (Brew, Recommendation, OriginBrewProfile, etc.)
scripts/
  scrape-roasters.ts          → seeds 32 curated Pour Over + Espresso brews
  bootstrap-origin-profiles.ts → derives curated profiles from brews; LLM for unseeded origins
  batch-origin-profiles.ts    → cron: refresh needs_review + stale rows (ORIGIN_PROFILE_REFRESH_DAYS)
  backfill-technique.ts       → one-shot: LLM-extract technique for brews with notes but no technique
```

## Request flow

### REST
```
Client → GET/POST /origins|/brewing-methods|/brews|/recommend
  → src/index.ts (CORS middleware)
  → src/routes/brewing.ts
  → src/lib/recommend.ts  (for /recommend and /brews — origin resolution + linking)
  → src/lib/db.ts (Prisma → Neon Postgres)
  → JSON response
```

### MCP (Streamable HTTP)
```
MCP Client → POST /mcp
  → src/routes/mcp.ts: checkOrigin → buildMcpServer() → StreamableHTTPTransport
  → tool handler: get_brewing_methods | recommend | log_brew | search_brews | compare_brew
  → src/lib/recommend.ts  (for recommend and log_brew)
  → src/lib/db.ts (Prisma → Neon Postgres)
  → SSE response (event: message / data: {...})
```

### Admin MCP (protected)
```
MCP Client → POST /admin/mcp
  → src/routes/admin.ts: checkOrigin → adminAuth (Bearer token) → buildAdminMcpServer()
  → tool handler: create/get/list/update/delete for brews, origins, origin_brew_profiles
  → src/lib/db.ts (Prisma → Neon Postgres)
  → SSE response
```

## MCP tools

| Tool | Status | Description |
|------|--------|-------------|
| `get_brewing_methods` | ✅ Live | Returns all 8 seeded brewing methods |
| `recommend` | ✅ Live | Deterministic community consensus via `computeBestBrew` |
| `log_brew` | ✅ Live | Persists a brew entry; resolves origin; links to recent recommendation |
| `search_brews` | ✅ Live | Filter brew log by origin, method, limit |
| `compare_brew` | ✅ Live | Delta vs method defaults; real `match_score` from `brew_recommendation_links` (`src/routes/mcp.ts`, `src/lib/db.ts:getBrewLinks`) |

## Data model (v5)

```
origins
  id PK, name TEXT UNIQUE, region TEXT, subregion TEXT,
  variety TEXT, aliases TEXT (comma-separated), is_verified INT

brewing_methods
  id PK, name TEXT, description TEXT,
  default_temp_c INT, grind_size TEXT,
  default_brew_time_s INT, default_ratio REAL,
  technique JSONB (method-scoped technique schema)

brews
  id PK, brewing_method_id FK → brewing_methods,
  origin TEXT, variety TEXT, roast_level TEXT, grind_size TEXT,
  water_temp_c INT, ratio REAL, brew_time_s INT,
  rating INT (1–5), notes TEXT, created_at TIMESTAMPTZ,
  source TEXT (user_submitted | scraped:reddit | scraped:home-barista | scraped:roaster),
  source_url TEXT,
  field_confidence TEXT (JSON: per-field extraction confidence, 0–1),
  technique JSONB (method-scoped technique: pour stages, bloom, steep, etc.)
  UNIQUE (source_url, brewing_method_id)   -- composite, allows same URL across methods

recommendations
  id PK, brewing_method_id FK, origin TEXT, roast_level TEXT,
  grind_size TEXT, water_temp_c INT, ratio REAL, brew_time_s INT,
  recommendation TEXT, confidence TEXT (high|medium|low),
  confidence_breakdown TEXT (JSON), sources TEXT (JSON: SourceRef[]),
  fingerprint TEXT UNIQUE,   -- deterministic: origin+roast+method; upserted on each call
  thumbs_up INT DEFAULT 0, thumbs_down INT DEFAULT 0,
  created_at TIMESTAMPTZ

brew_recommendation_links
  brew_id FK, recommendation_id FK,
  match_confidence REAL, user_vote TEXT (up|down|NULL), linked_at TIMESTAMPTZ
  PK (brew_id, recommendation_id)

origin_brew_profiles                            -- NEW in v5
  id PK,
  origin TEXT, roast_level TEXT, brewing_method_id FK → brewing_methods,
  water_temp_c INT, ratio REAL, brew_time_s INT, grind_size TEXT,
  tasting_notes TEXT (comma-separated flavor descriptors),
  technique JSONB (method-scoped, same schema as brews.technique),
  source TEXT (curated | llm_generated | needs_review),
  confident BOOLEAN DEFAULT false,
  generated_at TIMESTAMPTZ, last_verified TIMESTAMPTZ
  UNIQUE (origin, roast_level, brewing_method_id)
```

## Recommendation engine

`src/lib/recommend.ts` — deterministic logic. LLM is only consulted for origin profile generation (background, not on the hot path).

### computeBestBrew flow

1. **Origin resolution** — raw input string → `resolveOrigin` → normalized name (exact → alias → fuzzy → pass-through)
2. **Fetch candidates** — up to 50 recent brews from the DB
3. **Score each brew** against request params:
   - Origin match (weight 3): exact = 1.0, substring = 0.5, absent = 0
   - Method match (weight 3): method ID equality
   - Roast level (weight 2): exact = 1.0, adjacent roast = 0.5 (e.g. medium ↔ medium-light)
   - Variety match (weight 1): compares `brew.variety` directly against `params.variety` (per-brew, not per-origin map)
   - Grind size (weight 1): exact = 1.0
4. **Composite score** = `matchScore × (rating/5) × recencyDecay × sourceTrust × originConf`
   - `recencyDecay`: linear 1.0 → 0.1 over 365 days
   - `sourceTrust`: user_submitted=1.0, scraped:home-barista=0.85, scraped:reddit=0.7
   - `originConf`: from `field_confidence.origin` (1.0 verified, 0.7 fuzzy, 0.5 unknown)
5. **Take top 5**, compute confidence tier, build consensus params via weighted average (numeric) or weighted mode (categorical)
6. **Origin profile fallback** — when no community matches exist, check `origin_brew_profiles`; if a confident profile exists, use its params and set confidence = 'medium'; otherwise use method defaults (confidence = 'low') and fire-and-forget LLM profile generation
7. **Upsert recommendation** — deterministic fingerprint (`origin-roast-method_id`) means the same params always resolve to the same record; votes accumulate across calls

### Confidence tiers

| Tier | Condition | Consensus source | source_attribution |
|------|-----------|-----------------|-------------------|
| `high` | ≥3 matches, totalWeight > 1.5 | Weighted community consensus | `"Based on N community brews"` |
| `medium` | 1–2 matches | Blend: community data + method defaults | `"Based on N community brews"` |
| `medium` | 0 matches, confident profile | Origin brew profile params | `"Origin profile informed this recommendation"` |
| `low` | 0 matches, no profile | Pure method defaults | `"No community data yet — using {method} defaults"` |

When community brews exist **and** a confident origin profile exists, attribution is `"Based on N community brew(s) + origin profile"` and profile tasting notes supplement any gaps in community notes.

## Origin brew profiles

`origin_brew_profiles` is the knowledge layer that fills the cold-start gap. Any origin × roast × method combination with no community brews gets a complete brew profile (params + technique + tasting notes) generated by Claude Haiku and stored for reuse.

### Lifecycle

```
First request for unknown (origin, roast, method)
  → computeBestBrew: topN = 0
  → getOrTriggerOriginProfile()
      ├─ DB hit: profile exists + confident → return it (recommendation = 'medium')
      ├─ DB hit: needs_review → return null, don't re-trigger (cron will retry)
      └─ DB miss → return null + fire-and-forget LLM generation
                        └─ generateOriginBrewProfile (Haiku, temperature=0)
                              ├─ confident: true  → upsert as llm_generated, confident=true
                              └─ confident: false → upsert as needs_review, confident=false

Weekly cron (batch-origin-profiles.ts):
  → finds needs_review + rows older than ORIGIN_PROFILE_REFRESH_DAYS (default 7)
  → calls generateAndUpsertProfile for each
  → guards against overwriting confident/curated rows on LLM failure
```

### Source trust hierarchy

| source | confident | How it gets there |
|--------|-----------|-------------------|
| `curated` | true | `bootstrap-origin-profiles.ts` — derived from real community brews in DB |
| `llm_generated` | true | Fire-and-forget or cron; Haiku returned `{"confident": true, ...}` |
| `needs_review` | false | Haiku returned `{"confident": false}` or call failed; cron will retry |

### What it powers

- **Recommendation fallback**: profile params replace method defaults when no brews match
- **Tasting notes**: `GET /tasting-suggestions?origin=X&roast_level=Y&method_id=Z` — returns profile's comma-separated notes as a `string[]` for chip pre-population on Face B
- **MCP `recommend` response**: `tasting_notes` array (frequency-weighted) + `tasting_notes_summary` pre-formatted string; `source_attribution` field explains the data path

## Recommendation → brew feedback loop

### How it works

Every time a user logs a brew (`POST /brews` or MCP `log_brew`), the server fire-and-forgets `tryLinkBrew`. This looks back up to 7 days for a `recommendations` row that matches the same origin + method + roast, and if found, writes a row to `brew_recommendation_links`.

```
POST /recommend ──► recommendations (stored prediction)
                         │
         user brews coffee
                         │
POST /brews ─────► brews (logged outcome)
                         │
               tryLinkBrew (fire-and-forget)
                         │
                         ▼
            brew_recommendation_links
            (brew_id, recommendation_id, match_confidence)
```

### What it enables

Once a brew is linked to the recommendation that preceded it, you can ask:
- Did brews that followed a recommendation rate higher than brews that deviated from it? (recommendation quality signal)
- When we recommended 93°C and the user brewed at 91°C and rated it 4/5, what does that delta imply? (parameter sensitivity)
- Which source brews contributed to recommendations that produced high-rated real-world outcomes? (source quality reinforcement)

This data is **captured now but not yet consumed** — the link table is the foundation for a future feedback pass that would adjust source weights or score coefficients based on actual outcomes. `match_confidence: 0.85` is a placeholder; it will eventually reflect how closely the logged brew matched the recommendation.

## Origin verification signal

### What resolveOrigin produces

`resolveOrigin(raw)` returns `{ resolved: string, verified: boolean }`:

| Match type | `verified` | Example input → resolved |
|------------|-----------|--------------------------|
| Exact match | `true` | `'Ethiopia'` → `'Ethiopia'` |
| Alias match | `true` | `'Ethiopean'` → `'Ethiopia'` |
| Fuzzy (name substring) | `false` | `'Ethiop'` → `'Ethiopia'` |
| Unknown (pass-through) | `false` | `'Bali Blue Moon'` → `'Bali Blue Moon'` |

### How origin confidence is stored and used

When a brew is logged, `resolveOrigin` returns `{ resolved, verified }`. The route computes `field_confidence.origin` and stores it alongside the brew:

```
verified === true                    → field_confidence.origin = 1.0
verified === false, resolved ≠ raw  → field_confidence.origin = 0.7  (fuzzy — likely right)
verified === false, resolved === raw → field_confidence.origin = 0.5  (unknown — could be anything)
```

`computeBestBrew` reads `field_confidence.origin` via `originConf(brew)` and multiplies it into the composite score. Brews logged before this field was introduced default to `1.0` (backward-compatible). `high` confidence is earned only when enough verified-origin data agrees.

## Origin policy

| Origin | Allowed |
|--------|---------|
| No `Origin` header | ✅ (direct MCP clients) |
| `*.yuens.me` | ✅ |
| `localhost` (any port) | ✅ |
| Everything else | ❌ 403 |

## Deployment

| Target | URL |
|--------|-----|
| Production (Railway) | https://brew-guide-production.up.railway.app |
| MCP endpoint | https://brew-guide-production.up.railway.app/mcp |

Railway project: `brew-guide` — auto-deploys from `main` on `yuens1002/brew-guide`.

## Planned evolution

See `docs/roadmap.md`. Highest-priority gaps:
1. Semantic similarity on brew notes (keyword search before committing to embeddings)
2. Scraping pipeline — ingest roaster brew guides + community sources as seed for technique data (Phase 6)
3. Narrative synthesis — opt-in LLM-generated step-by-step brew guide (technique fields + LLM extraction ✅ delivered; synthesis still planned)
4. Register with MCP Registry (registry.modelcontextprotocol.io) — low priority, post-competition

### Narrative synthesis — opt-in design decision

The `recommend` endpoint will not include an LLM-generated narrative by default even when technique data and confidence are sufficient to produce one. Clients must explicitly request it (e.g. `"include_narrative": true` in the request body).

**Reason:** Narrative synthesis introduces an LLM call on the hot path. The rest of the recommendation engine is fully deterministic and sub-100ms. Making narrative opt-in preserves that guarantee for all clients that don't need it — MCP tool callers, programmatic integrations, and latency-sensitive frontends get the fast deterministic response unconditionally. Clients that want the step-by-step guide (human-facing UIs, conversational agents) pay the LLM latency only when they ask for it.
