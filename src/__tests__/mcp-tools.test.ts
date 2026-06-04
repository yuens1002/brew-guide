import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrewingMethod, Brew, BrewWithMethod, RecommendationRecord } from '../types.js';

vi.mock('../lib/db.js', () => ({
  getBrewingMethods: vi.fn(),
  getBrews: vi.fn(),
  getBrewById: vi.fn(),
  addBrew: vi.fn(),
  getOrigins: vi.fn(),
  createRecommendation: vi.fn(),
  findRecentRecommendation: vi.fn(),
  linkBrewToRecommendation: vi.fn(),
  getBrewLinks: vi.fn(),
  getVoteCounts: vi.fn(),
  getOriginBrewProfile: vi.fn(),
}));

vi.mock('../lib/origin-profile.js', () => ({
  getOrTriggerOriginProfile: vi.fn(),
}));

import mcpRoute from '../routes/mcp.js';
import {
  getBrewingMethods, getBrews, getBrewById, addBrew,
  getOrigins, createRecommendation, findRecentRecommendation, getBrewLinks,
  getVoteCounts, getOriginBrewProfile,
} from '../lib/db.js';
import { getOrTriggerOriginProfile } from '../lib/origin-profile.js';

const MCP_HEADERS = {
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

async function callMcp(
  method: string,
  params: Record<string, unknown>,
  id = 1,
): Promise<McpResponse> {
  const res = await mcpRoute.request('/', {
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
  if (!dataLine) throw new Error(`No SSE data line in response:\n${text}`);
  return JSON.parse(dataLine.slice('data: '.length)) as McpResponse;
}

const mockMethod: BrewingMethod = {
  id: 1,
  name: 'Pour Over',
  description: 'Hand-poured water over coffee grounds in a filter (V60, Chemex, etc.)',
  default_temp_c: 93,
  grind_size: 'medium-fine',
  default_brew_time_s: 210,
  default_ratio: 0.0625,
  technique: {
    bloom_weight_ratio: 2,
    bloom_duration_s: 45,
    pour_stages: [{ at_s: 0, volume_ml: 60, note: 'bloom' }],
  },
};

const mockRecommendationRecord: RecommendationRecord = {
  id: 1,
  brewing_method_id: 1,
  origin: 'Colombia',
  roast_level: 'medium',
  grind_size: 'medium-fine',
  water_temp_c: 93,
  ratio: 0.0625,
  brew_time_s: 210,
  recommendation: 'No community data yet — using Pour Over defaults.',
  confidence: 'low',
  fingerprint: 'colombia-medium-1',
  thumbs_up: 0,
  thumbs_down: 0,
  created_at: '2026-05-26T00:00:00Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  // Defaults so computeBestBrew + resolveOrigin + tryLinkBrew work in all tests
  vi.mocked(getOrigins).mockResolvedValue([]);
  vi.mocked(getBrews).mockResolvedValue({ count: 0, brews: [] });
  vi.mocked(createRecommendation).mockResolvedValue(mockRecommendationRecord);
  vi.mocked(findRecentRecommendation).mockResolvedValue(null);
  vi.mocked(getVoteCounts).mockResolvedValue({ thumbs_up: 0, thumbs_down: 0 });
  vi.mocked(getOriginBrewProfile).mockResolvedValue(null);
  vi.mocked(getOrTriggerOriginProfile).mockResolvedValue(null);
});

describe('MCP tools/list', () => {
  it('returns exactly 5 registered tools', async () => {
    const data = await callMcp('tools/list', {});
    expect(data.result.tools!).toHaveLength(5);
    expect(data.result.tools!.map((t: { name: string }) => t.name)).toEqual([
      'get_brewing_methods',
      'recommend',
      'log_brew',
      'search_brews',
      'compare_brew',
    ]);
  });
});

describe('MCP tool: get_brewing_methods', () => {
  it('returns all methods from the DB', async () => {
    vi.mocked(getBrewingMethods).mockResolvedValue([mockMethod]);

    const data = await callMcp('tools/call', { name: 'get_brewing_methods', arguments: {} });

    const result = JSON.parse(data.result.content![0].text);
    expect(result).toEqual([mockMethod]);
  });
});

describe('MCP tool: recommend', () => {
  it('returns full Recommendation shape when brewing_method_id matches', async () => {
    vi.mocked(getBrewingMethods).mockResolvedValue([mockMethod]);

    const data = await callMcp('tools/call', {
      name: 'recommend',
      arguments: { origin: 'Colombia', roast_level: 'medium', brewing_method_id: 1 },
    });

    const result = JSON.parse(data.result.content![0].text);
    expect(result.brewing_method).toBe('Pour Over');
    expect(result.input.origin).toBe('Colombia');
    expect(result.input.roast_level).toBe('medium');
    expect(result.confidence).toBe('low');
    // New Recommendation shape fields
    expect(Array.isArray(result.sources)).toBe(true);
    expect(typeof result.data_points_used).toBe('number');
    expect(typeof result.id).toBe('number');
    // AC-TST-2: technique is present and is an object
    expect(result.technique).toBeDefined();
    expect(typeof result.technique).toBe('object');
  });

  it('returns isError when brewing_method_id does not match', async () => {
    vi.mocked(getBrewingMethods).mockResolvedValue([mockMethod]);

    const data = await callMcp('tools/call', {
      name: 'recommend',
      arguments: { origin: 'Colombia', brewing_method_id: 999 },
    });

    expect(data.result.isError!).toBe(true);
    expect(data.result.content![0].text).toBe('Brewing method not found');
  });

  it('falls back to first method when no brewing_method_id is provided', async () => {
    vi.mocked(getBrewingMethods).mockResolvedValue([mockMethod]);

    const data = await callMcp('tools/call', {
      name: 'recommend',
      arguments: { origin: 'Ethiopia' },
    });

    const result = JSON.parse(data.result.content![0].text);
    expect(result.brewing_method).toBe('Pour Over');
  });
});

describe('MCP tool: log_brew', () => {
  it('persists a brew entry and returns id + message', async () => {
    const brewArgs = {
      brewing_method_id: 1,
      origin: 'Colombia',
      roast_level: 'medium',
      grind_size: 'medium-fine',
      water_temp_c: 93,
      ratio: 0.0625,
      brew_time_s: 180,
      rating: 4,
      notes: 'Bright and clean',
    };
    const saved: Brew = { ...brewArgs, id: 1, created_at: '2026-05-25T00:00:00Z',
      source: 'user_submitted' };
    vi.mocked(addBrew).mockResolvedValue(saved);

    const data = await callMcp('tools/call', { name: 'log_brew', arguments: brewArgs });

    const result = JSON.parse(data.result.content![0].text);
    expect(result.id).toBe(1);
    expect(result.message).toBe('Brew record added successfully');
    // resolveOrigin with no matching origins returns input as-is, so origin is unchanged
    expect(vi.mocked(addBrew)).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'Colombia' }),
    );
  });
});

describe('MCP tool: log_brew — field_confidence.origin storage', () => {
  const brewArgs = {
    brewing_method_id: 1,
    roast_level: 'medium',
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 0.0625,
    brew_time_s: 180,
    rating: 4,
  };

  it('stores origin: 1.0 when origin exactly matches a known origin', async () => {
    const mockOrigins = [
      { id: 1, name: 'Colombia', region: 'South America', aliases: 'Colombian', is_verified: true },
    ];
    vi.mocked(getOrigins).mockResolvedValue(mockOrigins);
    vi.mocked(addBrew).mockResolvedValue({
      ...brewArgs, id: 1, origin: 'Colombia', created_at: '', source: 'user_submitted' as const,
    });

    await callMcp('tools/call', { name: 'log_brew', arguments: { ...brewArgs, origin: 'Colombia' } });

    const conf = JSON.parse(vi.mocked(addBrew).mock.calls[0][0].field_confidence!);
    expect(conf.origin).toBe(1.0);
  });

  it('stores origin: 0.5 when origin is unknown (pass-through)', async () => {
    vi.mocked(getOrigins).mockResolvedValue([]); // no origins → unknown
    vi.mocked(addBrew).mockResolvedValue({
      ...brewArgs, id: 1, origin: 'Bali Blue Moon', created_at: '', source: 'user_submitted' as const,
    });

    await callMcp('tools/call', { name: 'log_brew', arguments: { ...brewArgs, origin: 'Bali Blue Moon' } });

    const conf = JSON.parse(vi.mocked(addBrew).mock.calls[0][0].field_confidence!);
    expect(conf.origin).toBe(0.5);
  });
});

// C5: log_brew rating bounds
describe('MCP tool: log_brew — rating bounds', () => {
  const brewBase = {
    brewing_method_id: 1,
    origin: 'Colombia',
    roast_level: 'medium',
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 0.0625,
    brew_time_s: 180,
  };

  it('rejects rating: 0 with MCP error', async () => {
    const data = await callMcp('tools/call', {
      name: 'log_brew',
      arguments: { ...brewBase, rating: 0 },
    });
    expect(data.result.isError).toBe(true);
  });

  it('rejects rating: 6 with MCP error', async () => {
    const data = await callMcp('tools/call', {
      name: 'log_brew',
      arguments: { ...brewBase, rating: 6 },
    });
    expect(data.result.isError).toBe(true);
  });
});

describe('MCP tool: search_brews', () => {
  it('returns filtered brew results', async () => {
    const mockResult: { count: number; brews: BrewWithMethod[] } = {
      count: 1,
      brews: [
        {
          id: 1,
          brewing_method_id: 1,
          brewing_method: 'Pour Over',
          origin: 'Colombia',
          roast_level: 'medium',
          grind_size: 'medium',
          water_temp_c: 95,
          ratio: 0.0625,
          brew_time_s: 180,
          rating: 4,
          notes: undefined,
          created_at: '2026-05-25T10:30:00Z',
          source: 'user_submitted',
        },
      ],
    };
    vi.mocked(getBrews).mockResolvedValue(mockResult);

    const data = await callMcp('tools/call', {
      name: 'search_brews',
      arguments: { origin: 'Colombia', limit: 10 },
    });

    const result = JSON.parse(data.result.content![0].text);
    expect(result.count).toBe(1);
    expect(result.brews[0].origin).toBe('Colombia');
    expect(vi.mocked(getBrews)).toHaveBeenCalledWith({ origin: 'Colombia', limit: 10 });
  });
});

describe('MCP tool: compare_brew', () => {
  it('returns comparison data for a valid brew', async () => {
    const mockBrew: Brew = {
      id: 1,
      brewing_method_id: 1,
      origin: 'Colombia',
      roast_level: 'medium',
      grind_size: 'medium',
      water_temp_c: 95,
      ratio: 0.0625,
      brew_time_s: 180,
      rating: 4,
      notes: 'A bit bitter',
      created_at: '2026-05-25T10:30:00Z',
      source: 'user_submitted',
    };
    vi.mocked(getBrewById).mockResolvedValue(mockBrew);
    vi.mocked(getBrewingMethods).mockResolvedValue([mockMethod]);
    vi.mocked(getBrewLinks).mockResolvedValue([]);

    const data = await callMcp('tools/call', {
      name: 'compare_brew',
      arguments: { brew_id: 1 },
    });

    const result = JSON.parse(data.result.content![0].text);
    expect(result.brew_id).toBe(1);
    expect(result.user_brew.rating).toBe(4);
    expect(result.ai_recommendation).toBeDefined();
    expect(result.analysis).toBeDefined();
    expect(result.match_score).toBeDefined();
  });

  it('returns isError when brew not found', async () => {
      vi.mocked(getBrewById).mockResolvedValue(null);

      const data = await callMcp('tools/call', {
        name: 'compare_brew',
        arguments: { brew_id: 999 },
      });

      expect(data.result.isError!).toBe(true);
      expect(data.result.content![0].text).toBe('Brew not found');
    });

    it('returns real match_score when brew_recommendation_links exist', async () => {
      vi.mocked(getBrewById).mockResolvedValue({
        id: 1, brewing_method_id: 1, origin: 'Colombia', roast_level: 'medium',
        grind_size: 'medium', water_temp_c: 95, ratio: 0.0625, brew_time_s: 180,
        rating: 4, notes: 'A bit bitter', created_at: '2026-05-25T10:30:00Z',
        source: 'user_submitted',
      });
      vi.mocked(getBrewingMethods).mockResolvedValue([mockMethod]);
      vi.mocked(getBrewLinks).mockResolvedValue([
        { brew_id: 1, recommendation_id: 5, match_confidence: 0.82, linked_at: '2026-05-27T00:00:00Z' },
      ]);

      const data = await callMcp('tools/call', {
        name: 'compare_brew',
        arguments: { brew_id: 1 },
      });

      const result = JSON.parse(data.result.content![0].text);
      expect(result.match_score).toBe(0.82);
      expect(vi.mocked(getBrewLinks)).toHaveBeenCalledWith(1);
    });
  });
