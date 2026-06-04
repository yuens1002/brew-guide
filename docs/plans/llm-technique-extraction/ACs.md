# LLM Technique Extraction — Acceptance Criteria

**Plan:** `docs/plans/llm-technique-extraction/plan.md`

---

## Track A — DB & Types

### Functional ACs

| AC | # | What | How | Pass |
|----|---|------|-----|------|
| AC-FN-A1 | A1 | `technique` column exists on `brews` table as nullable JSONB | `\d brews` in psql | Column shows `technique jsonb` nullable |
| AC-FN-A2 | A2 | `Brew` and `BrewWithMethod` interfaces include `technique?: BrewTechnique \| null` | Code review: `src/types.ts` | Both interfaces declare the field |
| AC-FN-A3 | A4 | `GET /brews/:id` response includes `technique` field (null if not extracted) | `curl GET /brews/1` | Response JSON contains `"technique": null` or a populated object |
| AC-FN-A4 | A4 | `GET /brews` list response includes `technique` per brew | `curl GET /brews` | Each brew object in the array contains `technique` |
| AC-FN-A5 | A3 | `updateBrewTechnique` successfully writes a technique object to an existing brew | Inspect DB after backfill | `SELECT technique FROM brews WHERE id = X` returns the extracted JSON |

---

## Track B — LLM Provider

### Functional ACs

| AC | # | What | How | Pass |
|----|---|------|-----|------|
| AC-FN-B1 | B1 | `extractTechnique` returns `null` when `OPENROUTER_API_KEY` is absent | Unset env var, call function | Returns `null` without throwing |
| AC-FN-B2 | B1 | `extractTechnique` returns `null` for an unknown method name | Call with `methodName: "Drip Machine"` | Returns `null` (no schema entry) |
| AC-FN-B3 | B2 | `extractTechnique` returns a typed object when the model extracts technique from notes | Notes containing pour stages, bloom time, etc. | Returns object matching the method's `BrewTechnique` shape |
| AC-FN-B4 | B2 | `extractTechnique` returns `null` when notes contain no technique data (tasting/flavor notes only) | Notes: "Bright and fruity, chocolate finish" | Returns `null` |
| AC-FN-B5 | B1 | `extractTechnique` returns `null` on non-OK HTTP response from OpenRouter | Simulate 429 or 500 response | Returns `null` without throwing |
| AC-FN-B6 | B2 | `extractTechnique` returns `null` on malformed JSON from model | Simulate model returning invalid JSON | Returns `null` without throwing |

---

## Track C — Ingest Integration

### Functional ACs

| AC | # | What | How | Pass |
|----|---|------|-----|------|
| AC-FN-C1 | C1 | `POST /brews` with notes returns 201 immediately without waiting for extraction | `curl POST /brews` with technique-rich notes | Response time is consistent with non-LLM requests; extraction happens async |
| AC-FN-C2 | C1 | `POST /brews` without notes does NOT trigger extraction | `curl POST /brews` with no `notes` field | `extractTechnique` not called (verifiable via mock in test) |
| AC-FN-C3 | C1 | `POST /brews` with notes that yield a technique result → brew has technique populated when fetched later | `POST /brews` with technique notes; wait; `GET /brews/:id` | `technique` field is non-null in subsequent GET |

---

## Track D — Backfill Script

### Functional ACs

| AC | # | What | How | Pass |
|----|---|------|-----|------|
| AC-FN-D1 | D1 | Script queries only brews with `notes != null AND technique IS NULL` | Run script on DB with mixed brews | Already-extracted brews are not re-processed |
| AC-FN-D2 | D1 | Script prints per-brew status and final updated/skipped summary | Run `npx tsx scripts/backfill-technique.ts` | Output shows `brew N (Method)... extracted` or `skipped`; final count line printed |
| AC-FN-D3 | D1 | Script is idempotent — safe to re-run without re-extracting already-populated brews | Run twice | Second run reports `Found 0 brews` (or only new ones added between runs) |

---

## Test Coverage ACs

| AC | # | What | How | Pass |
|----|---|------|-----|------|
| AC-TST-1 | E3 | `extractTechnique` returns a technique object on successful OpenRouter response | `npm test` | `llm.test.ts` mocks `fetch`, returns valid JSON; asserts return value matches expected shape |
| AC-TST-2 | E3 | `extractTechnique` returns `null` when model responds with the string `"null"` | `npm test` | `llm.test.ts` mocks `fetch` with `content: "null"`; asserts return is `null` |
| AC-TST-3 | E3 | `extractTechnique` returns `null` on fetch error | `npm test` | `llm.test.ts` mocks `fetch` to throw; asserts return is `null` |
| AC-TST-4 | E3 | `extractTechnique` returns `null` when `OPENROUTER_API_KEY` is not set | `npm test` | `llm.test.ts` clears env var; asserts immediate `null` return without calling fetch |
| AC-TST-5 | E4 | `POST /brews` with notes initiates the fire-and-forget extraction chain | `npm test` | `brewing.test.ts` asserts `getBrewingMethods` mock is eventually called when notes are provided |
| AC-TST-6 | E4 | `POST /brews` without notes does not call `extractTechnique` | `npm test` | `brewing.test.ts` asserts `extractTechnique` mock not called when no notes in payload |
| AC-TST-7 | all | All existing tests still pass | `npm test` | 0 failures across all test files |
| AC-TST-8 | all | TypeScript build clean | `npx tsc --noEmit` | 0 type errors |

---

## Regression ACs

| AC | # | What | How | Pass |
|----|---|------|-----|------|
| AC-REG-1 | all | All existing tests pass | `npm test` | 0 failures |
| AC-REG-2 | all | TypeScript build clean | `npx tsc --noEmit` | 0 type errors |
| AC-REG-3 | A4 | `POST /brews` without technique in payload still returns 201 | `curl POST /brews` (no notes) | Response unchanged from pre-iteration shape |
| AC-REG-4 | A4 | Existing brews without technique return `technique: null` (not missing field) in GET responses | `GET /brews`, `GET /brews/:id` | Field present and null, not absent from JSON |
| AC-REG-5 | B1 | Missing `OPENROUTER_API_KEY` does not crash the server or fail any request | Start server without key; `POST /brews` with notes | Server starts; brew inserts succeed; technique silently stays null |
