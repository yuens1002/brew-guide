import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { corsHeaders, checkOrigin } from '../lib/mcp-common.js';
import {
  addBrew, getBrewById, getBrews,
  updateBrew, deleteBrew,
  getOrigins, getOriginById, createOrigin,
  updateOrigin, deleteOrigin,
  getOriginBrewProfileById, listOriginBrewProfiles, createOriginBrewProfile,
  updateOriginBrewProfile, deleteOriginBrewProfile,
} from '../lib/db.js';

function adminAuth(c: Context): Response | null {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return c.json({ error: 'Admin not configured' }, 401, corsHeaders) as unknown as Response;
  const auth = c.req.header('Authorization');
  if (!auth || auth !== `Bearer ${token}`)
    return c.json({ error: 'Unauthorized' }, 401, corsHeaders) as unknown as Response;
  return null;
}

function buildAdminMcpServer(): McpServer {
  const server = new McpServer({ name: 'coffee-brew-admin-mcp', version: '1.0.0' });

  // ── Brews ────────────────────────────────────────────────

  server.registerTool('create_brew', {
    title: 'Create Brew',
    description: 'Add a new brew record to the database',
    inputSchema: {
      brewing_method_id: z.number().int().describe('Brewing method ID'),
      origin: z.string().describe('Coffee origin (e.g. Ethiopia)'),
      roast_level: z.string().describe('Roast level (light, medium, dark)'),
      grind_size: z.string().describe('Grind size'),
      water_temp_c: z.number().describe('Water temperature in Celsius'),
      ratio: z.number().describe('Coffee-to-water ratio (e.g. 0.0625)'),
      brew_time_s: z.number().int().describe('Brew time in seconds'),
      rating: z.number().int().min(1).max(5).describe('Rating 1-5'),
      variety: z.string().optional().describe('Coffee variety'),
      notes: z.string().optional().describe('Brew notes'),
      tasting_notes: z.string().optional().describe('Comma-separated tasting notes'),
    },
  }, async (params) => {
    const record = await addBrew({
      brewing_method_id: params.brewing_method_id,
      origin: params.origin,
      roast_level: params.roast_level,
      grind_size: params.grind_size,
      water_temp_c: params.water_temp_c,
      ratio: params.ratio,
      brew_time_s: params.brew_time_s,
      rating: params.rating,
      variety: params.variety,
      notes: params.notes,
      tasting_notes: params.tasting_notes,
      source: 'user_submitted',
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify({ created: true, record }) }] };
  });

  server.registerTool('get_brew', {
    title: 'Get Brew',
    description: 'Get a brew record by ID',
    inputSchema: { id: z.number().int().describe('Brew ID') },
  }, async ({ id }) => {
    const record = await getBrewById(id);
    if (!record) return { content: [{ type: 'text' as const, text: JSON.stringify({ found: false, error: 'Not found' }) }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify({ found: true, record }) }] };
  });

  server.registerTool('list_brews', {
    title: 'List Brews',
    description: 'List brew records with optional filters',
    inputSchema: {
      origin: z.string().optional().describe('Filter by origin'),
      method: z.number().int().optional().describe('Filter by brewing method ID'),
      limit: z.number().int().optional().describe('Max results (default: all)'),
    },
  }, async (params) => {
    const result = await getBrews(params);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ records: result.brews, count: result.count }) }] };
  });

  server.registerTool('update_brew', {
    title: 'Update Brew',
    description: 'Update fields on a brew record',
    inputSchema: {
      id: z.number().int().describe('Brew ID'),
      origin: z.string().optional(),
      variety: z.string().optional(),
      roast_level: z.string().optional(),
      grind_size: z.string().optional(),
      water_temp_c: z.number().optional(),
      ratio: z.number().optional(),
      brew_time_s: z.number().int().optional(),
      rating: z.number().int().min(1).max(5).optional(),
      notes: z.string().optional(),
      tasting_notes: z.string().optional(),
    },
  }, async ({ id, ...data }) => {
    const record = await updateBrew(id, data);
    if (!record) return { content: [{ type: 'text' as const, text: JSON.stringify({ updated: false, error: 'Not found' }) }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify({ updated: true, record }) }] };
  });

  server.registerTool('delete_brew', {
    title: 'Delete Brew',
    description: 'Delete a brew record by ID',
    inputSchema: { id: z.number().int().describe('Brew ID') },
  }, async ({ id }) => {
    const ok = await deleteBrew(id);
    if (!ok) return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: false, error: 'Not found' }) }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true, id }) }] };
  });

  // ── Origins ──────────────────────────────────────────────

  server.registerTool('create_origin', {
    title: 'Create Origin',
    description: 'Add a new coffee origin to the database',
    inputSchema: {
      name: z.string().describe('Origin name (e.g. Yirgacheffe)'),
      region: z.string().describe('Region or country (e.g. Ethiopia)'),
      subregion: z.string().optional().describe('Sub-region'),
      variety: z.string().optional().describe('Variety (e.g. heirloom)'),
      aliases: z.string().optional().describe('Comma-separated alternate spellings'),
      is_verified: z.boolean().optional().describe('Mark as verified (default false)'),
    },
  }, async (params) => {
    const record = await createOrigin(params);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ created: true, record }) }] };
  });

  server.registerTool('get_origin', {
    title: 'Get Origin',
    description: 'Get a coffee origin by ID',
    inputSchema: { id: z.number().int().describe('Origin ID') },
  }, async ({ id }) => {
    const record = await getOriginById(id);
    if (!record) return { content: [{ type: 'text' as const, text: JSON.stringify({ found: false, error: 'Not found' }) }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify({ found: true, record }) }] };
  });

  server.registerTool('list_origins', {
    title: 'List Origins',
    description: 'List all coffee origins',
    inputSchema: {},
  }, async () => {
    const records = await getOrigins();
    return { content: [{ type: 'text' as const, text: JSON.stringify({ records, count: records.length }) }] };
  });

  server.registerTool('update_origin', {
    title: 'Update Origin',
    description: 'Update fields on a coffee origin',
    inputSchema: {
      id: z.number().int().describe('Origin ID'),
      name: z.string().optional(),
      region: z.string().optional(),
      subregion: z.string().optional(),
      variety: z.string().optional(),
      aliases: z.string().optional(),
      is_verified: z.boolean().optional(),
    },
  }, async ({ id, ...data }) => {
    const record = await updateOrigin(id, data);
    if (!record) return { content: [{ type: 'text' as const, text: JSON.stringify({ updated: false, error: 'Not found' }) }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify({ updated: true, record }) }] };
  });

  server.registerTool('delete_origin', {
    title: 'Delete Origin',
    description: 'Delete a coffee origin by ID',
    inputSchema: { id: z.number().int().describe('Origin ID') },
  }, async ({ id }) => {
    const ok = await deleteOrigin(id);
    if (!ok) return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: false, error: 'Not found' }) }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true, id }) }] };
  });

  // ── Origin Brew Profiles ─────────────────────────────────

  server.registerTool('create_origin_profile', {
    title: 'Create Origin Brew Profile',
    description: 'Add a new origin brew profile (curated or generated)',
    inputSchema: {
      origin: z.string().describe('Origin name'),
      roast_level: z.string().describe('Roast level'),
      brewing_method_id: z.number().int().describe('Brewing method ID'),
      water_temp_c: z.number().describe('Water temperature in Celsius'),
      ratio: z.number().describe('Coffee-to-water ratio'),
      brew_time_s: z.number().int().describe('Brew time in seconds'),
      grind_size: z.string().describe('Grind size'),
      tasting_notes: z.string().describe('Comma-separated tasting notes'),
      source: z.enum(['curated', 'llm_generated', 'needs_review']).optional().describe('Profile source (default: curated)'),
      confident: z.boolean().optional().describe('Mark as confident (default: true for curated)'),
    },
  }, async (params) => {
    const source = params.source ?? 'curated';
    const confident = params.confident ?? source === 'curated';
    const record = await createOriginBrewProfile({
      origin: params.origin,
      roast_level: params.roast_level,
      brewing_method_id: params.brewing_method_id,
      water_temp_c: params.water_temp_c,
      ratio: params.ratio,
      brew_time_s: params.brew_time_s,
      grind_size: params.grind_size,
      tasting_notes: params.tasting_notes,
      technique: null,
      source,
      confident,
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify({ created: true, record }) }] };
  });

  server.registerTool('get_origin_profile', {
    title: 'Get Origin Brew Profile',
    description: 'Get an origin brew profile by ID',
    inputSchema: { id: z.number().int().describe('Profile ID') },
  }, async ({ id }) => {
    const record = await getOriginBrewProfileById(id);
    if (!record) return { content: [{ type: 'text' as const, text: JSON.stringify({ found: false, error: 'Not found' }) }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify({ found: true, record }) }] };
  });

  server.registerTool('list_origin_profiles', {
    title: 'List Origin Brew Profiles',
    description: 'List origin brew profiles with optional filters',
    inputSchema: {
      origin: z.string().optional().describe('Filter by origin name'),
      roast_level: z.string().optional().describe('Filter by roast level'),
      brewing_method_id: z.number().int().optional().describe('Filter by brewing method ID'),
      source: z.enum(['curated', 'llm_generated', 'needs_review']).optional().describe('Filter by source'),
    },
  }, async (params) => {
    const records = await listOriginBrewProfiles(params);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ records, count: records.length }) }] };
  });

  server.registerTool('update_origin_profile', {
    title: 'Update Origin Brew Profile',
    description: 'Update fields on an origin brew profile',
    inputSchema: {
      id: z.number().int().describe('Profile ID'),
      water_temp_c: z.number().optional(),
      ratio: z.number().optional(),
      brew_time_s: z.number().int().optional(),
      grind_size: z.string().optional(),
      tasting_notes: z.string().optional(),
      source: z.enum(['curated', 'llm_generated', 'needs_review']).optional(),
      confident: z.boolean().optional(),
    },
  }, async ({ id, ...data }) => {
    const record = await updateOriginBrewProfile(id, data);
    if (!record) return { content: [{ type: 'text' as const, text: JSON.stringify({ updated: false, error: 'Not found' }) }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify({ updated: true, record }) }] };
  });

  server.registerTool('delete_origin_profile', {
    title: 'Delete Origin Brew Profile',
    description: 'Delete an origin brew profile by ID',
    inputSchema: { id: z.number().int().describe('Profile ID') },
  }, async ({ id }) => {
    const ok = await deleteOriginBrewProfile(id);
    if (!ok) return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: false, error: 'Not found' }) }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true, id }) }] };
  });

  return server;
}

const adminApp = new Hono();

adminApp.options('/*', (c) => {
  const originErr = checkOrigin(c);
  if (originErr) return originErr;
  return new Response(null, { status: 204, headers: corsHeaders });
});

adminApp.get('/health', (c) => c.json({ status: 'ok' }));

adminApp.post('/*', async (c) => {
  const originErr = checkOrigin(c);
  if (originErr) return originErr;

  const authErr = adminAuth(c);
  if (authErr) return authErr;

  const server = buildAdminMcpServer();
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

export default adminApp;
