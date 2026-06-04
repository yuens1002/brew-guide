# ACs: Origin Brew Profiles

**Branch:** `feat/origin-brew-profiles`
**Plan:** `docs/plans/origin-brew-profiles/plan.md`

## Track A — Schema & DB

| AC | Plan ref | Role | Pass condition | Agent | QC | Reviewer |
|----|----------|------|---------------|-------|----|----------|
| AC-FN-A1 | A | backend-architect | `origin_brew_profiles` table exists with all columns; `npx prisma migrate dev` exits 0 | | | |
| AC-FN-A2 | B | backend-architect | `getOriginBrewProfile(origin, roastLevel, methodId)` returns the row or null | | | |
| AC-FN-A3 | B | backend-architect | `upsertOriginBrewProfile(profile)` inserts on first call, updates on conflict (same origin/roast/method) | | | |
| AC-FN-A4 | B | backend-architect | `getUnverifiedOriginProfiles(days)` returns rows where `source = 'needs_review'` OR `last_verified < now() - days` | | | |

## Track B — LLM

| AC | Plan ref | Role | Pass condition | Agent | QC | Reviewer |
|----|----------|------|---------------|-------|----|----------|
| AC-FN-B1 | C | backend-architect | `generateOriginBrewProfile('Ethiopia', 'light', 'Pour Over')` returns object with all required brew fields + `confident: true` (mocked fetch) | | | |
| AC-FN-B2 | C | backend-architect | Returns `null` when `OPENROUTER_API_KEY` unset, or when method name not in `METHOD_SCHEMAS` | | | |
| AC-FN-B3 | C | backend-architect | Returns `null` when model response contains `"confident": false` or JSON parse fails | | | |
| AC-FN-B4 | C | backend-architect | Technique shape in returned payload matches the method's BrewTechnique sub-type fields | | | |

## Track C — Origin Profile Lib

| AC | Plan ref | Role | Pass condition | Agent | QC | Reviewer |
|----|----------|------|---------------|-------|----|----------|
| AC-FN-C1 | D | backend-architect | `getOrTriggerOriginProfile()` returns the DB profile when `confident: true` exists | | | |
| AC-FN-C2 | D | backend-architect | When no profile exists, function returns `null` immediately and fire-and-forget generation is triggered (does not block) | | | |
| AC-FN-C3 | D | backend-architect | When profile exists with `confident: false` / `needs_review`, returns `null` without triggering new generation | | | |

## Track D — Recommend Engine

| AC | Plan ref | Role | Pass condition | Agent | QC | Reviewer |
|----|----------|------|---------------|-------|----|----------|
| AC-FN-D1 | E | backend-architect | `computeBestBrew` with no matching brews but a confident profile uses profile's `water_temp_c`, `ratio`, `brew_time_s`, `grind_size` | | | |
| AC-FN-D2 | E | backend-architect | With no matching brews and no profile, falls back to method defaults and triggers fire-and-forget | | | |
| AC-FN-D3 | E | backend-architect | `source_attribution` is correct string for all four paths (community only / community + profile / profile only / defaults) | | | |
| AC-FN-D4 | E | backend-architect | `tasting_notes` on recommendation populated from profile when `topN` brews have no notes | | | |
| AC-FN-D5 | E | backend-architect | Existing high/medium confidence paths unchanged; regression test suite still green | | | |

## Track E — Endpoint

| AC | Plan ref | Role | Pass condition | Agent | QC | Reviewer |
|----|----------|------|---------------|-------|----|----------|
| AC-FN-E1 | F | backend-architect | `GET /tasting-suggestions?origin=Ethiopia&roast_level=light&method_id=1` returns `string[]` from a confident profile | | | |
| AC-FN-E2 | F | backend-architect | When no confident profile exists, returns global tasting notes (top-20 strings) | | | |
| AC-FN-E3 | F | backend-architect | Missing `origin` query param → `200 []` | | | |

## Track F — Face B

| AC | Plan ref | Role | Pass condition | Agent | QC | Reviewer |
|----|----------|------|---------------|-------|----|----------|
| AC-FN-F1 | G | frontend-dev | Selecting an origin on Face B fires `fetch(/tasting-suggestions?origin=...)` | | | |
| AC-FN-F2 | G | frontend-dev | Up to 5 returned notes appear as pre-populated chips; duplicates of already-added chips are skipped | | | |
| AC-FN-F3 | G | frontend-dev | Clearing the origin input clears any chips that were pre-populated by the suggestions fetch | | | |

## Track G — Scripts

| AC | Plan ref | Role | Pass condition | Agent | QC | Reviewer |
|----|----------|------|---------------|-------|----|----------|
| AC-FN-G1 | H | backend-architect | `npx tsx scripts/bootstrap-origin-profiles.ts` exits 0; curated origins present in `origin_brew_profiles` as `source: 'curated'` | | | |
| AC-FN-G2 | I | backend-architect | `npx tsx scripts/batch-origin-profiles.ts` exits 0; processes `needs_review` rows and rows older than cadence | | | |
| AC-FN-G3 | I | backend-architect | `ORIGIN_PROFILE_REFRESH_DAYS=14 npx tsx scripts/batch-origin-profiles.ts` skips rows verified within 14 days | | | |

## Track H — Tests

| AC | Plan ref | Role | Pass condition | Agent | QC | Reviewer |
|----|----------|------|---------------|-------|----|----------|
| AC-TST-1 | J | test-engineer | `origin-profile.test.ts`: `generateOriginBrewProfile` returns complete profile on mocked successful Haiku response | | | |
| AC-TST-2 | J | test-engineer | `generateOriginBrewProfile` returns `null` on `confident: false` response body | | | |
| AC-TST-3 | J | test-engineer | `computeBestBrew` uses profile params when `topN` is empty (DB profile mocked) | | | |
| AC-TST-4 | J | test-engineer | `GET /tasting-suggestions` returns profile notes when mocked DB returns a confident profile | | | |
| AC-TST-5 | J | test-engineer | All pre-existing tests pass; `npx tsc --noEmit` exits 0 | | | |
