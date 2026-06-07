# ACs: Admin Protected MCP CRUD

**Plan ref:** `docs/plans/admin-mcp-crud/plan.md`
**Branch:** `feat/admin-mcp-crud`

---

## Functional Acceptance Criteria

| AC | Plan ref | What | How | Pass | Agent | QC | Reviewer |
|----|----------|------|-----|------|-------|----|----------|
| AC-FN-1 | D2 | POST /admin/mcp with no `Authorization` header → 401 | Code review: `src/routes/admin.ts` adminAuth middleware | Middleware returns `{ error: 'Unauthorized' }` with status 401 when Authorization header is absent | | | |
| AC-FN-2 | D2 | POST /admin/mcp with wrong token → 401 | Code review: `src/routes/admin.ts` | Middleware returns 401 when `Authorization: Bearer wrong-token`; does not reach MCP handler | | | |
| AC-FN-3 | D2 | POST /admin/mcp with correct token → MCP server responds | Code review: `src/routes/admin.ts` | Request with correct bearer token reaches `buildAdminMcpServer()` and receives a valid MCP response | | | |
| AC-FN-4 | D1, D2 | `update_brew` tool updates a brew field | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `updateBrew(id, { rating: 5 })` calls `prisma.brew.update`; tool returns `{ updated: true, record: { id, rating: 5, ... } }` | | | |
| AC-FN-5 | D1, D2 | `update_brew` on non-existent ID → not-found response | Code review: `src/lib/db.ts` | `updateBrew(99999, {...})` catches P2025 and returns null; tool returns `{ updated: false, error: 'Not found' }` | | | |
| AC-FN-6 | D1, D2 | `delete_brew` tool deletes a brew | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `deleteBrew(id)` calls `prisma.brew.delete`; tool returns `{ deleted: true, id }` | | | |
| AC-FN-7 | D1, D2 | `delete_brew` on non-existent ID → not-found response | Code review: `src/lib/db.ts` | `deleteBrew(99999)` catches P2025 and returns false; tool returns `{ deleted: false, error: 'Not found' }` | | | |
| AC-FN-8 | D1, D2 | `update_origin` updates an origin field | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `updateOrigin(id, { is_verified: true })` calls `prisma.origin.update`; tool returns `{ updated: true, record: { id, is_verified: true, ... } }` | | | |
| AC-FN-9 | D1, D2 | `delete_origin` deletes an origin | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `deleteOrigin(id)` calls `prisma.origin.delete`; tool returns `{ deleted: true, id }` | | | |
| AC-FN-10 | D1, D2 | `update_origin_profile` updates a profile and can set source to 'curated' | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `updateOriginBrewProfile(id, { source: 'curated', confident: true })` calls `prisma.originBrewProfile.update`; tool returns `{ updated: true, record: { id, source: 'curated', ... } }` | | | |
| AC-FN-11 | D1, D2 | `delete_origin_profile` deletes a profile | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `deleteOriginBrewProfile(id)` calls `prisma.originBrewProfile.delete`; tool returns `{ deleted: true, id }` | | | |
| AC-FN-12 | D2 | `ADMIN_TOKEN` not set → POST /admin/mcp returns 401 | Code review: `src/routes/admin.ts` adminAuth | When `process.env.ADMIN_TOKEN` is undefined/empty, all MCP requests return `{ error: 'Admin not configured' }` with 401 — fails closed, not open | | | |
| AC-FN-13 | D3 | Admin endpoint mounted at `/admin/mcp` | Code review: `src/index.ts` | `app.route('/admin', adminRoutes)` is present; `GET /admin/health` returns `{ status: 'ok' }` | | | |

---

## Test Coverage Acceptance Criteria

| AC | Plan ref | What | How | Pass | Agent | QC | Reviewer |
|----|----------|------|-----|------|-------|----|----------|
| AC-TST-1 | D2, D4 | POST /admin/mcp — no auth header → 401 | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts response status === 401, body contains `error` field | | | |
| AC-TST-2 | D2, D4 | POST /admin/mcp — wrong token → 401 | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts response status === 401 for `Authorization: Bearer bad-token` | | | |
| AC-TST-3 | D1, D2, D4 | `update_brew` tool with valid token → `db.updateBrew` called, result in response | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts `vi.mocked(updateBrew)` was called with correct id + data; MCP response JSON contains `{ updated: true }` | | | |
| AC-TST-4 | D1, D2, D4 | `delete_brew` tool with valid token → `db.deleteBrew` called, `{ deleted: true }` in response | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts `vi.mocked(deleteBrew)` called with id; response JSON contains `{ deleted: true, id }` | | | |
| AC-TST-5 | D1, D2, D4 | `update_origin` tool → `db.updateOrigin` called | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts `vi.mocked(updateOrigin)` called; response contains `{ updated: true }` | | | |
| AC-TST-6 | D1, D2, D4 | `delete_origin` tool → `db.deleteOrigin` called | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts `vi.mocked(deleteOrigin)` called with id; response contains `{ deleted: true }` | | | |
| AC-TST-7 | D1, D2, D4 | `update_origin_profile` tool → `db.updateOriginBrewProfile` called | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts `vi.mocked(updateOriginBrewProfile)` called; response contains `{ updated: true }` | | | |
| AC-TST-8 | D1, D2, D4 | `delete_origin_profile` tool → `db.deleteOriginBrewProfile` called | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts `vi.mocked(deleteOriginBrewProfile)` called with id; response contains `{ deleted: true }` | | | |

---

## Regression Acceptance Criteria

| AC | Plan ref | What | How | Pass | Agent | QC | Reviewer |
|----|----------|------|-----|------|-------|----|----------|
| AC-REG-1 | — | All existing tests continue to pass | Test run: `npm test` | 94+ tests pass, 0 failures | | | |
| AC-REG-2 | — | TypeScript strict mode clean | Test run: `npx tsc --noEmit` | 0 errors | | | |
