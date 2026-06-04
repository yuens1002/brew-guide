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

### 6. Scraper/data-migration scripts must document their contract

When a standalone script writes to a database or API (e.g., `scripts/scrape-roasters.ts`), add a header comment block that documents: (1) the target database/endpoint and required env vars, (2) whether the script is idempotent, (3) how to run it against production. Scripts without this context get run against the wrong target — the header costs 5 lines and prevents a production data incident. Discovered when the scraper shipped as a 700-line script with no target environment documentation.
