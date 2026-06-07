# Backend Architect — coffee-brew-inference-experiment

> Inherits from `/engineering-base` and the global `~/.claude/commands/backend-architect.md` baseline.
> Apply global principles first; project-specific rules below take precedence where they conflict.

## Project stack

- Hono 4 + `@hono/node-server`, TypeScript strict, ESM, Node 24 (pinned via `nixpacks.toml` + `package.json engines`)
- MCP: `@modelcontextprotocol/sdk` + `@hono/mcp` (Streamable HTTP)
- DB: Neon Postgres + Prisma ORM (`DATABASE_URL` env var; direct connection URL for Railway)
- See `docs/architecture/overview.md` for the full module map

## Project-specific principles

### 1. Keep `src/index.ts` side-effect-free — server startup belongs in `src/server.ts`

`src/index.ts` is the **pure app module**: it mounts routes and exports the Hono app. It must never bind a port, start a server, or log startup messages. Side effects in `index.ts` break test imports.

`src/server.ts` is the **dedicated entrypoint**: it imports `app` from `index.ts` and calls `serve()`. It is the only file that starts the server.

Rule: if you're adding server lifecycle code (port binding, startup logging, graceful shutdown), it goes in `server.ts` — never in `index.ts`.

### 2. Do not use `import.meta.url` for "is this the main module?" checks

The `import.meta.url === \`file://${process.argv[1]}\`` guard does not work on Windows — path formats differ (`file:///C:/...` vs `C:\...`). It silently skips the startup block, so the server never starts.

Use a dedicated entrypoint file instead of a conditional guard. This is cleaner, cross-platform, and makes the module graph explicit.

### 3. DB layer is the only Prisma boundary

All database access must go through `src/lib/db.ts`. Route handlers call `getBrewingMethods()` / `addBrew()` — never `new PrismaClient()` directly in routes. This keeps the Prisma singleton isolated, which is why tests can mock `../lib/db.js` and never touch the real DB.

### 4. MCP tool handlers are stateless and created per-request

`buildMcpServer()` in `src/routes/mcp.ts` is called on every POST to `/mcp`. This is intentional — Streamable HTTP is stateless. Do not cache the server or transport instance across requests.

### 5. Origin policy is enforced in `src/lib/mcp-common.ts:checkOrigin`

Allowed: no `Origin` header (direct MCP clients), `*.yuens.me`, `localhost` (any port).
Blocked: everything else → 403.

Do not duplicate this logic in individual route handlers — call `checkOrigin(c)` at the top of each protected handler.

### 7. Guard upsert fallback paths against overwriting confident or curated rows

When a function upserts a "failure placeholder" row (e.g., `confident: false`, `source: 'needs_review'`, zero-value params), always check whether the existing row is already in a higher-trust state before writing. The pattern:

```typescript
const existing = await getRow(key);
if (existing?.confident || existing?.source === 'curated') return existing;
await upsert({ ...failurePlaceholder });
```

Without this guard, a transient LLM failure (network hiccup, rate limit) will silently degrade a carefully curated row to useless zeros. The Prisma `upsert` `update:` branch overwrites all mapped fields unconditionally — it has no concept of "don't downgrade."

Applies to: any table with a `confident: boolean` or trust-tier field where a background job can write failure states.

### 8. Fetch a DB row once per request — hoist and reuse, don't re-query

When the same DB row is needed in multiple logical sections of the same request handler, fetch it once before the branch and pass the reference through. Never issue a second query for the same `(key)` within a single async function execution.

Anti-pattern: fetch inside an `else` branch, then fetch again unconditionally after the branch for a different consumer (e.g. source attribution). If the two calls disagree (concurrent write between them), the response will contain contradictory values (e.g. `confidence: 'medium'` + `source_attribution: 'No community data yet'`).

Pattern:
```typescript
let resolvedProfile: Profile | null = null;
// ... set it inside the branch that fetches it
// For paths that didn't set it, fetch once here:
const profile = topN.length > 0 ? await getProfile(key) : resolvedProfile;
```

### 9. Any side-effect wired to a REST handler must be mirrored in the equivalent MCP handler

Fire-and-forget enrichment (technique extraction, link creation, background jobs) added to a REST handler must also be added to the MCP handler that performs the same logical operation. These are independently wired and do not share code paths.

Checklist when adding a fire-and-forget to a REST route:
1. Search `src/routes/mcp.ts` for a tool that maps to the same domain operation.
2. If found, add the same fire-and-forget block there.
3. Verify both paths have a test that asserts the background call was triggered (or explicitly documents why parity isn't needed).

Failure mode without this: MCP-logged brews permanently lack enrichment (technique, links, profiles) that REST-logged brews receive, silently producing a two-tier data quality split between ingestion paths.

### 10. Changing seed data field semantics invalidates dependent scripts — audit before changing

Before replacing the content format of a seed data field (e.g., changing `notes` from technique prose to tasting descriptors), grep every script that reads that field and verify each still has what it needs.

```bash
grep -r "\.notes" scripts/
```

In this project the `notes` field in `scrape-roasters.ts` powered `extractTechnique` in `backfill-technique.ts`. Replacing it with tasting descriptors made the backfill a complete no-op — 30+ LLM calls that return null and waste credit.

Rule: a field format change is a contract change. Treat it like an API breaking change: find all consumers, update or deprecate them in the same commit.

### 11. Use `== null` not `!value` when validating LLM-parsed numeric fields

When checking whether a numeric field is present in a parsed LLM response, use `value == null` (or `typeof value !== 'number'`), never `!value`. Falsy checks reject `0` — a valid numeric value — causing the entire response to be discarded even when the model returned a coherent result.

Anti-pattern:
```typescript
if (!parsed.water_temp_c || !parsed.ratio || !parsed.brew_time_s) return null;
// Rejects water_temp_c=0, ratio=0, brew_time_s=0 — even if they're valid in context
```

Correct pattern:
```typescript
if (parsed.water_temp_c == null || parsed.ratio == null || parsed.brew_time_s == null) return null;
```

Rule: any field that could legitimately hold `0`, `false`, or an empty string must be tested for presence with `== null`, not truthiness. LLM response parsing is a boundary where this mistake surfaces most often — the model returns a correct response, but the parser discards it silently.

---

### 12. Fire-and-forget LLM generation must write a placeholder row before the async call

When a function fires-and-forgets a background LLM generation for a given key (e.g. `(origin, roast_level, method_id)`), write a `needs_review` / `pending` placeholder row into the DB **inside the fire-and-forget, before calling the LLM**. This row acts as a lock: concurrent requests for the same key see an existing row and short-circuit immediately, preventing duplicate parallel LLM calls.

Anti-pattern:
```typescript
Promise.resolve()
  .then(() => callLlm(key))         // LLM call takes 2-5s; concurrent requests see no row
  .then(async (result) => {
    if (result) await upsert({ ...result, source: 'generated' });
    else await upsert({ ...zeros, source: 'needs_review' }); // placeholder written too late
  }).catch(() => {});
```

Correct pattern:
```typescript
Promise.resolve()
  .then(async () => {
    await upsert({ ...zeros, source: 'needs_review', confident: false }); // lock first
    const result = await callLlm(key);
    if (result) await upsert({ ...result, source: 'generated', confident: true });
    // If null: placeholder remains as needs_review — cron will retry
  }).catch(() => {});
```

Rule: the placeholder write and the LLM call are both inside the fire-and-forget (non-blocking to the request). Subsequent requests hit the DB read path, find the `needs_review` row, and return null without triggering a second generation.

---

### 13. LLM-calling scripts must pre-filter inputs for signal before the API call

Before calling an LLM extraction function in a batch script, apply a cheap text heuristic to skip inputs that contain no signal. Sending tasting-descriptor notes (`'floral, citrus, bright'`) to `extractTechnique` will almost always return null, burning API credit for no gain.

Pattern:
```typescript
const TECHNIQUE_SIGNAL = /\b(bloom|pour|steep|brew|°|bar|pressure|stage|grind|preinfusion|agit|swirl|stir|inverted|yield|rinse|plunge|drawdown|preheat|second|minute)\b/i;
if (!TECHNIQUE_SIGNAL.test(brew.notes)) { skipped++; continue; }
```

Rule: any script that maps a text field through an LLM call must have a pre-filter that guards against inputs where the LLM is guaranteed (or near-certain) to return null. The filter cost is a regex match; the unguarded cost is an API call per row.

---

### 14. Extract shared utility functions to `src/lib/` — never copy-paste between sibling modules

When adding a utility function (regex, filter, classifier) to a DB layer or a recommendation/engine layer, grep `src/lib/` for an identical or near-identical copy before writing. If found, extract to a dedicated shared utility file (e.g., `src/lib/flavor-utils.ts`) and import from both sides.

Triggered by: `TASTING_NOTE_NOISE` + `isFlavorNote` copy-pasted into both `db.ts` and `recommend.ts`. The global `/tasting-notes` endpoint and per-recommendation note aggregation would have diverged silently when the noise-word list evolved.

Rule: one definition, imported everywhere. A grep before writing costs seconds; a silent divergence in a noise filter costs a confusing support bug.

### 15. Sync the Zod schema when adding a field to a request-body interface

When `tasting_notes` (or any field) is added to the `Brew` TypeScript interface — documented as "POST /brews request body, stored row" — immediately check whether `brewSchema` in `src/routes/brewing.ts` also needs the field. If the interface says clients can send it and the schema doesn't list it, the field is silently stripped by Zod.

Rule: any field added to an interface that documents a request body must be added to the corresponding Zod schema in the same commit. Exception: server-only fields (e.g., `id`, `created_at`, `source` with a server default) — document those explicitly as server-populated if kept on the interface.

### 16. Verify hardcoded numeric method IDs in seed data against SEED_METHODS order

`brewing_method_id: 3` means Aeropress only if Aeropress is the third entry in `SEED_METHODS`. When seeding brew entries by method block, cross-check the ID against `SEED_METHODS`'s position, not against the block comment.

The ground truth check: do the actual data parameters (ratio, brew_time_s, grind_size, temp) match the named method's defaults in `SEED_METHODS`? If `ratio: 0.5` and `brew_time_s: 27` and `grind_size: 'fine'` appear under `// Aeropress` but Aeropress defaults are `ratio: 0.067 / brew_time: 120s / grind: medium-fine`, the ID is wrong regardless of the comment.

Triggered by: 10 espresso brews seeded with `brewing_method_id: 3` (Aeropress) — skewed Aeropress recommendations and contaminated technique consensus.

### 6. Scraper/data-migration scripts must document their contract

When a standalone script writes to a database or API (e.g., `scripts/scrape-roasters.ts`), add a header comment block that documents: (1) the target database/endpoint and required env vars, (2) whether the script is idempotent, (3) how to run it against production. Scripts without this context get run against the wrong target — the header costs 5 lines and prevents a production data incident. Discovered when the scraper shipped as a 700-line script with no target environment documentation.
