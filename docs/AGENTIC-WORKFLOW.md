# Agentic Workflow — coffee-brew-inference-experiment

Every feature or iteration follows this sequence before merging to `main`. Phases are listed in order; each phase gates the next.

---

## Phases

### 1. Plan
- Create `docs/plans/{feature-name}/plan.md` — context, scope tracks (A/B/C…), files touched, commit schedule, out of scope
- Create `docs/plans/{feature-name}/ACs.md` — functional, test coverage, docs, and regression ACs in table form
- ACs are authored **alongside** the plan, never after
- Register branch in `.claude/verification-status.json` with `"status": "planning"`
- Owner: `/project-manager`, `/backend-architect`

### 2. Implement
- Follow the commit schedule in `plan.md`
- Each commit maps to a named track item (A1, B2, etc.)
- Skill: `/backend-architect` (or `/frontend-dev` for UI work)
- Update `verification-status.json` → `"status": "implementing"`

### 3. Test
- Write tests that cover every `AC-TST-*` row in ACs.md
- Run `npm test` — 0 failures required to advance
- Run `npx tsc --noEmit` — 0 type errors required to advance
- Skill: `/test-engineer`

### 4. Verify ACs
- Walk every AC row in ACs.md; mark each pass or fail
- Functional ACs: verify via curl, DB query, or code review as specified in the "How" column
- Test ACs: evidence is `npm test` output
- Docs ACs: code review of updated files
- Regression ACs: re-run test suite + build + any manual spot checks
- Create `docs/plans/{feature-name}/review.md` with the full verification report
- Update `verification-status.json` → `"status": "verified"`, `acs_passed`, `acs_total`
- Skill: `/backend-architect` (functional), `/test-engineer` (test evidence)

### 5. Review
- Run `/review` (or `/code-review`) against the branch diff
- Flag correctness issues, unintended regressions, DRY violations
- Fix any blocking findings before proceeding
- Update `review.md` with review findings and resolutions

### 6. Changelog + Docs
- Append entry to `CHANGELOG.md` under the correct version heading — describe what changed and why, not how
- Update `docs/API-SPEC.md` for any new/changed endpoints or response shapes
- Update `docs/architecture/overview.md` for any new modules or changed data flows
- Update `docs/roadmap.md` — mark completed items ✅, note next iteration
- Skill: `/project-manager`

### 7. npm Version Bump
- `npm version patch|minor|major` — match semver convention:
  - `patch`: bug fixes, non-breaking internal changes
  - `minor`: new features, new endpoints, backwards-compatible
  - `major`: breaking API or schema changes
- Commit the version bump separately: `chore(release): v{version}`

### 8. PR
- Run `/commit` (or create PR manually via `gh pr create`)
- PR title: `{type}({scope}): {short description}` — mirrors the primary commit
- PR body: summary bullets + test plan checklist
- Link the relevant plan in `docs/plans/`

### 9. Copilot Review / Resolve
- Address all Copilot inline comments
- Resolve threads once addressed
- Do not merge with open review threads

### 10. Merge
- Squash merge to `main`
- Delete feature branch after merge
- Update `verification-status.json` → `"status": "merged"`

### 11. Retro
- Create `docs/plans/{feature-name}/retro.md`
- Capture: what went well, what was surprising, what to carry forward
- Update any relevant project-local skills in `.claude/commands/` if the retro surfaces a repeatable principle
- Skill: `/retro`

---

## Verification Status

Tracked in `.claude/verification-status.json`. Valid statuses:

| Status | Meaning |
|--------|---------|
| `planning` | Plan + ACs authored, branch registered |
| `implementing` | Code in progress |
| `testing` | Tests being written/run |
| `verified` | All ACs checked, review.md written |
| `merged` | Squash-merged to main |

---

## Current branch naming convention

`feat/{descriptive-name}` — named by the body of work, not iteration number.

Examples: `feat/llm-technique-extraction`, `feat/neon-prisma-migration`, `feat/vote-endpoint`
