# Structured Technique Input — Acceptance Criteria

**Plan:** `docs/plans/structured-technique-input/plan.md`

---

## Track A — Backend: accept technique in POST /brews

### Functional ACs

| AC | # | What | How | Pass |
|----|---|------|-----|------|
| AC-FN-A1 | A1 | `POST /brews` accepts a `technique` object in the request body | `curl POST /brews` with `technique: {"bloom_weight_ratio": 2, "bloom_duration_s": 30, ...}` | 201; brew stored with technique populated |
| AC-FN-A2 | A1 | `POST /brews` without `technique` still succeeds (field is optional) | `curl POST /brews` omitting `technique` | 201 unchanged |
| AC-FN-A3 | A2 | When `technique` is supplied in the body, LLM extraction is NOT triggered | Send brew with both `notes` and `technique` | `extractTechnique` not called; stored technique matches the supplied object |
| AC-FN-A4 | A2 | When `technique` is absent but `notes` is present, fire-and-forget LLM extraction still runs | Send brew with `notes` but no `technique` | Existing extraction behaviour unchanged (regression) |
| AC-FN-A5 | A3 | MCP `log_brew` accepts `technique` parameter | MCP call with `technique` object | Tool executes without error; stored brew has technique |

---

## Track B — Frontend: structured technique fields (Face B)

### Functional ACs

| AC | # | What | How | Pass |
|----|---|------|-----|------|
| AC-FN-B1 | B1 | Face B has a **Tasting notes** textarea separate from the technique fields | Visual inspection | Textarea labelled "Tasting notes" visible below technique section; placeholder is flavour-focused ("How did it taste? Fruity, floral, bitter…") |
| AC-FN-B2 | B1 | The single "Technique notes" textarea is removed | Visual inspection | No general technique textarea exists on Face B |
| AC-FN-B3 | B2 | Selecting a method on Face B reveals that method's technique fields | Change `methodB` select | Technique section updates to show the correct per-method fields |
| AC-FN-B4 | B2 | Changing method clears technique fields from the previous method | Select Pour Over → fill bloom duration → switch to Espresso | Bloom duration field is gone; no stale values carry over |
| AC-FN-B5 | B3 | Pour Over shows bloom, pour stages (repeatable), agitation, drawdown | Select Pour Over | All fields visible; [+ Add stage] adds a row; [−] removes it |
| AC-FN-B6 | B3 | Chemex shows Pour Over fields plus a filter rinse checkbox | Select Chemex | Filter rinse checkbox present in addition to bloom + pour stage fields |
| AC-FN-B7 | B4–B10 | Each remaining method shows its correct fields | Select each method in turn | Espresso, French Press, AeroPress, Cold Brew, Moka Pot, Siphon, Turkish each show only their own fields |
| AC-FN-B8 | B11 | Submitting with technique fields filled sends `technique` object in POST body | Browser devtools network | Request body contains `"technique": {...}` with only filled fields |
| AC-FN-B9 | B11 | Submitting with no technique fields filled omits `technique` from POST body | Submit with all technique fields blank | Request body has no `technique` key |
| AC-FN-B10 | B11 | Tasting notes textarea value is sent as `notes` in POST body | Fill tasting notes, submit | Request body contains `"notes": "<tasting text>"` |
| AC-FN-B11 | B11 | Pour stage rows: [+ Add stage] appends a new row; [−] removes that row | Click [+ Add stage] twice, then [−] on first row | Two rows → three rows; then two rows again |

---

## Track C — Frontend: technique renderer fixes

### Functional ACs

| AC | # | What | How | Pass |
|----|---|------|-----|------|
| AC-FN-C1 | C1 | Recommendations for Turkish coffee show a technique guide | Call `/recommend` with a Turkish method brew | Technique section visible with at least one step describing heat level, foam, or serving |
| AC-FN-C2 | C2 | Methods with no specific renderer case but a stored technique fall back to the method description | Code review: `renderTechnique()` + fallback logic | If `renderTechnique()` returns null and `data.technique` is non-null, the method's description string is shown as a single step |
| AC-FN-C3 | C2 | Methods with neither technique nor renderer still hide the section | Recommendation for a method with no technique data | Technique section hidden; no empty step list visible |

---

## Track D — Tasting notes: backend aggregation

### Functional ACs

| AC | # | What | How | Pass |
|----|---|------|-----|------|
| AC-FN-D1 | D1 | `GET /tasting-notes` returns an array of `{note, count}` sorted by count descending | `curl GET /tasting-notes` | Response is `[{note: "bright", count: 4}, ...]`; max 50 entries |
| AC-FN-D2 | D1 | `GET /tasting-notes` returns an empty array when no brews have notes | Empty DB or all brews have null notes | `[]` — no 500 |
| AC-FN-D3 | D2 | `POST /recommend` response includes `tasting_notes` array when matched brews have notes | Call `/recommend` for an origin with seeded brews that have notes | Response contains `"tasting_notes": [{note, count}, ...]` |
| AC-FN-D4 | D2 | `tasting_notes` is empty array (not absent) when no matched brews have notes | Call `/recommend` with params matching brews with null notes | `"tasting_notes": []` in response |
| AC-FN-D5 | D2 | Notes are split by comma, normalised (lowercase, trimmed), and counted across matched brews | Brews with `notes: "bright, floral"` and `notes: "bright, chocolatey"` matched | `tasting_notes` contains `{note: "bright", count: 2}` |

---

## Track E — Tasting notes: frontend surfacing

### Functional ACs

| AC | # | What | How | Pass |
|----|---|------|-----|------|
| AC-FN-E1 | E1 | Recommendation card shows tasting notes below the origin/roast line in italics | Get a recommendation where matched brews have notes | Italic comma-separated note text visible below `"Colombia · medium roast"` |
| AC-FN-E2 | E1 | Notes with count > 1 show a superscript number | At least two matched brews share a note | Note renders as e.g. *bright²* with superscript 2 |
| AC-FN-E3 | E1 | Tasting notes line hidden when `tasting_notes` is empty or absent | Recommendation with no community notes | No empty italic line below origin |
| AC-FN-E4 | E2 | Face B tasting notes field is a chip input (not a plain textarea) | Visual inspection of Face B | Input + chip row visible; typing and pressing Enter adds a chip |
| AC-FN-E5 | E2 | Chip input combobox shows known notes from `GET /tasting-notes` as suggestions | Type in tasting notes input | Dropdown appears with matching known notes |
| AC-FN-E6 | E2 | Selecting a suggestion from the dropdown adds it as a chip | Click a suggestion | Chip appears; input clears |
| AC-FN-E7 | E2 | Pressing Enter on a typed value (not in dropdown) adds it as a chip | Type "jammy", press Enter | "jammy" chip appears |
| AC-FN-E8 | E2 | Clicking × on a chip removes it | Click × on a chip | Chip removed; others unchanged |
| AC-FN-E9 | E3 | If `GET /tasting-notes` fails, hardcoded fallback list populates the combobox | Disable API, open Face B | Combobox still suggests: bright, floral, fruity, chocolatey, nutty, caramel, earthy, citrus, berry, acidic, balanced, smooth, bitter |
| AC-FN-E10 | E4 | Submit success state shows the logged chips back to the user | Submit brew with chips "bright" and "floral" | Success text includes *"bright, floral"* in italics |
| AC-FN-E11 | E4 | Submit success state with no tasting notes entered shows no notes line | Submit brew without any chips | No empty notes section in success state |

---

## Test Coverage ACs

| AC | # | What | How | Pass |
|----|---|------|-----|------|
| AC-TST-1 | F1 | `POST /brews` with `technique` in body does not call `extractTechnique` | `npm test` | `brewing.test.ts` asserts `vi.mocked(extractTechnique)` not called when technique present |
| AC-TST-2 | F3 | `POST /brews` with `technique` passes the object to `addBrew` | `npm test` | `brewing.test.ts` asserts `vi.mocked(addBrew)` called with `expect.objectContaining({ technique: <expected object> })` |
| AC-TST-3 | F2 | `POST /brews` without `technique` but with `notes` still triggers extraction chain | `npm test` | `brewing.test.ts` asserts `vi.mocked(getBrewingMethods)` is eventually called (regression guard) |
| AC-TST-4 | F4 | `GET /tasting-notes` returns `{note, count}` array sorted descending | `npm test` | `brewing.test.ts` mocks `getTastingNotes` and asserts response shape and sort order |
| AC-TST-5 | all | All existing tests still pass | `npm test` | 0 failures across all test files |
| AC-TST-6 | all | TypeScript build clean | `npx tsc --noEmit` | 0 type errors |

---

## Regression ACs

| AC | # | What | How | Pass |
|----|---|------|-----|------|
| AC-REG-1 | all | `POST /brews` without `technique` returns 201 unchanged | `curl POST /brews` (no technique) | 201; behaviour identical to pre-iteration |
| AC-REG-2 | A2 | Fire-and-forget LLM extraction still runs for brews with notes but no technique | Submit brew via Face B with only tasting chips, no technique fields filled | `extractTechnique` fires asynchronously |
| AC-REG-3 | B | Selecting a method and submitting with all technique fields empty still submits successfully | Fill in all required brew fields, leave technique blank, submit | 201; `technique` absent from stored brew |
| AC-REG-4 | B | Face B pre-fill from Face A (origin, roast, method) still works after technique section is added | Get recommendation → click "Log my brew" | Face B fields pre-filled correctly; technique section initialises for the pre-filled method |
| AC-REG-5 | C | Existing rendering for Pour Over, Espresso, French Press, AeroPress, Cold Brew, Moka Pot, Siphon is unchanged | Get recommendations for each method with technique data | Same steps rendered as before; no regressions in existing renderer cases |
| AC-REG-6 | D2 | `POST /recommend` response still includes all existing fields | `curl POST /recommend` | All pre-existing fields (`confidence`, `sources`, `technique`, `thumbs_up`, etc.) present alongside new `tasting_notes` |
