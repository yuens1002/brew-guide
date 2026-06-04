# Structured Technique Input — Verification Report

**Branch:** `feat/structured-technique-input`
**ACs doc:** `docs/plans/structured-technique-input/ACs.md`
**Date:** 2026-06-03
**Result:** 35/35 PASS (1 iteration to fix AC-TST-6 TypeScript error)

---

## Test Evidence

```
Test Files  5 passed (5)
     Tests  75 passed (75)
TypeScript  0 errors (npx tsc --noEmit)
```

---

## Track A — Backend: accept technique in POST /brews

| AC | Result | Evidence |
|----|--------|---------|
| AC-FN-A1 | PASS | `brewSchema` has `technique: z.object({}).passthrough().optional()`; passed to `addBrew` |
| AC-FN-A2 | PASS | `technique` is optional — omitting it yields 201 unchanged |
| AC-FN-A3 | PASS | Fire-and-forget guarded with `if (!data.technique && data.notes)` — skipped when technique present |
| AC-FN-A4 | PASS | Same guard: when technique absent + notes present, extraction fires (regression confirmed by AC-TST-3 test) |
| AC-FN-A5 | PASS | MCP `log_brew` inputSchema has `technique: z.object({}).passthrough().optional()` |

---

## Track B — Frontend: structured technique fields (Face B)

| AC | Result | Evidence |
|----|--------|---------|
| AC-FN-B1 | PASS | `<label>Tasting notes</label>` + chip input with placeholder "How did it taste? Fruity, floral, bitter…" — separate from technique |
| AC-FN-B2 | PASS | No "Technique notes" textarea on Face B — replaced entirely |
| AC-FN-B3 | PASS | `methodB` change listener calls `renderTechniqueFields()` → `buildTechniqueFieldsHTML()` switch |
| AC-FN-B4 | PASS | `renderTechniqueFields` resets `_pourStages`, `_pourStageCount`, replaces `innerHTML` fully |
| AC-FN-B5 | PASS | `pourOverHTML(false)`: bloom ratio, bloom duration, pour stages container + add-stage-btn, agitation, drawdown |
| AC-FN-B6 | PASS | `pourOverHTML(true)`: adds `tq_filter_rinse` checkbox + all Pour Over fields |
| AC-FN-B7 | PASS | switch covers all 9 methods with their own fields only |
| AC-FN-B8 | PASS | `submitBrew()`: `if (technique) body.technique = technique` |
| AC-FN-B9 | PASS | `buildTechniqueObject()` returns `undefined` when all blank; `if (technique)` guard prevents empty object in body |
| AC-FN-B10 | PASS | `const notes = window._tastingChips.join(', '); if (notes) body.notes = notes` |
| AC-FN-B11 | PASS | `addPourStage()` / `removePourStage()` / `renderPourStages()` manage repeatable rows |

---

## Track C — Frontend: technique renderer fixes

| AC | Result | Evidence |
|----|--------|---------|
| AC-FN-C1 | PASS | Turkish branch in `renderTechnique()`: outputs heat, foam technique, and serve steps |
| AC-FN-C2 | PASS | `renderTechniqueOrFallback()`: if `renderTechnique()` returns null but technique + description exist, returns `[description]` |
| AC-FN-C3 | PASS | `renderTechniqueOrFallback()` returns null when no technique — `techSection.style.display = 'none'` |

---

## Track D — Tasting notes: backend aggregation

| AC | Result | Evidence |
|----|--------|---------|
| AC-FN-D1 | PASS | `getTastingNotes()`: comma-split, lowercase+trim, count, sort desc, slice(50), return `{note, count}[]` |
| AC-FN-D2 | PASS | Empty DB → empty counts → returns `[]`, no 500 |
| AC-FN-D3 | PASS | `computeBestBrew()`: `aggregateTastingNotes(topN, 8)` → `tasting_notes` on Recommendation |
| AC-FN-D4 | PASS | `aggregateTastingNotes` with null-notes brews → empty counts → returns `[]`; field always present |
| AC-FN-D5 | PASS | Split+normalize+count across matched brews correctly aggregates shared notes |

---

## Track E — Tasting notes: frontend surfacing

| AC | Result | Evidence |
|----|--------|---------|
| AC-FN-E1 | PASS | `resTastingNotes` element: italic CSS + comma-separated below `resOrigin` |
| AC-FN-E2 | PASS | `tn.count > 1 ? \`${note}<sup>${tn.count}</sup>\`` renders superscript |
| AC-FN-E3 | PASS | `else { tnEl.style.display = 'none'; }` when empty/absent |
| AC-FN-E4 | PASS | `chip-input-wrap` + `chipsContainer` + `tastingNoteInput` — chip UX, not textarea |
| AC-FN-E5 | PASS | `showSuggestions()` filters `window._tastingNotes` (or fallback) by typed value |
| AC-FN-E6 | PASS | Dropdown mousedown: `addChip(n); input.value = ''; dropdown.hidden` |
| AC-FN-E7 | PASS | Enter keydown: `addChip(v); input.value = ''; dropdown.hidden` |
| AC-FN-E8 | PASS | `renderChips()` adds `onclick="removeChip(${i})"` per chip; splices array on call |
| AC-FN-E9 | PASS | bootstrap catch: `window._tastingNotes = FALLBACK_TASTING_NOTES`; fallback list matches AC spec |
| AC-FN-E10 | PASS | Success state: `brew-success-msg` with `<em>chips</em>` when chips present |
| AC-FN-E11 | PASS | Success state: `Logged ✓` without notes section when chips empty |

---

## Test Coverage ACs

| AC | Result | Evidence |
|----|--------|---------|
| AC-TST-1 | PASS | "does not call extractTechnique when technique is supplied in the body" — asserts `not.toHaveBeenCalled()` |
| AC-TST-2 | PASS | "passes technique to addBrew when supplied in the body" — `expect.objectContaining({ technique })` |
| AC-TST-3 | PASS | "initiates technique extraction when notes are present" — asserts `getBrewingMethods` called |
| AC-TST-4 | PASS | GET /tasting-notes describe: sorted-descending test + empty-array test |
| AC-TST-5 | PASS | 75 tests, 0 failures |
| AC-TST-6 | PASS | 0 TypeScript errors (fixed: test fixture cast to `BrewTechnique`) |

---

## Regression ACs

| AC | Result | Evidence |
|----|--------|---------|
| AC-REG-1 | PASS | technique optional — POST without it returns 201 unchanged |
| AC-REG-2 | PASS | Guard condition preserves extraction for notes-only brews |
| AC-REG-3 | PASS | `buildTechniqueObject()` returns undefined when blank; no technique key in body |
| AC-REG-4 | PASS | `onShareClick()` copies A→B fields; `renderTechniqueFields(methodA.value)` initialises technique section |
| AC-REG-5 | PASS | Existing `renderTechnique()` branches unchanged; Turkish + fallback appended at end only |
| AC-REG-6 | PASS | All pre-existing Recommendation fields present; `tasting_notes` added alongside |

---

## Iterations

1. **AC-TST-6 FAIL** (initial verification): Test fixture `{ bloom_weight_ratio: 2, bloom_duration_s: 30 }` not assignable to `BrewTechnique` — TypeScript strict union rejection. Fixed by adding `pour_stages: []` + `as BrewTechnique` cast. Build clean after fix.
