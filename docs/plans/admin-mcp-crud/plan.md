# Plan: Admin Protected MCP CRUD

**Branch:** `feat/admin-mcp-crud`
**Scope:** Edit + Delete operations for brews, origins, and origin_brew_profiles via a protected MCP endpoint at `/admin/mcp`. No UI. No create/list (public endpoints already cover those).

---

## Motivation

"For dev work, seed is okay, but we really need the CRUD for db ops moving forward. I don't want us to keep figuring out what happens to data that we corrected." — existing admin operations (fixing mislabeled records, curating origin profiles, pruning bad brews) are done via seed scripts or raw DB access. A protected admin MCP endpoint lets Claude perform these operations directly, with a proper audit trail.

---

## Deliverables

| ID | Artifact | Kind | Role |
|----|----------|------|------|
| D1 | `src/lib/db.ts` — 6 admin write functions | DB layer | `/backend-architect` |
| D2 | `src/routes/admin.ts` — protected MCP endpoint, 6 tools | endpoint + MCP | `/backend-architect` |
| D3 | `src/index.ts` — mount `/admin` route | wiring | `/backend-architect` |
| D4 | `src/__tests__/admin.test.ts` — auth + tool tests | tests | `/test-engineer` |
| D5 | `docs/API-SPEC.md` — admin MCP section | docs | `/backend-architect` |

---

## D1 — New DB functions (`src/lib/db.ts`)

Six new exported functions added after the existing read functions for each domain:

```typescript
// Brews
export async function updateBrew(
  id: number,
  data: Partial<Pick<Brew, 'origin' | 'variety' | 'roast_level' | 'grind_size' |
    'water_temp_c' | 'ratio' | 'brew_time_s' | 'rating' | 'notes' | 'tasting_notes'>>
): Promise<Brew | null>   // null if not found

export async function deleteBrew(id: number): Promise<boolean>  // false if not found

// Origins
export async function updateOrigin(
  id: number,
  data: Partial<Pick<Origin, 'name' | 'region' | 'subregion' | 'variety' | 'aliases' | 'is_verified'>>
): Promise<Origin | null>

export async function deleteOrigin(id: number): Promise<boolean>

// Origin brew profiles
export async function updateOriginBrewProfile(
  id: number,
  data: Partial<Pick<OriginBrewProfile, 'water_temp_c' | 'ratio' | 'brew_time_s' |
    'grind_size' | 'tasting_notes' | 'technique' | 'source' | 'confident'>>
): Promise<OriginBrewProfile | null>

export async function deleteOriginBrewProfile(id: number): Promise<boolean>
```

Implementation notes:
- Each `update*` uses `prisma.X.update({ where: { id }, data })` inside a try/catch on `Prisma.PrismaClientKnownRequestError` with code `P2025` (record not found) → return null.
- Each `delete*` uses `prisma.X.delete({ where: { id } })` with the same P2025 guard → return false.
- No cascade logic needed — origin strings in brews are denormalized (not FK).

---

## D2 — `src/routes/admin.ts`

### Auth middleware

```typescript
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function adminAuth(c: Context): Response | null {
  if (!ADMIN_TOKEN) return c.json({ error: 'Admin not configured' }, 401);
  const auth = c.req.header('Authorization');
  if (!auth || auth !== `Bearer ${ADMIN_TOKEN}`)
    return c.json({ error: 'Unauthorized' }, 401);
  return null;
}
```

Applied to every POST + OPTIONS handler on the admin route. GET `/admin/health` is unprotected (for ping tests).

### MCP tools registered

| Tool | Inputs | DB call |
|------|--------|---------|
| `update_brew` | `id: number`, `rating?`, `origin?`, `roast_level?`, `grind_size?`, `water_temp_c?`, `ratio?`, `brew_time_s?`, `notes?`, `tasting_notes?` | `updateBrew(id, data)` |
| `delete_brew` | `id: number` | `deleteBrew(id)` |
| `update_origin` | `id: number`, `name?`, `region?`, `subregion?`, `variety?`, `aliases?`, `is_verified?` | `updateOrigin(id, data)` |
| `delete_origin` | `id: number` | `deleteOrigin(id)` |
| `update_origin_profile` | `id: number`, `water_temp_c?`, `ratio?`, `brew_time_s?`, `grind_size?`, `tasting_notes?`, `source?`, `confident?` | `updateOriginBrewProfile(id, data)` |
| `delete_origin_profile` | `id: number` | `deleteOriginBrewProfile(id)` |

All tools return `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`.

- Update success: `{ updated: true, record: <updated row> }`
- Update not-found: `{ updated: false, error: 'Not found' }`
- Delete success: `{ deleted: true, id }`
- Delete not-found: `{ deleted: false, error: 'Not found' }`

### Route shape

```typescript
const adminApp = new Hono();
adminApp.options('/*', (c) => new Response(null, { status: 204, headers: corsHeaders }));
adminApp.get('/health', (c) => c.json({ status: 'ok' }));
adminApp.all('/*', async (c) => {
  const authErr = adminAuth(c);
  if (authErr) return authErr;
  // build + serve MCP server (same pattern as mcp.ts)
});
export default adminApp;
```

### Origin policy

Reuse `checkOrigin` from `src/lib/mcp-common.ts` — same allowed origins as public MCP. Admin endpoint does NOT need to restrict origins further (the token is the gate).

---

## D3 — `src/index.ts`

```typescript
import adminRoutes from './routes/admin.js';
// After existing route mounts:
app.route('/admin', adminRoutes);
```

No rate limiter on `/admin` (token is the auth gate; rate limiting would interfere with bulk operations like fixing 32 brews).

---

## D4 — `src/__tests__/admin.test.ts`

Follows the same pattern as `mcp-tools.test.ts`:
- `vi.mock('../lib/db.js', ...)` — mock all DB functions
- `callAdminMcp()` helper using `adminApp.request('/mcp', { method: 'POST', headers: { Authorization: 'Bearer test-token', ... }, body: ... })`
- `process.env.ADMIN_TOKEN = 'test-token'` set in `beforeAll`

See ACs doc for the 8 test cases.

---

## D5 — `docs/API-SPEC.md`

Add section after existing `/mcp` section:

```
## Admin MCP Endpoint

`POST /admin/mcp` — protected admin tools (edit + delete).

**Auth:** `Authorization: Bearer <ADMIN_TOKEN>` (env var). Returns 401 if missing or wrong.
**Origin policy:** same as public MCP (localhost, *.yuens.me, no-origin allowed).

### Tools
- update_brew
- delete_brew
- update_origin
- delete_origin
- update_origin_profile
- delete_origin_profile
```

---

## Out of scope (explicitly)

- Create brew / create origin — handled by `POST /brews` and `POST /origins` (future)
- List/read — handled by `GET /brews`, `GET /origins`, etc.
- UI — no UI, tool-only
- Rate limiting on admin endpoint — token is the gate
- Auth rotation / multi-token — single `ADMIN_TOKEN` env var is sufficient for now

---

## Commit Schedule

1. `docs: add plan + ACs for admin-mcp-crud`
2. `feat(admin): add updateBrew/deleteBrew/updateOrigin/deleteOrigin/updateOriginBrewProfile/deleteOriginBrewProfile to db.ts`
3. `feat(admin): protected MCP endpoint at /admin/mcp with 6 admin tools`
4. `test(admin): auth gate + 6 tool tests`
5. `docs(admin): API-SPEC admin MCP section`
