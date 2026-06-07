# /review report — iteration-7 (technique consensus + narrative synthesis + data integrity)

**Branch:** `feat/iteration-7-technique-consensus`
**Generated:** 2026-06-05
**Commits reviewed:** 2
- `8296ee5` feat(iteration-7): technique consensus + narrative synthesis + tasting note quality
- `ff4bb7f` feat(iteration-7): tasting notes column + origin confidence cap
**Tests:** 94 passed, 0 failed
**Type-check:** clean

---

## Verdict

**Minor issues** — two findings, neither blocking. The implementation is complete and correct; the issues are a DRY violation and a missing UI footnote. Recommend fixing both before merging (small effort, high signal).

---

## Deliverables ↔ Code

The plan (`~/.claude/plans/snuggly-brewing-dijkstra.md`) lists deliverables A–H for iteration-7. The second commit adds data-integrity work outside the plan (treated as patch-cadence additions).

| Deliverable | Description | Implementation | Status |
|-------------|-------------|----------------|--------|
| A | `aggregateTechnique()` in recommend.ts | `src/lib/recommend.ts:154–217` | ✓ shipped |
| B | Types — `technique_sources_count`, `narrative`, `include_narrative` | `src/types.ts` | ✓ shipped |
| C | `generateNarrative()` in llm.ts | `src/lib/llm.ts` | ✓ shipped |
| D | brewing.ts — `include_narrative` + narrative block | `src/routes/brewing.ts` | ✓ shipped |
| E | mcp.ts — `include_narrative` + narrative block | `src/routes/mcp.ts` | ✓ shipped |
| F | landing — "Include brew guide" toggle + technique card + narrative section | `landing/index.html` | ⚠ partial |
| G | Tests — AC-TST-1–6 + AC-NEW-1–2 | `src/__tests__/recommend.test.ts`, `brewing.test.ts`, `mcp-tools.test.ts` | ✓ shipped |
| H | docs/API-SPEC.md updated | `docs/API-SPEC.md` | ✓ shipped |

**Deliverable F detail:**
- "Include brew guide" checkbox: ✓ present (`#includeNarrativeA`)
- Technique card with method-specific steps: ✓ present (`renderTechniqueOrFallback`, `#techniqueSection`)
- Narrative section: ✓ present (`#narrativeSection`, `#narrativeBody`)
- `technique_sources_count` footnote ("Based on N community brew(s)" / "Method defaults"): **⚠ missing** — the value is returned by the API but never read or displayed in the landing JS

### Code changes not tied to any iteration-7 deliverable (patch-cadence additions)

These were added via a separate user request and are correct but lack a formal plan backing:
- `prisma/migrations/20260605191728_add_brew_tasting_notes/` — `tasting_notes String?` column
- `prisma/seed.ts` — upsert loop with clean tasting_notes per brew
- `src/lib/db.ts` — tasting_notes mapping in getBrews/getBrewById/addBrew; `getTastingNotes()` OR-query fix
- `src/lib/recommend.ts` — `aggregateTastingNotes` branching on `brew.tasting_notes`; `hasOriginMatch` confidence cap
- `src/__tests__/recommend.test.ts` — AC-NEW-1 (tasting_notes preference) and AC-NEW-2 (confidence cap)

---

## ACs ↔ Tests (Gate 3 spot-check)

No formal ACs doc exists for this branch (no `docs/plans/iteration-7/ACs.md`). Verifying against the plan's G-section and the inline test comments.

| AC | Test file | Asserts invariant? | Notes |
|----|-----------|---------------------|-------|
| AC-TST-1 | `recommend.test.ts` — "returns technique_sources_count: 0…" | ✓ | Asserts `count === 0` + `technique === null` — structural invariant |
| AC-TST-2 | `recommend.test.ts` — "returns technique_sources_count: 2…" | ✓ | Asserts count + weighted average of identical inputs → same value; derives from test data, not seed |
| AC-TST-3 | `brewing.test.ts` — "calls generateNarrative…medium confidence" | ✓ | Asserts mock call + narrative propagated from mock return — flow test, not literal pin |
| AC-TST-4 | `brewing.test.ts` — "does not call generateNarrative…low confidence" | ✓ | Asserts mock NOT called — guard invariant |
| AC-TST-5 | `brewing.test.ts` — "does not call generateNarrative when flag absent" | ✓ | Asserts mock NOT called — opt-in gate invariant |
| AC-TST-6 | `mcp-tools.test.ts` — MCP parity | ✓ | Same flow-test pattern as AC-TST-3; REST/MCP symmetry confirmed |
| AC-NEW-1 | `recommend.test.ts` — "returns clean tasting notes from brew.tasting_notes" | ✓ | Asserts top note is 'caramel' (appears in all 3 test brews); asserts narrative noise text absent |
| AC-NEW-2 | `recommend.test.ts` — "origin mismatch caps confidence at medium" | ✓ | Asserts `confidence === 'medium'` + attribution suffix; separate test asserts `'high'` preserved when match exists |

All tests assert invariants. No brittle-literal pins against seed data detected.

---

## Docs drift

| Doc | Claim | Status |
|-----|-------|--------|
| `docs/API-SPEC.md` | POST /recommend request/response shape | ✓ updated — `include_narrative`, `technique_sources_count`, `narrative`, `tasting_notes`, `source_attribution` all present |
| `CLAUDE.md` | Key files table, stack, dev commands | ✓ no drift — no new files requiring CLAUDE.md entries |
| `landing/index.html` | UI completeness | ⚠ see Finding 2 below |

---

## Findings

### Finding 1 — DRY violation: `isFlavorNote` + `TASTING_NOTE_NOISE` duplicated
**Severity:** Minor  
**Files:** `src/lib/db.ts:154–163` and `src/lib/recommend.ts` (same block added in the patch-cadence commit)

`TASTING_NOTE_NOISE` regex and `isFlavorNote()` are identical copies in two separate modules. If the noise-word list grows (e.g., adding "bland", "bitter" as non-descriptors), only one copy will likely be updated, causing the global `/tasting-notes` endpoint and the per-recommendation aggregation to diverge silently.

**Fix:** Extract to `src/lib/flavor-utils.ts`, export `isFlavorNote`, import in both `db.ts` and `recommend.ts`.

### Finding 2 — `technique_sources_count` footnote missing from landing page (plan deliverable F, partial)
**Severity:** Minor  
**File:** `landing/index.html` — around line 2350 where technique steps are rendered

The plan specifies: *"Footnote: `technique_sources_count > 0 ? 'Based on N community brew(s)' : 'Method defaults'`"*. The `technique_sources_count` field is returned by the API and computed correctly, but the landing page JS never reads it. The technique card renders steps but has no attribution footnote.

**Fix:** After the technique steps are appended to `techList`, add a footnote element reading `data.technique_sources_count > 0 ? \`Based on ${data.technique_sources_count} community brew(s)\` : 'Method defaults'`.

---

## Recommendations

1. **Extract `isFlavorNote` to `src/lib/flavor-utils.ts`** — import in `db.ts` and `recommend.ts`. Eliminates silent divergence risk when the noise filter evolves.

2. **Add `technique_sources_count` footnote to landing page** — one-line JS addition after the `techList` rendering block at `landing/index.html:2360`.

3. **Create `docs/plans/iteration-7/ACs.md`** — the patch-cadence additions (tasting_notes column, confidence cap) were correct but undocumented. Retroactively adding AC rows for AC-NEW-1 and AC-NEW-2 makes the test-plan traceable.

---

## Inputs for /retro

- **Route:** `/backend-architect` → `.claude/commands/backend-architect.md`  
  **Draft principle:** *"When adding a utility function (regex, filter, classifier) to a DB layer or recommendation layer, check whether an identical or near-identical copy already exists in a sibling module before adding it. If found, extract to a shared `lib/` utility and import from both sides. Copy-pasted filter functions (`isFlavorNote`, noise regexes) diverge silently when the filter logic evolves — one caller gets updated, the other doesn't."*  
  **Triggered by:** Finding 1 — `isFlavorNote` + `TASTING_NOTE_NOISE` duplicated in `db.ts` and `recommend.ts`.

- **Route:** `/frontend-dev` → `.claude/commands/frontend-dev.md`  
  **Draft principle:** *"When a new API response field exists solely to label a UI source attribution (e.g. `technique_sources_count`, `data_points_used`), render it in the UI before marking the deliverable complete. An API field with no UI consumer is a silent half-deliverable — the plan deliverable is only done when both the API value and the corresponding UI text are present."*  
  **Triggered by:** Finding 2 — `technique_sources_count` computed and returned but never displayed.
