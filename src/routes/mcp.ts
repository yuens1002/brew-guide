import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import { z } from 'zod';
import { corsHeaders, checkOrigin } from '../lib/mcp-common.js';
import { getBrewingMethods, getBrews, getBrewById, addBrew, getBrewLinks, updateBrewTechnique } from '../lib/db.js';
import { computeBestBrew, tryLinkBrew, resolveOrigin } from '../lib/recommend.js';
import { extractTechnique, generateNarrative } from '../lib/llm.js';
import type { Brew } from '../types.js';

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'coffee-brew-mcp', version: '2.0.1' });

  // Tool 1: get_brewing_methods
  server.registerTool(
    'get_brewing_methods',
    {
      title: 'Get Brewing Methods',
      description: 'Returns all available coffee brewing methods with default parameters',
      inputSchema: {},
    },
    async () => {
      const methods = await getBrewingMethods();
      return { content: [{ type: 'text' as const, text: JSON.stringify(methods) }] };
    },
  );

  // Tool 2: recommend
  server.registerTool(
    'recommend',
    {
      title: 'Recommend Brew Parameters',
      description: 'Get a community-consensus brew recommendation. Returns brew parameters (temp, ratio, grind, time), confidence tier (high/medium/low based on community data), sources, method-specific technique guidance (e.g. bloom timing, pour stages, steep time), tasting_notes — a frequency-weighted flavor profile aggregated from community brews or the origin brew profile (sorted by count descending; lead your response with the top 3–5 as the primary cup profile), tasting_notes_summary (a pre-formatted sentence you can embed directly), and source_attribution — a human-readable string explaining the data path (e.g. "Based on 5 community brews", "Origin profile informed this recommendation", "No community data yet — using Pour Over defaults"). Surface source_attribution prominently so the user understands how confident to be.',
      inputSchema: {
        origin: z.string().optional().describe('Coffee origin (e.g. Colombia, Ethiopia)'),
        roast_level: z.string().optional().describe('Roast level (light, medium, dark)'),
        brewing_method_id: z.number().optional().describe('Preferred brewing method ID'),
        grind_size: z.string().optional().describe('Preferred grind size'),
        variety: z.string().optional().describe('Coffee variety (e.g. heirloom, robusta, SL28)'),
        include_narrative: z.boolean().optional().describe('Set true to include an LLM-generated step-by-step brew guide (only returned when confidence is medium or high)'),
      },
    },
    async ({ origin, roast_level, brewing_method_id, grind_size, variety, include_narrative }) => {
      const resolvedOrigin = origin ? (await resolveOrigin(origin)).resolved : undefined;
      try {
        const result = await computeBestBrew({ origin: resolvedOrigin, roast_level, brewing_method_id, grind_size, variety });
        const top = result.tasting_notes.slice(0, 5);
        const rest = result.tasting_notes.slice(5);
        const tasting_notes_summary = top.length > 0
          ? `Most noted: ${top.map(n => n.note).join(', ')}${rest.length > 0 ? ` · Also present: ${rest.map(n => n.note).join(', ')}` : ''}`
          : '';
        let narrative: string | undefined;
        if (include_narrative && result.confidence !== 'low') {
          narrative = await generateNarrative({
            origin: result.input.origin,
            roastLevel: result.input.roast_level,
            methodName: result.brewing_method,
            params: result.input,
            technique: result.technique ?? null,
            tastingNotes: top.map(n => n.note),
          }) ?? undefined;
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ ...result, tasting_notes_summary, ...(narrative ? { narrative } : {}) }),
          }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Recommendation failed';
        return { content: [{ type: 'text' as const, text: msg }], isError: true };
      }
    },
  );

  // Tool 3: log_brew
  server.registerTool(
    'log_brew',
    {
      title: 'Log a Brew Experiment',
      description: 'Logs a real brew experience to the database',
      inputSchema: {
        brewing_method_id: z.number().describe('ID of the brewing method used'),
        origin: z.string().describe('Coffee origin (e.g. Colombia, Ethiopia)'),
        variety: z.string().optional().describe('Coffee variety (e.g. heirloom, SL28)'),
        roast_level: z.string().describe('Roast level (light, medium, medium-dark, dark)'),
        grind_size: z.string().describe('Grind size used'),
        water_temp_c: z.number().describe('Water temperature in Celsius'),
        ratio: z.number().describe('Coffee-to-water ratio (e.g. 0.0625 for 1:16)'),
        brew_time_s: z.number().describe('Brew time in seconds'),
        rating: z.number().int().min(1).max(5).describe('Rating from 1 to 5'),
        notes: z.string().optional().describe('Tasting notes or observations'),
        technique: z.object({}).passthrough().optional().describe('Structured technique object (bypasses LLM extraction when provided)'),
        source_url: z.string().url().optional().describe('Source URL for this brew data'),
        field_confidence: z.string().optional().describe('JSON-serialized per-field confidence scores'),
      },
    },
    async (params) => {
      const { resolved: resolvedOrigin, verified } = await resolveOrigin(params.origin);
      const originConfValue = verified ? 1.0 : resolvedOrigin !== params.origin ? 0.7 : 0.5;
      // Merge: spread user-supplied confidence, then overwrite with server-computed origin confidence
      let base: Record<string, unknown> = {};
      if (params.field_confidence) {
        try { base = JSON.parse(params.field_confidence); } catch { /* ignore invalid JSON */ }
      }
      const fieldConfidence = JSON.stringify({ ...base, origin: originConfValue });
      const brew = await addBrew({
        brewing_method_id: params.brewing_method_id,
        origin: resolvedOrigin,
        variety: params.variety,
        roast_level: params.roast_level,
        grind_size: params.grind_size,
        water_temp_c: params.water_temp_c,
        ratio: params.ratio,
        brew_time_s: params.brew_time_s,
        rating: params.rating,
        notes: params.notes,
        technique: params.technique as Brew['technique'],
        source_url: params.source_url,
        field_confidence: fieldConfidence,
      } as Omit<Brew, 'id' | 'created_at'>);
      tryLinkBrew(brew).catch(() => {}); // fire-and-forget implicit feedback link

      if (!params.technique && params.notes) {
        const brewId = brew.id;
        const methodId = params.brewing_method_id;
        const notes = params.notes;
        Promise.resolve()
          .then(() => getBrewingMethods())
          .then((methods) => {
            const method = methods?.find((m) => m.id === methodId);
            if (!method) return;
            return extractTechnique(method.name, notes)
              .then((technique) => technique && updateBrewTechnique(brewId, technique));
          })
          .catch(() => {});
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ id: brew.id, message: 'Brew record added successfully' }) }] };
    },
  );

  // Tool 4: search_brews
  server.registerTool(
    'search_brews',
    {
      title: 'Search Brew Logs',
      description: 'Search through logged brew experiences by origin or brewing method',
      inputSchema: {
        origin: z.string().optional().describe('Filter by coffee origin'),
        method: z.number().optional().describe('Filter by brewing method ID'),
        limit: z.number().optional().describe('Max number of results'),
      },
    },
    async (params) => {
      const result = await getBrews(params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  // Tool 5: compare_brew
  server.registerTool(
    'compare_brew',
    {
      title: 'Compare Brew to Baseline',
      description: 'Compares a logged brew against the standard method parameters',
      inputSchema: {
        brew_id: z.number().describe('ID of the brew to compare'),
      },
    },
    async ({ brew_id }) => {
      const brew = await getBrewById(brew_id);
      if (!brew) {
        return { content: [{ type: 'text' as const, text: 'Brew not found' }], isError: true };
      }

      const methods = await getBrewingMethods();
      const method = methods.find((m) => m.id === brew.brewing_method_id);

      const tempDelta = method ? brew.water_temp_c - method.default_temp_c : 0;
      const timeDelta = method ? brew.brew_time_s - method.default_brew_time_s : 0;

      const links = await getBrewLinks(brew.id);
      const matchScore = links.length > 0 ? links[0].match_confidence : 0.5;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              brew_id: brew.id,
              user_brew: {
                water_temp_c: brew.water_temp_c,
                ratio: brew.ratio,
                brew_time_s: brew.brew_time_s,
                grind_size: brew.grind_size,
                rating: brew.rating,
              },
              ai_recommendation: method
                ? {
                    water_temp_c: method.default_temp_c,
                    ratio: method.default_ratio,
                    brew_time_s: method.default_brew_time_s,
                    grind_size: method.grind_size,
                  }
                : null,
              analysis: method
                ? `Your water was ${tempDelta > 0 ? `${tempDelta}°C hotter` : `${Math.abs(tempDelta)}°C cooler`} and brew time ${timeDelta > 0 ? `${timeDelta}s longer` : `${Math.abs(timeDelta)}s shorter`} than the standard ${method.name} recommendation.`
                : 'No baseline method found for comparison.',
              match_score: matchScore,
            }),
          },
        ],
      };
    },
  );

  return server;
}

const mcpRoute = new Hono();

mcpRoute.options('*', (c) => {
  const originErr = checkOrigin(c);
  if (originErr) return originErr;
  return c.text('ok', 200, corsHeaders);
});

mcpRoute.post('*', async (c) => {
  const originErr = checkOrigin(c);
  if (originErr) return originErr;

  const server = buildMcpServer();
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);

  const response = await transport.handleRequest(c);
  if (!response) return c.json({ error: 'No response from MCP transport' }, 500, corsHeaders);

  response.headers.delete('mcp-session-id');
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
});

export default mcpRoute;
