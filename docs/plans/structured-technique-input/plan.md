# Structured Technique Input

**Branch:** `feat/structured-technique-input`
**Owner:** `/frontend-dev` (Face B UX, renderer), `/backend-architect` (POST /brews schema, extraction bypass)
**Cadence:** Full — plan + ACs + verify + /review + /retro
**Source:** conversation — `docs/plans/llm-technique-extraction/` follow-on

---

## Context

The current brew log form (Face B) has a single free-form textarea for technique + tasting notes combined. This creates two problems:

1. **LLM extraction is unreliable for user submissions** — the extraction only fires if users happen to write technique-rich prose. Most users write flavour notes ("bright, floral, a bit acidic"), so technique stays null. The LLM path makes sense for scraped brews; for direct user input it should be a fallback, not the primary path.

2. **Tasting notes are never displayed** — `notes` is stored but not rendered anywhere in the UI. Separating technique (structured) from tasting notes (free-form) lets us surface both correctly.

Additionally, the `renderTechnique()` function on the landing page has no Turkish case — that method always hides the technique section. A generic fallback (method description) covers Turkish and any future gap.

---

## Scope

### Track A — Backend: accept technique in POST /brews

| # | What | Files |
|---|------|-------|
| A1 | Add `technique: z.object({}).passthrough().optional()` to `brewSchema` in `POST /brews`. Stores the technique object directly when provided. | `src/routes/brewing.ts` |
| A2 | When `technique` is present in the request body, skip the fire-and-forget LLM extraction — the structured value takes precedence. | `src/routes/brewing.ts` |
| A3 | Add `technique` to MCP `log_brew` input schema (object, optional) for parity with REST. | `src/routes/mcp.ts` |

### Track B — Frontend: structured technique fields (Face B)

| # | What | Files |
|---|------|-------|
| B1 | Replace the single `notesB` textarea with two distinct sections: (1) method-specific technique fields, (2) a separate **Tasting notes** textarea at the bottom. | `landing/index.html` |
| B2 | Technique section renders per-method fields when a method is selected. Field set swaps on method change. All technique fields are optional — they never block submission. | `landing/index.html` |
| B3 | Pour Over and Chemex: bloom weight ratio, bloom duration, agitation select, drawdown target, and a repeatable pour stages table with **[+ Add stage]** / **[−]** per row (at_s, volume_ml, note). Chemex adds a filter rinse checkbox. | `landing/index.html` |
| B4 | Espresso: pre-infusion, yield ratio, shot time, pressure, filter type select. | `landing/index.html` |
| B5 | French Press: steep time, plunge speed select, pre-wet checkbox, stir-at time. | `landing/index.html` |
| B6 | AeroPress: position toggle (Standard / Inverted), steep time, stir count, filter type select. | `landing/index.html` |
| B7 | Cold Brew: steep time (hours), temperature select (room / fridge), dilution ratio. | `landing/index.html` |
| B8 | Moka Pot: pre-heat water checkbox, heat level select, tamp select. | `landing/index.html` |
| B9 | Siphon: heat source select, stir pattern text, drawdown time. | `landing/index.html` |
| B10 | Turkish: heat level select, foam technique select, serve with grounds checkbox. | `landing/index.html` |
| B11 | `submitBrew()` builds `technique` object from filled fields (omits empty/unchecked optional fields). Sends `technique` in POST body; sends tasting textarea value as `notes`. If no technique field is filled, `technique` is omitted entirely. | `landing/index.html` |

### Track C — Frontend: technique renderer fixes

| # | What | Files |
|---|------|-------|
| C1 | Add Turkish rendering case to `renderTechnique()`: heat level → "Use low/medium heat", foam technique → "Bring to foam [once/twice] — traditional style", serve with grounds note. | `landing/index.html` |
| C2 | Generic fallback: if `renderTechnique()` returns null but `data.technique` exists, show a single step from the method's `description` field (already in the API response). If neither, hide the section. | `landing/index.html` |

### Track D — Tasting notes: backend aggregation

| # | What | Files |
|---|------|-------|
| D1 | `GET /tasting-notes` endpoint — queries all non-null `notes` from brews, splits by comma, normalises (lowercase, trim), deduplicates, returns top 50 by frequency as `[{note: string, count: number}]`. | `src/routes/brewing.ts`, `src/lib/db.ts` |
| D2 | `computeBestBrew` collects `notes` strings from all top-matched brews (same set used for parameter consensus). Splits by comma, normalises, counts, returns top 8 as `tasting_notes: Array<{note: string, count: number}>` on the `Recommendation` response type. | `src/lib/recommend.ts`, `src/types.ts` |

### Track E — Tasting notes: frontend surfacing

| # | What | Files |
|---|------|-------|
| E1 | **Recommendation card** — below the origin/roast line (`resOrigin`), render tasting notes as a comma-separated italic string. Each note with count > 1 gets a superscript number. Hidden when `tasting_notes` is empty or absent. | `landing/index.html` |
| E2 | **Face B chip input** — replace the plain tasting notes textarea with a combobox + chip pattern. Input filters known notes from `GET /tasting-notes`. Pressing Enter or selecting adds the note as a chip. Each chip has an × to remove. Chips submitted as a comma-separated string in the `notes` field. | `landing/index.html` |
| E3 | **Face B chip input — fallback** — if `GET /tasting-notes` fails, seed the combobox with a hardcoded list of common coffee tasting descriptors (bright, floral, fruity, chocolatey, nutty, caramel, earthy, spicy, citrus, berry, acidic, balanced, smooth, bitter). | `landing/index.html` |
| E4 | **Submit success state** — after confetti, show the submitted chips back to the user as confirmation ("Logged ✓ — *bright, floral, chocolate*"). | `landing/index.html` |

### Track F — Tests & Quality

| # | What | Files |
|---|------|-------|
| F1 | `POST /brews` with `technique` in body stores it and does NOT call `extractTechnique`. | `src/__tests__/brewing.test.ts` |
| F2 | `POST /brews` without `technique` but with `notes` still triggers fire-and-forget extraction (regression). | `src/__tests__/brewing.test.ts` |
| F3 | `POST /brews` with `technique` passes the object through to `addBrew` unchanged. | `src/__tests__/brewing.test.ts` |
| F4 | `GET /tasting-notes` returns an array of `{note, count}` objects sorted by count descending. | `src/__tests__/brewing.test.ts` |
| F5 | TypeScript build clean (`npx tsc --noEmit`). | — |

---

## Files touched

| File | Changes |
|------|---------|
| `src/routes/brewing.ts` | A1–A2: add `technique` to brewSchema, bypass extraction when present; D1: `GET /tasting-notes` endpoint |
| `src/routes/mcp.ts` | A3: add `technique` to log_brew input schema |
| `src/lib/db.ts` | D1: `getTastingNotes()` DB helper |
| `src/lib/recommend.ts` | D2: collect + aggregate tasting notes in `computeBestBrew` |
| `src/types.ts` | D2: add `tasting_notes` to `Recommendation` type |
| `landing/index.html` | B1–B11: structured technique fields; C1–C2: renderer fixes; E1–E4: tasting notes on rec card + chip input + success state |
| `src/__tests__/brewing.test.ts` | F1–F4: technique bypass + tasting-notes endpoint tests |

---

## Technique field layout per method

```
Pour Over / Chemex
  ├── Bloom weight ratio  [number] × dose
  ├── Bloom duration      [number] seconds
  ├── Pour stages         [repeatable rows: at (s) | volume (ml) | note] [+ Add stage]
  ├── Agitation           [select: swirl | stir | none]
  ├── Drawdown target     [number] seconds  (optional)
  └── (Chemex only) Filter rinse  [checkbox]

Espresso
  ├── Pre-infusion        [number] seconds  (optional)
  ├── Yield ratio         1: [number]
  ├── Shot time           [number] seconds
  ├── Pressure            [number] bar  (optional)
  └── Filter type         [select: paper | metal | cloth]

French Press
  ├── Steep time          [number] seconds
  ├── Plunge speed        [select: slow | medium]
  ├── Pre-wet grounds     [checkbox]
  └── Stir at             [number] seconds  (optional)

AeroPress
  ├── Position            [toggle: Standard | Inverted]
  ├── Steep time          [number] seconds
  ├── Stir count          [number]  (optional)
  └── Filter type         [select: paper | metal]

Cold Brew
  ├── Steep time          [number] hours
  ├── Temperature         [select: room temperature | fridge]
  └── Dilution ratio      1: [number]  (optional)

Moka Pot
  ├── Pre-heat water      [checkbox]
  ├── Heat level          [select: low | medium]
  └── Tamp                [select: none | light]

Siphon
  ├── Heat source         [select: butane | halogen | electric]
  ├── Stir pattern        [text]  (optional)
  └── Drawdown time       [number] seconds  (optional)

Turkish
  ├── Heat level          [select: low | medium]
  ├── Foam technique      [select: traditional | none]
  └── Serve with grounds  [checkbox]
```

---

## Commit schedule

1. `docs: structured-technique-input plan + ACs`
2. `feat(api): accept technique in POST /brews + MCP log_brew, bypass extraction when present — A1–A3`
3. `feat(api): GET /tasting-notes endpoint + tasting_notes in recommend response — D1–D2`
4. `feat(landing): structured technique fields per method with +/- pour stages — B1–B11`
5. `feat(landing): Turkish renderer + generic description fallback — C1–C2`
6. `feat(landing): tasting notes on recommendation card + chip input on Face B — E1–E4`
7. `test: technique bypass + tasting-notes endpoint tests — F1–F4`

---

## Out of scope

- Per-note sentiment or quality scoring — needs more data volume; deferred
- Technique consensus in `computeBestBrew` (aggregating structured technique across matched brews) — Iteration 6
- Eval harness for LLM extraction quality — separate iteration
- MCP `recommend` returning technique narrative — Iteration 6
