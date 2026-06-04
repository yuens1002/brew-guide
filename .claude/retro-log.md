# Retro Log

Running log of session lessons and fixes applied to project skills, templates, and docs.

---

## 2026-05-25 — Initial test suite + docs setup

**Source:** Ad-hoc session (no formal review report)

---

### Lesson 1: App module and server entrypoint must be separate files

**Gap:** `src/index.ts` unconditionally started the server after the `import.meta.url` guard was removed to fix Windows compatibility. Any test importing a route module (which imports `index.ts` transitively) would attempt to bind port 4000.

**Root cause:** The Windows-compatibility fix (removing the `import.meta.url` guard) was applied to `index.ts` itself rather than extracting the startup into a separate file. The correct fix was architectural, not a one-liner patch.

**Role:** `/backend-architect`

**Fix applied to:**
- `src/index.ts` — stripped server startup; now exports only the Hono app
- `src/server.ts` — new dedicated entrypoint; owns `serve()` and port binding
- `package.json` — `dev` and `start` scripts updated to point at `server.ts`
- `.claude/commands/backend-architect.md` — added principle: index.ts must be side-effect-free; server startup belongs in server.ts

**Prevented by:** The project-local `/backend-architect` skill now states this rule explicitly. Future sessions starting from that skill will not merge these concerns.

---

### Lesson 2: sql.js WASM cannot load in Vitest — always mock `src/lib/db.js`

**Gap:** sql.js is WASM-based and requires file-system access to locate the binary at a specific path. In Vitest's worker environment it fails to initialize, crashing any test that imports a route module without mocking the DB layer first.

**Root cause:** No established project convention for test isolation of the DB layer existed before this session.

**Role:** `/test-engineer`

**Fix applied to:**
- `src/__tests__/brewing.test.ts` — `vi.mock('../lib/db.js', ...)` at top of file
- `src/__tests__/mcp-tools.test.ts` — same pattern
- `.claude/commands/test-engineer.md` — added principle: always mock `src/lib/db.js`; WASM must never load in tests

**Prevented by:** The project-local `/test-engineer` skill now leads with the mocking rule and the exact mock factory shape.

---

### Lesson 3: MCP Streamable HTTP requires specific Accept header and SSE response parsing

**Gap:** First manual test of the MCP endpoint returned `Not Acceptable: Client must accept both application/json and text/event-stream`. The required `Accept` header was not documented. The SSE response format (`event: message\ndata: {...}`) also requires a parse step that's non-obvious.

**Root cause:** The Streamable HTTP transport spec requires both MIME types in the Accept header. This was not captured anywhere in the project docs or test conventions.

**Role:** `/test-engineer`

**Fix applied to:**
- `.claude/commands/test-engineer.md` — added the `callMcp()` helper pattern with required headers and SSE parse logic
- `CLAUDE.md` — documented `Accept` header requirement under the MCP endpoint entry

**Prevented by:** The project-local `/test-engineer` skill includes the exact `callMcp()` helper and parse pattern; any future test author starts with the right pattern.

---

### Lesson 4: CHANGELOG structural bug when inserting a new version section mid-document

**Gap:** When the `/commit` workflow inserted `## [1.0.1]` into the CHANGELOG, the `### Planned` content that was under `## [Unreleased]` ended up attributed to `[1.0.1]` (a released version). Caught by `/review` and fixed before merge.

**Root cause:** The edit inserted a new `##` section heading without moving the content that belonged to `[Unreleased]`. The editor (Claude) didn't read the full surrounding context before making the replacement.

**Role:** Cross-cutting (editing discipline; the `/review` skill caught it correctly)

**Fix applied to:**
- `CHANGELOG.md` — restructured so `[1.0.1]` has a `### Fixed` section; `### Planned` moved back to `[Unreleased]`
- This retro log (documenting the pattern for future sessions)

**Prevented by:** The `/review` docs-drift scan caught this. No new gate added — the existing `/review` step is the right place for this catch. Future note: when editing CHANGELOG, read the full file first and explicitly identify section boundaries before inserting new headings.

---

## 2026-05-27 — Neon + Prisma migration (Phase 4) post-mortem

**Source:** PM review of neon-prisma-migration plan ACs against main post-merge

---

### Lesson 5: Docs cleanup (D7) was not completed before merge — stale references persisted in CLAUDE.md, architecture/overview.md, and roadmap.md

**Gap:** The neon-prisma-migration plan listed a D7 deliverable (docs cleanup) covering four files: `CLAUDE.md`, `docs/architecture/overview.md`, `docs/roadmap.md`, and a stale stub comment in `src/routes/brewing.ts`. All four AC-DOC criteria were left unfilled. After the PR merged, every docs artifact still referred to `sql.js` and listed Phase 4 as future work, contradicting the live codebase.

**Root cause:** Docs cleanup was bundled into the same plan as the implementation but treated as lower-priority during execution. No PM-level checklist required docs ACs to pass before merge was approved.

**Role:** `/project-manager`

**Fix applied to:**
- `.claude/commands/project-manager.md` — added principle: docs ACs (AC-DOC-*) must be verified and signed off in the same iteration as the implementation ACs, never deferred past merge
- `.claude/retro-log.md` — this entry
- `docs/architecture/overview.md` — updated stack table, module map, request flow, planned evolution
- `docs/roadmap.md` — checked off Phase 4 bullets, Phase 5 Railway + rate limiting bullets
- `CLAUDE.md` — replaced three stale sql.js references with Neon Postgres + Prisma
- `docs/plans/neon-prisma-migration/review.md` — written retroactively

**Prevented by:** The `/project-manager` skill now requires that any plan containing AC-DOC criteria must have those ACs explicitly signed off at the same time as functional and test ACs. Docs cleanup is not optional scope — it is a first-class deliverable that blocks the iteration from closing.

---


## 2026-05-27 — Iteration 2 closure + competition-sprint retro

**Source:** docs/plans/iteration-2-feedback-loop/review.md + docs/plans/competition-sprint/review.md

### Lesson 6: Unstaged working-tree changes invisible to git diff

**Gap:** D2 (README technique mention) was written to disk but never staged. Two review passes showed no diff for README.md.

**Root cause:** `git diff main...branch` only shows committed changes.

**Role:** `/project-manager`

**Fix applied to:**
- `.claude/commands/project-manager.md` — added principle 5: close-iteration `git status` gate

**Prevented by:** `/project-manager` now requires `git status` before declaring iteration done.

---

### Lesson 7: MCP-path tests need parity with REST for shared handlers

**Gap:** compare_brew 0.82 live-link tested in REST but not MCP. MCP wiring could regress silently.

**Role:** `/test-engineer`

**Fix applied to:**
- `.claude/commands/test-engineer.md` — added principle 5: MCP/REST test parity

**Prevented by:** `/test-engineer` now enforces test parity across handler surfaces.

---

### Lesson 8: Data-migration scripts need documentation headers

**Gap:** 700-line scraper shipped with no target env docs, idempotency note, or production usage.

**Role:** `/backend-architect`

**Fix applied to:**
- `.claude/commands/backend-architect.md` — added principle 6: script contract headers
- `scripts/scrape-roasters.ts` — added full header

**Prevented by:** `/backend-architect` now requires doc headers on standalone data-writing scripts.

---

### Lesson 9: Roadmap reconciliation must ship with merge

**Gap:** Phase 6 items + landing page shipped but unchecked in roadmap for days.

**Role:** `/project-manager`

**Fix applied to:**
- `.claude/commands/project-manager.md` — added principle 6: roadmap reconciliation as close-iteration step

**Prevented by:** `/project-manager` now requires roadmap tick-off as part of iteration close.

## 2026-05-27 — Hermes session retro: dotfile skills gap + commit protocol enforcement

### Lesson 10: Hermes sessions need explicit bridge to Claude Code persona files

**Gap:** A full Hermes session ran without loading any of the `~/.claude/commands/` personas (engineering-base, agentic-workflow, backend-architect, test-engineer, commit, review, retro). The agent was operating without the global engineering cadence.

**Root cause:** `~/.claude/commands/` files are Claude Code's dotfile system. Hermes doesn't auto-discover them.

**Role:** `/project-manager`

**Fix applied to:**
- Created `~/.hermes/skills/software-development/engineering-workflow/SKILL.md` — bridge skill that maps each persona file
- Added memory note to load `engineering-workflow` for any software project session
- Added principle 8 to `.claude/commands/project-manager.md` — requires loading the skill at session start

**Prevented by:** The project-manager persona now enforces loading the bridge skill at session start. The Hermes skill scanner picks up `engineering-workflow` automatically.

### Lesson 11: PR merge on COMMENTED without addressing Copilot comments

**Gap:** PR #5 had 12 Copilot comments (bugs including typo, JSON.parse crash, missing validation, false idempotency claims, JSONB spec drift). Merge was attempted before addressing them.

**Root cause:** The project commit skill protocol was not followed. COMMENTED state was treated as "approved" rather than "has comments worth reading."

**Role:** `/project-manager`

**Fix applied to:**
- Added principle 7 to `.claude/commands/project-manager.md` — commit protocol enforcement
- All 12 Copilot comments addressed and threads resolved before merge
- JSONB migration created (technique: TEXT → JSONB), AeroPress typo fixed, validation added, formatRatio precision fixed, idempotency claims corrected

**Prevented by:** The project-manager now requires: surface comments → triage → fix → resolve threads → merge. The commit protocol is not optional.

---

## 2026-06-04 — llm-technique-extraction + origin-brew-profiles (feat branches)

**Source:** `/code-review` run on full diff `main...feat/origin-brew-profiles` (7 finder angles, 6 verifiers, 10 confirmed findings, 5 fixed pre-commit)

---

### Lesson 12: Upsert fallback paths must guard against overwriting confident/curated rows

**Gap:** `generateAndUpsertProfile` in `origin-profile.ts` unconditionally upserted a zero-value, `confident:false` placeholder when the LLM returned null — including over rows that were previously curated (`source:'curated'`, `confident:true`). A cron run on a transient LLM failure would permanently degrade those rows to method defaults until the next successful run.

**Root cause:** The `upsertOriginBrewProfile` call in the null-LLM path had no pre-check on the existing row's trust state. Prisma's `upsert` `update:` branch applies all mapped fields unconditionally.

**Role:** `/backend-architect`

**Fix applied to:**
- `src/lib/origin-profile.ts` — added `const existing = await getOriginBrewProfile(...)` guard before the placeholder upsert; skips write if `existing?.confident || existing?.source === 'curated'`
- `.claude/commands/backend-architect.md` — added principle 7: guard upsert fallback paths

**Prevented by:** `/backend-architect` principle 7 now requires a trust-state check before any failure-placeholder upsert.

---

### Lesson 13: Fetch a DB row once per request — hoist and reuse, don't re-query

**Gap:** `computeBestBrew` in `recommend.ts` called `getOriginBrewProfile` twice for the same `(origin, roast_level, method.id)` triple — once inside the no-community `else` branch (via `getOrTriggerOriginProfile`) and once unconditionally after it for `source_attribution`. If the two calls disagreed (concurrent write between them), the response could contain `confidence:'medium'` with `source_attribution:'No community data yet'` — a contradictory, misleading result.

**Root cause:** The profile result from the first call was scoped inside an `else` block and not hoisted to the outer function scope for reuse.

**Role:** `/backend-architect`

**Fix applied to:**
- `src/lib/recommend.ts` — declared `let resolvedProfile` before the if/else; community paths make exactly one `getOriginBrewProfile` call; no-community path reuses `resolvedProfile`
- `.claude/commands/backend-architect.md` — added principle 8: fetch once, hoist and reuse

**Prevented by:** `/backend-architect` principle 8 now requires hoisting shared DB row fetches to outer scope.

---

### Lesson 14: REST handler side effects must be mirrored in the equivalent MCP handler

**Gap:** `POST /brews` fires `extractTechnique` in a fire-and-forget block when notes are present and technique is absent. The MCP `log_brew` tool performed the same addBrew operation but never had this block — a silent parity gap. MCP-logged brews permanently lack technique enrichment.

**Root cause:** When the fire-and-forget was added to the REST handler, the MCP handler was not audited. They share `addBrew` but have separate code paths for any surrounding logic.

**Role:** `/backend-architect`

**Fix applied to:**
- `src/routes/mcp.ts` — added identical `if (!params.technique && params.notes)` fire-and-forget block with `extractTechnique` + `updateBrewTechnique`
- `.claude/commands/backend-architect.md` — added principle 9: mirror side effects to MCP handlers

**Prevented by:** `/backend-architect` principle 9 now requires a grep of `mcp.ts` whenever a fire-and-forget is added to a REST route.

---

### Lesson 15: Multi-field fetch triggers must listen on all required fields

**Gap:** `onOriginBSelect` in `landing/index.html` fetches `/tasting-suggestions` requiring origin + roast + method. It only fired on origin selection. When origin was selected before method, the guard returned early and chips never pre-populated — with no retry mechanism.

**Root cause:** The guard was correct (can't fetch without method) but only one field had a listener. The method `change` event was wired to `renderTechniqueFields` but not to retriggering the suggestion fetch.

**Role:** `/frontend-dev`

**Fix applied to:**
- `landing/index.html` — added `change` listener on `methodB` that calls `onOriginBSelect(origin)` when an origin is already set
- `.claude/commands/frontend-dev.md` — created (new file); added principle 1: multi-field fetch triggers

**Prevented by:** `/frontend-dev` principle 1 now requires listeners on all N fields when a fetch depends on N fields.

---

### Lesson 16: Normalize both sides before comparison — don't mix raw pool with lowercased store

**Gap:** The chip dropdown's `showSuggestions` checked `!window._tastingChips.includes(n)` where `n` is the raw pool string. `addChip` stores notes as `.toLowerCase()`. Pool entries like `'Bright'` were never excluded even after `'bright'` was already chipped — silent duplicate suggestions.

**Root cause:** `addChip` normalizes on write but the read-side comparison did not match.

**Role:** `/frontend-dev`

**Fix applied to:**
- `landing/index.html` — changed to `!window._tastingChips.includes(n.toLowerCase())`
- `.claude/commands/frontend-dev.md` — added principle 2: normalize both sides before comparison

**Prevented by:** `/frontend-dev` principle 2 now flags any `includes()` comparison where the stored value and the pool value use different normalization.

---

### Lesson 17: Fire-and-forget side effects need test coverage on MCP handler surface, not just REST

**Gap:** The `extractTechnique` fire-and-forget in `POST /brews` had tests (AC-TST-5/6 in `brewing.test.ts`). The equivalent MCP `log_brew` handler had no test asserting the fire-and-forget was triggered — and the gap wasn't detected until the `/code-review` run.

**Root cause:** Test parity principle (Lesson 7) covered happy-path response values. It didn't explicitly extend to side-effect behavior (fire-and-forget calls).

**Role:** `/test-engineer`

**Fix applied to:**
- `.claude/commands/test-engineer.md` — added principle 6: fire-and-forget side effects must be tested on both REST and MCP surfaces

**Prevented by:** `/test-engineer` principle 6 now requires explicit fire-and-forget trigger tests for MCP handlers, not just REST.

---

### Lesson 18: Changing seed data field semantics is a contract change — audit consumers before committing

**Gap:** All `notes` fields in `scrape-roasters.ts` were replaced with tasting descriptors (`'floral, citrus, bright'`). `backfill-technique.ts` calls `extractTechnique(method, notes)` on every seeded brew — it now passes pure flavor strings that contain no technique signal, making every LLM call return null. The backfill is a complete no-op post-change, silently wasting LLM credit.

**Root cause:** The notes format change was made to fix tasting-note aggregation without auditing which scripts consumed the `notes` field for a different purpose.

**Role:** `/backend-architect`

**Fix applied to:**
- `.claude/commands/backend-architect.md` — added principle 10: changing seed data field semantics requires consumer audit

**Prevented by:** `/backend-architect` principle 10 now requires grepping for all consumers of a field before changing its content format.

---

## 2026-06-04 — Copilot review on PR #10 (iterations 5-6)

**Source:** Copilot PR review on `feat/origin-brew-profiles` (8 comments; 7 fixed, 1 advisory)

---

### Lesson 19: Boolean false defaults must not be unconditionally included in technique submission objects

**Gap:** `buildTechniqueObject()` in `landing/index.html` unconditionally set `filter_rinse: false` (Chemex), `preheat_water: false` (Moka Pot), and `inverted: false` (AeroPress) even when the user didn't touch any technique input. This made the technique object non-empty on every AeroPress/Chemex/Moka brew, causing the server to treat it as a user-submitted technique and skip LLM extraction — even when the user wanted the LLM to extract from notes.

**Root cause:** Boolean fields that default to `false` were included in the object unconditionally. The server decides "was technique submitted" by checking `Object.keys(technique).length > 0` — any `false` field defeats this check.

**Role:** `/frontend-dev`

**Fix applied to:**
- `landing/index.html` — `filter_rinse` and `preheat_water` now only included when `true`; `inverted` only included when the user explicitly chose Inverted (`value === 'true'`)
- `.claude/commands/frontend-dev.md` — added principle 4: boolean form fields with a false default must never be unconditionally added to the submission object

**Prevented by:** `/frontend-dev` principle 4 now states: only include boolean technique fields when they carry a positive signal (`true` or an explicit non-default choice).

---

### Lesson 20: Use `== null` not falsy check when validating LLM-parsed numeric fields

**Gap:** `generateOriginBrewProfile` validated required numeric fields with `!parsed.water_temp_c || !parsed.ratio || !parsed.brew_time_s`. This would incorrectly reject a valid `0` value — discarding a correct LLM response silently.

**Root cause:** Falsy checking (`!value`) conflates "field is absent" with "field is zero/false/empty." LLM response parsing is a boundary where this surfaces: the model returns a coherent result with a valid numeric field, but the parser discards it.

**Role:** `/backend-architect`

**Fix applied to:**
- `src/lib/llm.ts` — changed to `== null` checks for all numeric fields in `generateOriginBrewProfile`
- `.claude/commands/backend-architect.md` — added principle 11: use `== null` not `!value` for numeric field presence checks in LLM response parsing

**Prevented by:** `/backend-architect` principle 11 now requires `== null` for all presence checks on numeric fields in LLM response parsers.

---

### Lesson 21: Fire-and-forget LLM generation must write a placeholder row before the LLM call

**Gap:** `getOrTriggerOriginProfile()` fired the LLM call before writing any row to the DB. Under burst traffic for an unknown (origin, roast, method) combo, every concurrent request would see no row and trigger its own LLM generation — potentially N parallel Haiku calls for the same key.

**Root cause:** The `needs_review` placeholder was only written in the else branch — *after* the LLM call completed (2-5 seconds). During the LLM latency window, concurrent requests see no row and each trigger a new generation.

**Role:** `/backend-architect`

**Fix applied to:**
- `src/lib/origin-profile.ts` — `getOrTriggerOriginProfile` now writes the `needs_review` placeholder as the first step inside the fire-and-forget, before calling `generateOriginBrewProfile`; concurrent requests hit the `existing?.confident === false` path and return null immediately
- `.claude/commands/backend-architect.md` — added principle 12: fire-and-forget LLM generation must write a placeholder row before the async call

**Prevented by:** `/backend-architect` principle 12 now requires placeholder-before-LLM pattern for all fire-and-forget generation flows.

---

### Lesson 22: LLM-calling scripts must pre-filter inputs for signal before the API call

**Gap:** `backfill-technique.ts` called `extractTechnique()` on every brew with non-null `notes`. After the `scrape-roasters.ts` notes were changed to tasting descriptors, every call to the backfill returns null — burning LLM credits on inputs with zero technique signal.

**Root cause:** No guard existed between "has notes" and "notes contain technique information." The two properties were conflated.

**Role:** `/backend-architect`

**Fix applied to:**
- `scripts/backfill-technique.ts` — added `TECHNIQUE_SIGNAL` regex heuristic; skips notes with no technique keywords before calling `extractTechnique`
- `.claude/commands/backend-architect.md` — added principle 13: LLM-calling scripts must pre-filter inputs for signal before the API call

**Prevented by:** `/backend-architect` principle 13 now requires a pre-filter heuristic on any script that maps a text field through an LLM call.
