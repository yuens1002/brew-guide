# Test Engineer — coffee-brew-inference-experiment

> Inherits from `/engineering-base` and the global `~/.claude/commands/test-engineer.md` baseline.
> Apply global principles first; project-specific rules below take precedence where they conflict.

## Project stack

- **Test runner**: Vitest (`npm test` = `vitest run`)
- **Test files**: `src/__tests__/*.test.ts`
- **Framework**: Hono 4 (use `app.request()` / `route.request()` — no running server needed)
- **DB**: Neon Postgres + Prisma ORM — see mocking rule below

## Project-specific principles

### 1. Always mock `src/lib/db.js` — never let the Prisma client run in tests

The Prisma client requires a live `DATABASE_URL` pointing to Neon. It will fail or make real DB calls in Vitest's worker environment. Every test file that imports any route module must mock the DB layer at the top:

```ts
vi.mock('../lib/db.js', () => ({
  getBrewingMethods: vi.fn(),
  addBrew: vi.fn(),
  getOrigins: vi.fn(),
}))
```

`vi.mock()` is hoisted by Vitest before imports, so declaration order doesn't matter — but it must be present in every file that transitively depends on `db.ts`.

### 2. Import route modules directly — never `src/server.ts`

`src/server.ts` binds port 4000 on import. It must never be imported in tests.

- ✅ `import brewingRoutes from '../routes/brewing.js'`
- ✅ `import mcpRoute from '../routes/mcp.js'`
- ✅ `import app from '../index.js'` (`src/index.ts` is side-effect-free)
- ❌ `import '../server.js'` — starts the server, breaks the test environment

### 3. MCP endpoint test pattern (Streamable HTTP / SSE)

The MCP route returns SSE (`event: message\ndata: {...}`). Always include the required `Accept` header and use this parse helper:

```ts
const MCP_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/event-stream',
}

async function callMcp(method: string, params: Record<string, unknown>, id = 1) {
  const res = await mcpRoute.request('/', {
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  const text = await res.text()
  const dataLine = text.split('\n').find((l) => l.startsWith('data:'))
  if (!dataLine) throw new Error(`No SSE data line:\n${text}`)
  return JSON.parse(dataLine.slice('data: '.length))
}
```

Tool call results are nested: `data.result.content[0].text` (a JSON string — parse again for structured tool output).

### 4. Test commands

```bash
npm test           # vitest run — CI mode, single pass
npm run test:watch # vitest — watch mode for TDD
```

### 6. Fire-and-forget side effects must be tested on BOTH REST and MCP handler surfaces

When a fire-and-forget (technique extraction, link creation, background LLM call) is added to a REST handler, add a corresponding test for the MCP handler that covers the same trigger condition — not just the happy-path response.

Minimum test pattern for each fire-and-forget path:
- **REST:** assert the background call is triggered (mock the function, check it was called / not called based on the condition)
- **MCP:** assert the same trigger condition results in the same background call

Without this, an MCP handler can silently skip the fire-and-forget (a separate code path) and no test will catch it. The gap surfaces only in production when MCP-logged data lacks enrichment that REST-logged data has.

Discovered: `mcp.ts` `log_brew` had no `extractTechnique` fire-and-forget while `brewing.ts` `POST /brews` did. No test caught the omission because MCP tests only asserted the response body.

### 5. MCP-path tests must mirror REST-path coverage

When a feature adds a handler to both a REST route and an MCP tool that share the same underlying DB call, the MCP-path test must cover the same happy-path cases as the REST test — not just the fallback. The two handlers are wired separately; a coverage gap in the MCP path allows silent regressions in the wiring without any test failure. Enforce parity during AC authoring, not during review. Discovered when `compare_brew` MCP was tested for the 0.5 fallback but not the 0.82 live-link case that the REST test covered.

Regression gate: `npm test` must show 0 failures before any commit touching `src/`.
