# /review report — admin-mcp-crud

**Branch:** `feat/admin-mcp-crud`
**Generated:** 2026-06-07
**Iterations to reach verified:** 1

---

## Verdict

**Minor** — all 5 deliverables shipped, all 18 tests pass, and all AC-TST invariants are sound; two internal docs (`CLAUDE.md` key files table + `docs/architecture/overview.md` module map) don't list the new `src/routes/admin.ts` file. Fix before merge; proceed to human review.

---

## Deliverables ↔ Code

| Deliverable | Implementation | Status |
|-------------|----------------|--------|
| D1 — `src/lib/db.ts`: 11 admin functions | `src/lib/db.ts:425-584` (11 exported functions: `getOriginById`, `createOrigin`, `updateBrew`, `deleteBrew`, `updateOrigin`, `deleteOrigin`, `getOriginBrewProfileById`, `listOriginBrewProfiles`, `createOriginBrewProfile`, `updateOriginBrewProfile`, `deleteOriginBrewProfile`) | ✓ shipped |
| D2 — `src/routes/admin.ts`: protected MCP endpoint, 15 tools | `src/routes/admin.ts:1-307` (`buildAdminMcpServer()` registers 15 tools; `adminApp.all('/*')` runs `adminAuth` before MCP dispatch) | ✓ shipped |
| D3 — `src/index.ts`: mount `/admin` route | `src/index.ts:9` import + `src/index.ts:56-57` `app.route('/admin', adminRoutes)` | ✓ shipped |
| D4 — `src/__tests__/admin.test.ts`: auth + tool tests | `src/__tests__/admin.test.ts:1-405` (18 tests: 4 auth + 14 tool tests) | ✓ shipped |
| D5 — `docs/API-SPEC.md`: admin MCP section | `docs/API-SPEC.md` (42 lines added: tool tables for all 3 resources) | ✓ shipped |

### Code changes not tied to any deliverable

None. All 5 changed files map directly to a deliverable.

---

## ACs ↔ Tests (Gate 3 spot-check)

| AC | Test | Asserts invariant? | Notes |
|----|------|--------------------|-------|
| AC-TST-1 | `admin.test.ts` "no Authorization header → 401" | ✓ | Asserts `res.status === 401` + `body.error` defined — not vacuous |
| AC-TST-2 | `admin.test.ts` "wrong token → 401" | ✓ | Same shape; passes `'Bearer wrong-token'`, checks status + error field |
| AC-TST-3 | `admin.test.ts` "AC-TST-3: calls updateBrew, returns { updated: true, record }" | ✓ | `toHaveBeenCalledWith(42, { rating: 5 })` + `result.updated === true` + `result.record.rating === 5` — asserts both dispatch and response structure |
| AC-TST-4 | `admin.test.ts` "AC-TST-4: calls deleteBrew, returns { deleted: true, id }" | ✓ | `toHaveBeenCalledWith(42)` + `result.deleted === true` + `result.id === 42` |
| AC-TST-9 | `admin.test.ts` "AC-TST-9: calls addBrew, returns { created: true, record }" | ✓ | Uses `expect.objectContaining(...)` — asserts dispatch + response `created: true` and `record.id` |
| AC-TST-11 | `admin.test.ts` "not found → returns { found: false }" | ✓ | Mocks `getBrewById` to return `null`, asserts `found: false` + `error: 'Not found'` — tests the guard branch |
| AC-TST-12 | `admin.test.ts` "AC-TST-12: calls createOrigin, returns { created: true, record }" | ✓ | `expect.objectContaining(...)` on the call; checks `result.created === true` and `result.record.id` |
| AC-TST-15 | `admin.test.ts` "AC-TST-15: calls listOriginBrewProfiles with filters, returns { records, count }" | ✓ | Asserts `toHaveBeenCalledWith({ source: 'curated' })` — tests filter pass-through, not just response shape |

No weak or vacuously-passing tests found across the sampled ACs.

---

## Docs drift

### 1. `CLAUDE.md` — Key files table missing `src/routes/admin.ts`

`CLAUDE.md:18-23` lists key route files including `mcp.ts` but omits the new admin route:

```
| `src/routes/mcp.ts` | MCP tool handlers (...) |   ← listed
                                                         ← src/routes/admin.ts absent
```

The admin route is now a first-class endpoint (auth-protected, 15 tools) and belongs in this table.

**Fix:** Add row to the Key files table:
```
| `src/routes/admin.ts` | Admin MCP tools — protected CRUD at `/admin/mcp` (bearer token auth) |
```

### 2. `docs/architecture/overview.md` — Module map and request flow missing admin route

`docs/architecture/overview.md` module map lists `routes/brewing.ts` and `routes/mcp.ts` but not `routes/admin.ts`. The MCP request flow section also doesn't document the admin path.

**Fix:** Add to module map:
```
    admin.ts            → protected admin MCP endpoint (/admin/mcp): bearer token auth, 15 CRUD tools
```

Add admin request flow block after the MCP flow:
```
### Admin MCP (protected)
MCP Client → POST /admin/mcp
  → src/routes/admin.ts: checkOrigin → adminAuth (Bearer token) → buildAdminMcpServer()
  → tool handler: create/get/list/update/delete for brews, origins, origin_brew_profiles
  → src/lib/db.ts (Prisma → Neon Postgres)
```

---

## Recommendations

1. **Fix `CLAUDE.md` key files table** — add `src/routes/admin.ts` row before merge.
2. **Fix `docs/architecture/overview.md`** — add admin route to module map and request flow section before merge.

Both are one-line / one-block additions. No code changes.

---

## Inputs for /retro

- **Route:** `/backend-architect` → `.claude/commands/backend-architect.md`
  **Draft principle:** *"When adding a new route file to `src/routes/`, update `CLAUDE.md`'s Key files table and `docs/architecture/overview.md`'s module map + request flow section in the same commit. These two files are the developer on-ramp — a new route that isn't listed there is invisible to the next engineer. This is a D-deliverable: treat it the same as mounting the route in `index.ts`."*
  **Triggered by:** `src/routes/admin.ts` shipped without entries in `CLAUDE.md` key files table and `docs/architecture/overview.md` module map.
