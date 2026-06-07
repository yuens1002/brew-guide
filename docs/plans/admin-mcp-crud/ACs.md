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
| AC-FN-14 | D1, D2 | `create_brew` tool creates a new brew | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `addBrew({ brewing_method_id, origin, roast_level, ... })` called; tool returns `{ created: true, record: { id, origin, ... } }` with a new numeric `id` | | | |
| AC-FN-15 | D1, D2 | `get_brew` returns the brew when it exists | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `getBrewById(id)` called; tool returns `{ found: true, record: { id, origin, ... } }` | | | |
| AC-FN-16 | D1, D2 | `get_brew` on non-existent ID → not-found response | Code review: `src/lib/db.ts` | `getBrewById(99999)` returns null; tool returns `{ found: false, error: 'Not found' }` | | | |
| AC-FN-17 | D1, D2 | `list_brews` returns brews with optional filters | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `getBrews({ origin: 'Ethiopia', limit: 5 })` called; tool returns `{ records: [...], count: N }` | | | |
| AC-FN-18 | D1, D2 | `create_origin` creates a new origin | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `createOrigin({ name: 'Yirgacheffe', region: 'Ethiopia' })` calls `prisma.origin.create`; tool returns `{ created: true, record: { id, name, region, is_verified: false, ... } }` | | | |
| AC-FN-19 | D1, D2 | `get_origin` returns the origin when it exists | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `getOriginById(id)` called; tool returns `{ found: true, record: { id, name, region, ... } }` | | | |
| AC-FN-20 | D1, D2 | `get_origin` on non-existent ID → not-found response | Code review: `src/lib/db.ts` | `getOriginById(99999)` returns null; tool returns `{ found: false, error: 'Not found' }` | | | |
| AC-FN-21 | D1, D2 | `list_origins` returns all origins | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `getOrigins()` called; tool returns `{ records: [...], count: N }` | | | |
| AC-FN-22 | D1, D2 | `create_origin_profile` creates a new profile | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `createOriginBrewProfile({ origin, roast_level, brewing_method_id, water_temp_c, ... })` calls `prisma.originBrewProfile.create`; tool returns `{ created: true, record: { id, origin, ... } }` | | | |
| AC-FN-23 | D1, D2 | `get_origin_profile` returns the profile when it exists | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `getOriginBrewProfileById(id)` called; tool returns `{ found: true, record: { id, origin, source, ... } }` | | | |
| AC-FN-24 | D1, D2 | `get_origin_profile` on non-existent ID → not-found response | Code review: `src/lib/db.ts` | `getOriginBrewProfileById(99999)` returns null; tool returns `{ found: false, error: 'Not found' }` | | | |
| AC-FN-25 | D1, D2 | `list_origin_profiles` returns profiles with optional filters | Code review: `src/lib/db.ts` + `src/routes/admin.ts` | `listOriginBrewProfiles({ source: 'curated' })` called; tool returns `{ records: [...], count: N }` | | | |

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
| AC-TST-9 | D1, D2, D4 | `create_brew` tool → `db.addBrew` called, `{ created: true }` in response | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts `vi.mocked(addBrew)` called with correct data; response JSON contains `{ created: true, record: { id, ... } }` | | | |
| AC-TST-10 | D1, D2, D4 | `get_brew` tool — found → `db.getBrewById` called, `{ found: true }` in response | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts `vi.mocked(getBrewById)` called with id; response contains `{ found: true, record: { id, ... } }` | | | |
| AC-TST-11 | D1, D2, D4 | `get_brew` tool — not found → `{ found: false }` in response | Test run: `npm test` | `src/__tests__/admin.test.ts` mocks `getBrewById` to return null; response contains `{ found: false, error: 'Not found' }` | | | |
| AC-TST-12 | D1, D2, D4 | `create_origin` tool → `db.createOrigin` called, `{ created: true }` in response | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts `vi.mocked(createOrigin)` called with correct data; response contains `{ created: true, record: { id, name, ... } }` | | | |
| AC-TST-13 | D1, D2, D4 | `list_origins` tool → `db.getOrigins` called, `{ records, count }` in response | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts `vi.mocked(getOrigins)` called; response contains `{ records: [...], count: N }` | | | |
| AC-TST-14 | D1, D2, D4 | `create_origin_profile` tool → `db.createOriginBrewProfile` called, `{ created: true }` in response | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts `vi.mocked(createOriginBrewProfile)` called with correct data; response contains `{ created: true, record: { id, origin, ... } }` | | | |
| AC-TST-15 | D1, D2, D4 | `list_origin_profiles` tool with filter → `db.listOriginBrewProfiles` called, `{ records, count }` in response | Test run: `npm test` | `src/__tests__/admin.test.ts` asserts `vi.mocked(listOriginBrewProfiles)` called; response contains `{ records: [...], count: N }` | | | |

---

## Regression Acceptance Criteria

| AC | Plan ref | What | How | Pass | Agent | QC | Reviewer |
|----|----------|------|-----|------|-------|----|----------|
| AC-REG-1 | — | All existing tests continue to pass | Test run: `npm test` | 94+ tests pass, 0 failures | | | |
| AC-REG-2 | — | TypeScript strict mode clean | Test run: `npx tsc --noEmit` | 0 errors | | | |
