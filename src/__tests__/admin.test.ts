import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Brew, Origin, OriginBrewProfile } from '../types.js';

vi.mock('../lib/db.js', () => ({
  addBrew: vi.fn(),
  getBrewById: vi.fn(),
  getBrews: vi.fn(),
  updateBrew: vi.fn(),
  deleteBrew: vi.fn(),
  getOrigins: vi.fn(),
  getOriginById: vi.fn(),
  createOrigin: vi.fn(),
  updateOrigin: vi.fn(),
  deleteOrigin: vi.fn(),
  getOriginBrewProfileById: vi.fn(),
  listOriginBrewProfiles: vi.fn(),
  createOriginBrewProfile: vi.fn(),
  updateOriginBrewProfile: vi.fn(),
  deleteOriginBrewProfile: vi.fn(),
}));

import adminApp from '../routes/admin.js';
import {
  addBrew, getBrewById, getBrews,
  updateBrew, deleteBrew,
  getOrigins, getOriginById, createOrigin,
  updateOrigin, deleteOrigin,
  getOriginBrewProfileById, listOriginBrewProfiles, createOriginBrewProfile,
  updateOriginBrewProfile, deleteOriginBrewProfile,
} from '../lib/db.js';

const TEST_TOKEN = 'test-admin-token';

const AUTH_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  Authorization: `Bearer ${TEST_TOKEN}`,
};

const NO_AUTH_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

interface McpResponse {
  result: {
    content?: Array<{ type: string; text: string }>;
    tools?: Array<{ name: string }>;
    isError?: boolean;
  };
}

async function callAdminMcp(
  method: string,
  params: Record<string, unknown>,
  id = 1,
): Promise<McpResponse> {
  const res = await adminApp.request('/mcp', {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
  if (!dataLine) throw new Error(`No SSE data line in response:\n${text}`);
  return JSON.parse(dataLine.slice('data: '.length)) as McpResponse;
}

const mockBrew: Brew = {
  id: 42,
  brewing_method_id: 1,
  origin: 'Ethiopia',
  roast_level: 'light',
  grind_size: 'medium-fine',
  water_temp_c: 94,
  ratio: 0.0625,
  brew_time_s: 210,
  rating: 4,
  created_at: '2026-06-01T00:00:00Z',
  source: 'user_submitted',
};

const mockOrigin: Origin = {
  id: 10,
  name: 'Yirgacheffe',
  region: 'Ethiopia',
  is_verified: false,
};

const mockProfile: OriginBrewProfile = {
  id: 5,
  origin: 'Ethiopia',
  roast_level: 'light',
  brewing_method_id: 1,
  water_temp_c: 94,
  ratio: 0.0625,
  brew_time_s: 210,
  grind_size: 'medium-fine',
  tasting_notes: 'floral,citrus',
  technique: null,
  source: 'curated',
  confident: true,
  generated_at: '2026-06-01T00:00:00Z',
  last_verified: null,
};

beforeAll(() => {
  process.env.ADMIN_TOKEN = TEST_TOKEN;
});

afterAll(() => {
  delete process.env.ADMIN_TOKEN;
});

beforeEach(() => {
  vi.resetAllMocks();
});

// ── Auth ─────────────────────────────────────────────────

describe('Admin auth', () => {
  it('AC-TST-1: no Authorization header → 401', async () => {
    const res = await adminApp.request('/mcp', {
      method: 'POST',
      headers: NO_AUTH_HEADERS,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBeDefined();
  });

  it('AC-TST-2: wrong token → 401', async () => {
    const res = await adminApp.request('/mcp', {
      method: 'POST',
      headers: { ...NO_AUTH_HEADERS, Authorization: 'Bearer wrong-token' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBeDefined();
  });

  it('ADMIN_TOKEN not set → 401 with "Admin not configured"', async () => {
    const saved = process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const res = await adminApp.request('/mcp', {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    process.env.ADMIN_TOKEN = saved;
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Admin not configured');
  });

  it('GET /health is unprotected', async () => {
    const res = await adminApp.request('/health', { method: 'GET' });
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });
});

// ── Brew tools ───────────────────────────────────────────

describe('Admin tool: create_brew', () => {
  it('AC-TST-9: calls addBrew, returns { created: true, record }', async () => {
    vi.mocked(addBrew).mockResolvedValue(mockBrew);

    const data = await callAdminMcp('tools/call', {
      name: 'create_brew',
      arguments: {
        brewing_method_id: 1,
        origin: 'Ethiopia',
        roast_level: 'light',
        grind_size: 'medium-fine',
        water_temp_c: 94,
        ratio: 0.0625,
        brew_time_s: 210,
        rating: 4,
      },
    });

    expect(vi.mocked(addBrew)).toHaveBeenCalledWith(expect.objectContaining({
      brewing_method_id: 1,
      origin: 'Ethiopia',
      roast_level: 'light',
    }));
    const result = JSON.parse(data.result.content![0].text);
    expect(result.created).toBe(true);
    expect(result.record.id).toBe(42);
  });
});

describe('Admin tool: get_brew', () => {
  it('AC-TST-10: found → calls getBrewById, returns { found: true, record }', async () => {
    vi.mocked(getBrewById).mockResolvedValue(mockBrew);

    const data = await callAdminMcp('tools/call', { name: 'get_brew', arguments: { id: 42 } });

    expect(vi.mocked(getBrewById)).toHaveBeenCalledWith(42);
    const result = JSON.parse(data.result.content![0].text);
    expect(result.found).toBe(true);
    expect(result.record.id).toBe(42);
  });

  it('AC-TST-11: not found → returns { found: false }', async () => {
    vi.mocked(getBrewById).mockResolvedValue(null);

    const data = await callAdminMcp('tools/call', { name: 'get_brew', arguments: { id: 99999 } });

    const result = JSON.parse(data.result.content![0].text);
    expect(result.found).toBe(false);
    expect(result.error).toBe('Not found');
  });
});

describe('Admin tool: list_brews', () => {
  it('calls getBrews and returns { records, count }', async () => {
    vi.mocked(getBrews).mockResolvedValue({ brews: [mockBrew as any], count: 1 });

    const data = await callAdminMcp('tools/call', {
      name: 'list_brews',
      arguments: { origin: 'Ethiopia', limit: 5 },
    });

    expect(vi.mocked(getBrews)).toHaveBeenCalledWith({ origin: 'Ethiopia', limit: 5 });
    const result = JSON.parse(data.result.content![0].text);
    expect(result.count).toBe(1);
    expect(Array.isArray(result.records)).toBe(true);
  });
});

describe('Admin tool: update_brew', () => {
  it('AC-TST-3: calls updateBrew, returns { updated: true, record }', async () => {
    const updated = { ...mockBrew, rating: 5 };
    vi.mocked(updateBrew).mockResolvedValue(updated);

    const data = await callAdminMcp('tools/call', {
      name: 'update_brew',
      arguments: { id: 42, rating: 5 },
    });

    expect(vi.mocked(updateBrew)).toHaveBeenCalledWith(42, { rating: 5 });
    const result = JSON.parse(data.result.content![0].text);
    expect(result.updated).toBe(true);
    expect(result.record.rating).toBe(5);
  });
});

describe('Admin tool: delete_brew', () => {
  it('AC-TST-4: calls deleteBrew, returns { deleted: true, id }', async () => {
    vi.mocked(deleteBrew).mockResolvedValue(true);

    const data = await callAdminMcp('tools/call', { name: 'delete_brew', arguments: { id: 42 } });

    expect(vi.mocked(deleteBrew)).toHaveBeenCalledWith(42);
    const result = JSON.parse(data.result.content![0].text);
    expect(result.deleted).toBe(true);
    expect(result.id).toBe(42);
  });
});

// ── Origin tools ─────────────────────────────────────────

describe('Admin tool: create_origin', () => {
  it('AC-TST-12: calls createOrigin, returns { created: true, record }', async () => {
    vi.mocked(createOrigin).mockResolvedValue(mockOrigin);

    const data = await callAdminMcp('tools/call', {
      name: 'create_origin',
      arguments: { name: 'Yirgacheffe', region: 'Ethiopia' },
    });

    expect(vi.mocked(createOrigin)).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Yirgacheffe',
      region: 'Ethiopia',
    }));
    const result = JSON.parse(data.result.content![0].text);
    expect(result.created).toBe(true);
    expect(result.record.id).toBe(10);
  });
});

describe('Admin tool: list_origins', () => {
  it('AC-TST-13: calls getOrigins, returns { records, count }', async () => {
    vi.mocked(getOrigins).mockResolvedValue([mockOrigin]);

    const data = await callAdminMcp('tools/call', { name: 'list_origins', arguments: {} });

    expect(vi.mocked(getOrigins)).toHaveBeenCalled();
    const result = JSON.parse(data.result.content![0].text);
    expect(result.count).toBe(1);
    expect(result.records[0].id).toBe(10);
  });
});

describe('Admin tool: update_origin', () => {
  it('AC-TST-5: calls updateOrigin, returns { updated: true, record }', async () => {
    const updated = { ...mockOrigin, is_verified: true };
    vi.mocked(updateOrigin).mockResolvedValue(updated);

    const data = await callAdminMcp('tools/call', {
      name: 'update_origin',
      arguments: { id: 10, is_verified: true },
    });

    expect(vi.mocked(updateOrigin)).toHaveBeenCalledWith(10, { is_verified: true });
    const result = JSON.parse(data.result.content![0].text);
    expect(result.updated).toBe(true);
    expect(result.record.is_verified).toBe(true);
  });
});

describe('Admin tool: delete_origin', () => {
  it('AC-TST-6: calls deleteOrigin, returns { deleted: true, id }', async () => {
    vi.mocked(deleteOrigin).mockResolvedValue(true);

    const data = await callAdminMcp('tools/call', { name: 'delete_origin', arguments: { id: 10 } });

    expect(vi.mocked(deleteOrigin)).toHaveBeenCalledWith(10);
    const result = JSON.parse(data.result.content![0].text);
    expect(result.deleted).toBe(true);
    expect(result.id).toBe(10);
  });
});

// ── Origin profile tools ──────────────────────────────────

describe('Admin tool: create_origin_profile', () => {
  it('AC-TST-14: calls createOriginBrewProfile, returns { created: true, record }', async () => {
    vi.mocked(createOriginBrewProfile).mockResolvedValue(mockProfile);

    const data = await callAdminMcp('tools/call', {
      name: 'create_origin_profile',
      arguments: {
        origin: 'Ethiopia',
        roast_level: 'light',
        brewing_method_id: 1,
        water_temp_c: 94,
        ratio: 0.0625,
        brew_time_s: 210,
        grind_size: 'medium-fine',
        tasting_notes: 'floral,citrus',
      },
    });

    expect(vi.mocked(createOriginBrewProfile)).toHaveBeenCalledWith(expect.objectContaining({
      origin: 'Ethiopia',
      roast_level: 'light',
      brewing_method_id: 1,
    }));
    const result = JSON.parse(data.result.content![0].text);
    expect(result.created).toBe(true);
    expect(result.record.id).toBe(5);
  });
});

describe('Admin tool: list_origin_profiles', () => {
  it('AC-TST-15: calls listOriginBrewProfiles with filters, returns { records, count }', async () => {
    vi.mocked(listOriginBrewProfiles).mockResolvedValue([mockProfile]);

    const data = await callAdminMcp('tools/call', {
      name: 'list_origin_profiles',
      arguments: { source: 'curated' },
    });

    expect(vi.mocked(listOriginBrewProfiles)).toHaveBeenCalledWith({ source: 'curated' });
    const result = JSON.parse(data.result.content![0].text);
    expect(result.count).toBe(1);
    expect(result.records[0].id).toBe(5);
  });
});

describe('Admin tool: update_origin_profile', () => {
  it('AC-TST-7: calls updateOriginBrewProfile, returns { updated: true, record }', async () => {
    const updated = { ...mockProfile, source: 'curated' as const, confident: true };
    vi.mocked(updateOriginBrewProfile).mockResolvedValue(updated);

    const data = await callAdminMcp('tools/call', {
      name: 'update_origin_profile',
      arguments: { id: 5, source: 'curated', confident: true },
    });

    expect(vi.mocked(updateOriginBrewProfile)).toHaveBeenCalledWith(5, { source: 'curated', confident: true });
    const result = JSON.parse(data.result.content![0].text);
    expect(result.updated).toBe(true);
    expect(result.record.source).toBe('curated');
  });
});

describe('Admin tool: delete_origin_profile', () => {
  it('AC-TST-8: calls deleteOriginBrewProfile, returns { deleted: true, id }', async () => {
    vi.mocked(deleteOriginBrewProfile).mockResolvedValue(true);

    const data = await callAdminMcp('tools/call', { name: 'delete_origin_profile', arguments: { id: 5 } });

    expect(vi.mocked(deleteOriginBrewProfile)).toHaveBeenCalledWith(5);
    const result = JSON.parse(data.result.content![0].text);
    expect(result.deleted).toBe(true);
    expect(result.id).toBe(5);
  });
});
