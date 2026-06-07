# Plan: Admin Protected MCP CRUD

**Branch:** `feat/admin-mcp-crud`
**Scope:** Full CRUD (create, read, update, delete) for brews, origins, and origin_brew_profiles via a protected MCP endpoint at `/admin/mcp`. No UI. Auth via `Authorization: Bearer <ADMIN_TOKEN>`.

---

## Motivation

"For dev work, seed is okay, but we really need the CRUD for db ops moving forward. I don't want us to keep figuring out what happens to data that we corrected." — existing admin operations (fixing mislabeled records, curating origin profiles, pruning bad brews) are done via seed scripts or raw DB access. A protected admin MCP endpoint lets Claude perform these operations directly, with a proper audit trail. Full CRUD means Claude can also add new origins and profiles without touching seed scripts.

---

## Deliverables

| ID | Artifact | Kind | Role |
|----|----------|------|------|
| D1 | `src/lib/db.ts` — 11 admin functions (5 new + 6 new write, reuse 5 existing) | DB layer | `/backend-architect` |
| D2 | `src/routes/admin.ts` — protected MCP endpoint, 15 tools | endpoint + MCP | `/backend-architect` |
| D3 | `src/index.ts` — mount `/admin` route | wiring | `/backend-architect` |
| D4 | `src/__tests__/admin.test.ts` — auth + tool tests | tests | `/test-engineer` |
| D5 | `docs/API-SPEC.md` — admin MCP section | docs | `/backend-architect` |

---

## D1 — DB functions (`src/lib/db.ts`)

### Reused (no changes needed)

| Function | Used by tool |
|----------|-------------|
| `addBrew(brew)` | `create_brew` |
| `getBrewById(id)` | `get_brew` |
| `getBrews(filters?)` | `list_brews` |
| `getOrigins()` | `list_origins` |

### New read functions

```typescript
export async function getOriginById(id: number): Promise<Origin | null>
// prisma.origin.findUnique({ where: { id } }) → map to Origin shape; null if not found

export async function getOriginBrewProfileById(id: number): Promise<OriginBrewProfile | null>
// prisma.originBrewProfile.findUnique({ where: { id } }) → mapProfile(); null if not found

export async function listOriginBrewProfiles(filters?: {
  origin?: string;
  roast_level?: string;
  brewing_method_id?: number;
  source?: string;
}): Promise<OriginBrewProfile[]>
// prisma.originBrewProfile.findMany({ where: { ...filters } }) → rows.map(mapProfile)
```

### New create functions

```typescript
export async function createOrigin(
  data: Pick<Origin, 'name' | 'region'> &
    Partial<Pick<Origin, 'subregion' | 'variety' | 'aliases' | 'is_verified'>>
): Promise<Origin>
// prisma.origin.create({ data: { ...data, is_verified: data.is_verified ?? false } })
// Map to Origin shape

export async function createOriginBrewProfile(
  data: Omit<OriginBrewProfile, 'id' | 'generated_at' | 'last_verified'>
): Promise<OriginBrewProfile>
// prisma.originBrewProfile.create({ data: { ...data, technique: data.technique ?? Prisma.JsonNull } })
// mapProfile() on the result
```

### New write functions (update + delete)

```typescript
// Brews
export async function updateBrew(
  id: number,
  data: Partial<Pick<Brew, 'origin' | 'variety' | 'roast_level' | 'grind_size' |
    'water_temp_c' | 'ratio' | 'brew_time_s' | 'rating' | 'notes' | 'tasting_notes'>>
): Promise<Brew | null>   // null if not found (P2025)

export async function deleteBrew(id: number): Promise<boolean>  // false if not found (P2025)

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
- `createOriginBrewProfile` is an explicit create, NOT an upsert — callers should use `getOriginBrewProfile` first to check for duplicates.

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

### MCP tools registered (15 total)

#### Brews (5 tools)

| Tool | Required inputs | Optional inputs | DB call |
|------|----------------|-----------------|---------|
| `create_brew` | `brewing_method_id: number`, `origin: string`, `roast_level: string`, `grind_size: string`, `water_temp_c: number`, `ratio: number`, `brew_time_s: number`, `rating: number` | `notes?`, `tasting_notes?` | `addBrew(data)` |
| `get_brew` | `id: number` | — | `getBrewById(id)` |
| `list_brews` | — | `origin?`, `method?: number`, `limit?: number` | `getBrews(filters)` |
| `update_brew` | `id: number` | `rating?`, `origin?`, `roast_level?`, `grind_size?`, `water_temp_c?`, `ratio?`, `brew_time_s?`, `notes?`, `tasting_notes?` | `updateBrew(id, data)` |
| `delete_brew` | `id: number` | — | `deleteBrew(id)` |

#### Origins (5 tools)

| Tool | Required inputs | Optional inputs | DB call |
|------|----------------|-----------------|---------|
| `create_origin` | `name: string`, `region: string` | `subregion?`, `variety?`, `aliases?`, `is_verified?: boolean` | `createOrigin(data)` |
| `get_origin` | `id: number` | — | `getOriginById(id)` |
| `list_origins` | — | — | `getOrigins()` |
| `update_origin` | `id: number` | `name?`, `region?`, `subregion?`, `variety?`, `aliases?`, `is_verified?` | `updateOrigin(id, data)` |
| `delete_origin` | `id: number` | — | `deleteOrigin(id)` |

#### Origin Brew Profiles (5 tools)

| Tool | Required inputs | Optional inputs | DB call |
|------|----------------|-----------------|---------|
| `create_origin_profile` | `origin: string`, `roast_level: string`, `brewing_method_id: number`, `water_temp_c: number`, `ratio: number`, `brew_time_s: number`, `grind_size: string`, `tasting_notes: string` | `source?: string`, `confident?: boolean` | `createOriginBrewProfile(data)` |
| `get_origin_profile` | `id: number` | — | `getOriginBrewProfileById(id)` |
| `list_origin_profiles` | — | `origin?`, `roast_level?`, `brewing_method_id?: number`, `source?` | `listOriginBrewProfiles(filters)` |
| `update_origin_profile` | `id: number` | `water_temp_c?`, `ratio?`, `brew_time_s?`, `grind_size?`, `tasting_notes?`, `source?`, `confident?` | `updateOriginBrewProfile(id, data)` |
| `delete_origin_profile` | `id: number` | — | `deleteOriginBrewProfile(id)` |

### Tool response shapes

All tools return `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`.

- Create success: `{ created: true, record: <row> }`
- Get found: `{ found: true, record: <row> }`
- Get not-found: `{ found: false, error: 'Not found' }`
- List: `{ records: [...], count: N }`
- Update success: `{ updated: true, record: <row> }`
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

See ACs doc for test cases.

---

## D5 — `docs/API-SPEC.md`

Add section after existing `/mcp` section:

```
## Admin MCP Endpoint

`POST /admin/mcp` — protected admin tools (full CRUD).

**Auth:** `Authorization: Bearer <ADMIN_TOKEN>` (env var). Returns 401 if missing or wrong.
**Origin policy:** same as public MCP (localhost, *.yuens.me, no-origin allowed).

### Tools

#### Brews
- create_brew, get_brew, list_brews, update_brew, delete_brew

#### Origins
- create_origin, get_origin, list_origins, update_origin, delete_origin

#### Origin Brew Profiles
- create_origin_profile, get_origin_profile, list_origin_profiles, update_origin_profile, delete_origin_profile
```

---

## Out of scope (explicitly)

- UI — no UI, tool-only
- Rate limiting on admin endpoint — token is the gate
- Auth rotation / multi-token — single `ADMIN_TOKEN` env var is sufficient for now
- Cascade deletes — origin strings in brews are denormalized; deleting an origin does not touch brews

---

## Commit Schedule

1. `docs: update plan + ACs for admin-mcp-crud — expand to full CRUD`
2. `feat(admin): add new DB functions for admin CRUD (getOriginById, createOrigin, getOriginBrewProfileById, listOriginBrewProfiles, createOriginBrewProfile, updateBrew, deleteBrew, updateOrigin, deleteOrigin, updateOriginBrewProfile, deleteOriginBrewProfile)`
3. `feat(admin): protected MCP endpoint at /admin/mcp with 15 admin tools`
4. `test(admin): auth gate + tool tests`
5. `docs(admin): API-SPEC admin MCP section`
