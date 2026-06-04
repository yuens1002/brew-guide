# LLM Technique Extraction

**Branch:** `feat/llm-technique-extraction`
**Owner:** `/backend-architect` (schema, LLM wiring, ingest), `/devops` (env secrets), `/test-engineer` (coverage)
**Cadence:** Full — plan + ACs + verify + /review + /retro
**Source:** `docs/roadmap.md` — Phase 6, Iteration 5

---

## Context

The recommendation engine returns aggregate brew parameters (temp, ratio, grind, time) but nothing about *how* to execute the brew. Technique — bloom weight, pour stages, steep time, inverted vs standard — lives in roaster brew cards and community notes but is currently ignored. This iteration wires in the infrastructure to capture, extract, and store per-brew technique data, laying the foundation for technique consensus and narrative synthesis in Iteration 6.

The LLM provider decision resolved to **OpenRouter** over Anthropic direct, using `anthropic/claude-haiku-4-5` as the extraction model. OpenRouter gives broader model access on a single API key; Haiku is sufficient for structured JSON extraction from short-form notes.

---

## Scope

### Track A — DB & Types

| # | What | Files |
|---|------|-------|
| A1 | Add `technique Json?` to `Brew` model. Prisma migration. | `prisma/schema.prisma`, `prisma/migrations/20260603151722_add_technique_to_brews/` |
| A2 | Add `technique?: BrewTechnique \| null` to `Brew` and `BrewWithMethod` interfaces. | `src/types.ts` |
| A3 | `updateBrewTechnique(id, technique)` DB helper for async writes. | `src/lib/db.ts` |
| A4 | Thread `technique` through `addBrew()` (write), `getBrewById()` (read), `getBrews()` (read). | `src/lib/db.ts` |

### Track B — LLM Provider

| # | What | Files |
|---|------|-------|
| B1 | `src/lib/llm.ts` — OpenRouter wrapper via raw `fetch`. Model: `anthropic/claude-haiku-4-5`. Auth: `OPENROUTER_API_KEY`. No new npm dependencies. | `src/lib/llm.ts` |
| B2 | `extractTechnique(methodName, notes)` — returns typed `BrewTechnique \| null`. Graceful null on missing key, non-OK response, or JSON parse failure. Non-blocking to callers. | `src/lib/llm.ts` |
| B3 | Per-method JSON schema map (9 methods: Pour Over, Espresso, French Press, AeroPress, Cold Brew, Moka Pot, Chemex, Siphon, Turkish). Sent to LLM as extraction target in the user prompt. | `src/lib/llm.ts` |

### Track C — Ingest Integration

| # | What | Files |
|---|------|-------|
| C1 | Fire-and-forget extraction in `POST /brews`: when `notes` is present, kick off `getBrewingMethods → extractTechnique → updateBrewTechnique` chain. Non-blocking — response returns before extraction completes. Errors silently caught. | `src/routes/brewing.ts` |
| C2 | `technique` field returned in `GET /brews`, `GET /brews/:id` responses (null if not yet extracted). | `src/lib/db.ts` |

### Track D — Backfill Script

| # | What | Files |
|---|------|-------|
| D1 | `scripts/backfill-technique.ts` — one-shot script. Queries all brews with `notes != null AND technique IS NULL`. Calls `extractTechnique` per brew with 200ms inter-call delay (rate-limit courtesy). Reports updated / skipped counts. | `scripts/backfill-technique.ts` |

### Track E — Tests & Quality

| # | What | Files |
|---|------|-------|
| E1 | Add `vi.mock('../lib/llm.js')` to `brewing.test.ts` — `extractTechnique` defaults to `null`. Prevents test failures from un-mocked async side effects. | `src/__tests__/brewing.test.ts` |
| E2 | Add `updateBrewTechnique: vi.fn()` to db mock in `brewing.test.ts`. | `src/__tests__/brewing.test.ts` |
| E3 | Unit tests for `extractTechnique` — success path (mock fetch returns valid JSON), null path (model returns "null"), failure path (fetch throws). | `src/__tests__/llm.test.ts` (new) |
| E4 | Integration test: `POST /brews` with notes triggers the extraction chain (fire-and-forget invoked; does not block 201). | `src/__tests__/brewing.test.ts` |

---

## Files touched

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | A1: `technique Json?` on `Brew` |
| `prisma/migrations/20260603151722_add_technique_to_brews/` | A1: new migration |
| `src/types.ts` | A2: `technique` on `Brew`, `BrewWithMethod` |
| `src/lib/db.ts` | A3: `updateBrewTechnique`; A4: read/write technique in `addBrew`, `getBrewById`, `getBrews` |
| `src/lib/llm.ts` | B1–B3: new file — OpenRouter wrapper |
| `src/routes/brewing.ts` | C1: fire-and-forget extraction post-insert |
| `src/__tests__/brewing.test.ts` | E1–E2: mock llm.js + updateBrewTechnique; E4: extraction chain test |
| `src/__tests__/llm.test.ts` | E3: new file — llm unit tests |
| `scripts/backfill-technique.ts` | D1: new file — backfill script |

---

## Commit schedule

1. `docs: llm-technique-extraction plan + ACs`
2. `feat(schema): add technique column to brews — A1 + A2`
3. `feat(db): thread technique through db layer, add updateBrewTechnique — A3 + A4`
4. `feat(llm): OpenRouter wrapper with extractTechnique — B1–B3`
5. `feat(ingest): fire-and-forget technique extraction on POST /brews — C1 + C2`
6. `feat(scripts): backfill-technique one-shot script — D1`
7. `test: llm unit tests + brewing extraction chain test — E1–E4`

---

## Out of scope

- Technique consensus in `computeBestBrew` — Iteration 6
- Narrative synthesis via LLM — Iteration 6
- `include_narrative` flag on `POST /recommend` — Iteration 6
- MCP `recommend` tool technique support — Iteration 6
- Landing page rendering narrative — Iteration 6
- Embeddings / semantic similarity on notes — Iteration 8
