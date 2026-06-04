# Plan: Origin Brew Profiles

**Branch:** `feat/origin-brew-profiles`
**Based on:** `feat/structured-technique-input`

## Context

The recommendation engine falls back to bare method defaults when no community brews exist for an origin. Tasting notes and technique are absent in this path. Any origin outside the seed data returns a generic recommendation with no flavor context.

This feature adds `origin_brew_profiles` — a persisted, LLM-generated complete brew profile (brew params + technique + tasting notes) for any origin × roast × method combination. On first encounter of an unknown combination, a fire-and-forget Haiku call generates the profile. On high confidence it is upserted immediately; on low confidence it is queued as `needs_review` for a configurable weekly cron. Both the recommendation result and Face B chip suggestions read from this table.

## Deliverables

| ID | Artifact | Kind | Role |
|----|----------|------|------|
| A | `prisma/schema.prisma` + migration | migration | backend-architect |
| B | `src/lib/db.ts` — 3 new functions | DB layer | backend-architect |
| C | `src/lib/llm.ts` — `generateOriginBrewProfile()` | LLM wrapper | backend-architect |
| D | `src/lib/origin-profile.ts` (new) | lib | backend-architect |
| E | `src/lib/recommend.ts` — profile fallback + `source_attribution` | engine | backend-architect |
| F | `src/routes/brewing.ts` — `GET /tasting-suggestions` | endpoint | backend-architect |
| G | `landing/index.html` — origin-change chip pre-population | frontend | frontend-dev |
| H | `scripts/bootstrap-origin-profiles.ts` (new) | script | backend-architect |
| I | `scripts/batch-origin-profiles.ts` (new) | script | backend-architect |
| J | `src/__tests__/origin-profile.test.ts` (new) | tests | test-engineer |
| K | `src/types.ts` — `OriginBrewProfile` + `source_attribution` on `Recommendation` | types | backend-architect |

## Schema (A)

```prisma
model OriginBrewProfile {
  id                Int       @id @default(autoincrement())
  origin            String
  roast_level       String
  brewing_method_id Int
  water_temp_c      Int
  ratio             Float
  brew_time_s       Int
  grind_size        String
  tasting_notes     String
  technique         Json?
  source            String    @default("llm_generated")
  confident         Boolean   @default(false)
  generated_at      DateTime  @default(now()) @db.Timestamptz(3)
  last_verified     DateTime? @db.Timestamptz(3)

  @@unique([origin, roast_level, brewing_method_id])
  @@map("origin_brew_profiles")
}
```

## LLM Function (C)

`generateOriginBrewProfile(origin, roastLevel, methodName)` in `src/lib/llm.ts`:
- Reuses `OPENROUTER_API_URL`, `apiKey`, `METHOD_SCHEMAS` from existing `extractTechnique`
- Returns `{ confident, water_temp_c, ratio, brew_time_s, grind_size, tasting_notes: string[], technique }` or `null`
- Confidence gate: `confident: false` or missing required params → return `null`
- `temperature: 0`, `max_tokens: 768`

## Origin Profile Lib (D)

`src/lib/origin-profile.ts`:
- `getOrTriggerOriginProfile(origin, roastLevel, methodId, methodName)` — check DB, fire-and-forget if missing
- `generateAndUpsertProfile(origin, roastLevel, method)` — used by bootstrap + cron

## Recommend Engine (E)

When `topN.length === 0`:
1. Check `origin_brew_profiles` for `(origin, roast_level, method.id)`
2. Confident profile found → use its params + technique + tasting_notes, `confidence = 'medium'`
3. Not found → method defaults + fire-and-forget profile generation

`source_attribution` field added to `Recommendation`:

| Data path | Value |
|-----------|-------|
| topN ≥ 1 + profile | `"Based on {n} community brew(s) + origin profile"` |
| topN ≥ 1 only | `"Based on {n} community brew(s)"` |
| profile only | `"Origin profile informed this recommendation"` |
| neither | `"No community data yet — using {method} defaults"` |

## Endpoint (F)

`GET /tasting-suggestions?origin=X&roast_level=Y&method_id=Z`
1. No origin → `[]`
2. Confident profile → return tasting_notes as `string[]`
3. No profile → fallback to global `getTastingNotes()` top-20

## Face B (G)

`initCombobox` gains optional `onSelect` callback. `onOriginBSelect(originName)` fetches `/tasting-suggestions`, pre-populates chips (max 5, no duplicates). Clearing origin clears chips.

## Scripts (H, I)

- `bootstrap-origin-profiles.ts` — Prisma direct, curated origins from scrape-roasters vocab + LLM for remaining seeded origins. `source: 'curated'`, `confident: true`.
- `batch-origin-profiles.ts` — processes `needs_review` + rows older than `ORIGIN_PROFILE_REFRESH_DAYS` (default 7). Railway cron or GitHub Actions.

## Method ID Note

All scripts resolve method IDs by name lookup (`getBrewingMethods().find(m => m.name === ...)`). Chemex shares Pour Over's method ID with a `ChemexTechnique` technique shape.
