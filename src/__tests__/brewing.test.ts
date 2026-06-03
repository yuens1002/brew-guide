import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrewingMethod, Brew, BrewWithMethod, Origin, RecommendationRecord } from '../types.js';

vi.mock('../lib/db.js', () => ({
  getBrewingMethods: vi.fn(),
  getBrews: vi.fn(),
  getBrewById: vi.fn(),
  addBrew: vi.fn(),
  updateBrewTechnique: vi.fn(),
  getTastingNotes: vi.fn(),
  getOrigins: vi.fn(),
  createRecommendation: vi.fn(),
  findRecentRecommendation: vi.fn(),
  linkBrewToRecommendation: vi.fn(),
  getBrewLinks: vi.fn(),
  getVoteCounts: vi.fn(),
  getRecommendation: vi.fn(),
  recordVote: vi.fn(),
}));

vi.mock('../lib/llm.js', () => ({
  extractTechnique: vi.fn().mockResolvedValue(null),
}));

import brewingRoutes from '../routes/brewing.js';
import {
  getBrewingMethods, addBrew, getBrews, getBrewById,
  getTastingNotes, getOrigins, createRecommendation, findRecentRecommendation, getBrewLinks,
  getVoteCounts, getRecommendation, recordVote,
} from '../lib/db.js';
import { extractTechnique } from '../lib/llm.js';

const mockMethods: BrewingMethod[] = [
  {
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
  },
];

const mockOrigins: Origin[] = [
  { id: 1, name: 'Colombia', region: 'South America', aliases: 'Colombian,Columbia', is_verified: true },
  { id: 2, name: 'Ethiopia', region: 'Africa', aliases: 'Ethiopean,Ethopian', is_verified: true },
];

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

const mockBrews: { count: number; brews: BrewWithMethod[] } = {
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
      notes: 'A bit bitter, extracted too fast',
      created_at: '2026-05-25T10:30:00Z',
      source: 'user_submitted',
    },
  ],
};

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

const validBrewPayload = {
  brewing_method_id: 1,
  origin: 'Colombian Medium Roast',
  roast_level: 'medium',
  grind_size: 'medium-fine',
  water_temp_c: 93,
  ratio: 0.0625,
  brew_time_s: 180,
  rating: 4,
  notes: 'Bright and clean',
  source: 'user_submitted' as const,
  source_url: undefined,
  field_confidence: undefined,
};

beforeEach(() => {
  vi.resetAllMocks();
  // Defaults so computeBestBrew + resolveOrigin + tryLinkBrew work in all tests
  vi.mocked(getOrigins).mockResolvedValue([]);
  vi.mocked(getBrews).mockResolvedValue({ count: 0, brews: [] });
  vi.mocked(createRecommendation).mockResolvedValue(mockRecommendationRecord);
  vi.mocked(findRecentRecommendation).mockResolvedValue(null);
  vi.mocked(getBrewLinks).mockResolvedValue([]);
  vi.mocked(getVoteCounts).mockResolvedValue({ thumbs_up: 0, thumbs_down: 0 });
  vi.mocked(getRecommendation).mockResolvedValue(null);
  vi.mocked(recordVote).mockResolvedValue({ thumbs_up: 1, thumbs_down: 0 });
});

describe('GET /origins', () => {
  it('returns all origins as JSON', async () => {
    vi.mocked(getOrigins).mockResolvedValue(mockOrigins);

    const res = await brewingRoutes.request('/origins');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockOrigins);
  });
});

describe('GET /brewing-methods', () => {
  it('returns all brewing methods as JSON', async () => {
    vi.mocked(getBrewingMethods).mockResolvedValue(mockMethods);

    const res = await brewingRoutes.request('/brewing-methods');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockMethods);
  });
});

describe('GET /brews', () => {
  it('returns brews with count from the DB', async () => {
    vi.mocked(getBrews).mockResolvedValue(mockBrews);

    const res = await brewingRoutes.request('/brews');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockBrews);
  });

  it('passes query filters to getBrews', async () => {
    vi.mocked(getBrews).mockResolvedValue({ count: 0, brews: [] });

    const res = await brewingRoutes.request('/brews?origin=Colombia&method=1&limit=10');

    expect(res.status).toBe(200);
    expect(vi.mocked(getBrews)).toHaveBeenCalledWith({ origin: 'Colombia', method: 1, limit: 10 });
  });
});

describe('POST /brews', () => {
  it('creates a brew and returns 201 with id and message', async () => {
    const saved: Brew = { ...validBrewPayload, id: 1, created_at: '2026-05-25T00:00:00Z',
      source: 'user_submitted' };
    vi.mocked(addBrew).mockResolvedValue(saved);

    const res = await brewingRoutes.request('/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBrewPayload),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.message).toBe('Brew record added successfully');
    // resolveOrigin with no matching origins returns input as-is
    expect(vi.mocked(addBrew)).toHaveBeenCalledWith(
      expect.objectContaining({ origin: validBrewPayload.origin }),
    );
  });

  it('rejects a payload missing required fields with 400', async () => {
    const res = await brewingRoutes.request('/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brewing_method_id: 1, origin: 'Test' }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects a rating outside 1-5 with 400', async () => {
    const res = await brewingRoutes.request('/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBrewPayload, rating: 10 }),
    });

    expect(res.status).toBe(400);
  });

  // AC-TST-1: technique in body — extractTechnique NOT called
  it('does not call extractTechnique when technique is supplied in the body', async () => {
    const technique = { bloom_weight_ratio: 2, bloom_duration_s: 30, pour_stages: [] } as import('../types.js').BrewTechnique;
    const saved: Brew = { ...validBrewPayload, id: 1, created_at: '2026-05-25T00:00:00Z', source: 'user_submitted', technique };
    vi.mocked(addBrew).mockResolvedValue(saved);
    vi.mocked(extractTechnique).mockResolvedValue(null);

    await brewingRoutes.request('/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBrewPayload, technique }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vi.mocked(extractTechnique)).not.toHaveBeenCalled();
  });

  // AC-TST-2: technique in body — addBrew called with the technique object
  it('passes technique to addBrew when supplied in the body', async () => {
    const technique = { bloom_weight_ratio: 2, bloom_duration_s: 30, pour_stages: [] } as import('../types.js').BrewTechnique;
    const saved: Brew = { ...validBrewPayload, id: 1, created_at: '2026-05-25T00:00:00Z', source: 'user_submitted', technique };
    vi.mocked(addBrew).mockResolvedValue(saved);

    await brewingRoutes.request('/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBrewPayload, technique }),
    });

    expect(vi.mocked(addBrew)).toHaveBeenCalledWith(
      expect.objectContaining({ technique }),
    );
  });

  // AC-TST-5: fire-and-forget extraction triggered when notes present
  it('initiates technique extraction when notes are present', async () => {
    const saved: Brew = { ...validBrewPayload, id: 1, created_at: '2026-05-25T00:00:00Z', source: 'user_submitted' };
    vi.mocked(addBrew).mockResolvedValue(saved);
    vi.mocked(getBrewingMethods).mockResolvedValue(mockMethods);
    vi.mocked(extractTechnique).mockResolvedValue(null);

    await brewingRoutes.request('/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBrewPayload), // has notes: 'Bright and clean'
    });
    await new Promise((resolve) => setTimeout(resolve, 0)); // flush microtask queue

    expect(vi.mocked(getBrewingMethods)).toHaveBeenCalled();
  });

  // AC-TST-6: no extraction triggered when notes are absent
  it('does not call extractTechnique when notes are absent', async () => {
    const noNotesPayload = { ...validBrewPayload, notes: undefined };
    const saved: Brew = { ...noNotesPayload, id: 2, created_at: '2026-05-25T00:00:00Z', source: 'user_submitted' };
    vi.mocked(addBrew).mockResolvedValue(saved);
    vi.mocked(extractTechnique).mockResolvedValue(null);

    await brewingRoutes.request('/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(noNotesPayload),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vi.mocked(extractTechnique)).not.toHaveBeenCalled();
  });
});

// AC-TST-4: GET /tasting-notes returns {note, count} sorted descending
describe('GET /tasting-notes', () => {
  it('returns tasting notes sorted by count descending', async () => {
    vi.mocked(getTastingNotes).mockResolvedValue([
      { note: 'bright', count: 4 },
      { note: 'floral', count: 2 },
      { note: 'earthy', count: 1 },
    ]);

    const res = await brewingRoutes.request('/tasting-notes');

    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ note: string; count: number }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toEqual({ note: 'bright', count: 4 });
    expect(body[0].count).toBeGreaterThanOrEqual(body[1].count);
    expect(body[1].count).toBeGreaterThanOrEqual(body[2].count);
  });

  it('returns empty array when no brews have notes', async () => {
    vi.mocked(getTastingNotes).mockResolvedValue([]);

    const res = await brewingRoutes.request('/tasting-notes');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe('POST /brews — field_confidence.origin storage', () => {
  const basePayload = {
    brewing_method_id: 1,
    roast_level: 'medium',
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 0.0625,
    brew_time_s: 180,
    rating: 4,
  };
  const mockSaved: Brew = { ...basePayload, id: 1, origin: '', created_at: '', source: 'user_submitted' };

  it('stores origin: 1.0 for exact match', async () => {
    vi.mocked(getOrigins).mockResolvedValue(mockOrigins); // includes Colombia (is_verified: true)
    vi.mocked(addBrew).mockResolvedValue({ ...mockSaved, origin: 'Colombia' });

    await brewingRoutes.request('/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, origin: 'Colombia' }),
    });

    const conf = JSON.parse(vi.mocked(addBrew).mock.calls[0][0].field_confidence!);
    expect(conf.origin).toBe(1.0);
  });

  it('stores origin: 1.0 for alias match', async () => {
    vi.mocked(getOrigins).mockResolvedValue(mockOrigins); // Colombia has alias 'Colombian'
    vi.mocked(addBrew).mockResolvedValue({ ...mockSaved, origin: 'Colombia' });

    await brewingRoutes.request('/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, origin: 'Colombian' }),
    });

    const conf = JSON.parse(vi.mocked(addBrew).mock.calls[0][0].field_confidence!);
    expect(conf.origin).toBe(1.0);
  });

  it('stores origin: 0.7 for fuzzy (partial name) match', async () => {
    vi.mocked(getOrigins).mockResolvedValue(mockOrigins); // 'Colomb' substring-matches 'Colombia'
    vi.mocked(addBrew).mockResolvedValue({ ...mockSaved, origin: 'Colombia' });

    await brewingRoutes.request('/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, origin: 'Colomb' }),
    });

    const conf = JSON.parse(vi.mocked(addBrew).mock.calls[0][0].field_confidence!);
    expect(conf.origin).toBe(0.7);
  });

  it('stores origin: 0.5 for unknown origin (pass-through)', async () => {
    vi.mocked(getOrigins).mockResolvedValue([]); // no origins → unknown
    vi.mocked(addBrew).mockResolvedValue({ ...mockSaved, origin: 'Bali Blue Moon' });

    await brewingRoutes.request('/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, origin: 'Bali Blue Moon' }),
    });

    const conf = JSON.parse(vi.mocked(addBrew).mock.calls[0][0].field_confidence!);
    expect(conf.origin).toBe(0.5);
  });

  it('merges computed origin confidence with user-supplied field_confidence', async () => {
    vi.mocked(getOrigins).mockResolvedValue(mockOrigins);
    vi.mocked(addBrew).mockResolvedValue({ ...mockSaved, origin: 'Colombia' });

    await brewingRoutes.request('/brews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, origin: 'Colombia', field_confidence: '{"notes":0.9}' }),
    });

    const conf = JSON.parse(vi.mocked(addBrew).mock.calls[0][0].field_confidence!);
    expect(conf.origin).toBe(1.0);
    expect(conf.notes).toBe(0.9);
  });
});

describe('GET /brews/:id', () => {
  it('returns a single brew by ID', async () => {
    vi.mocked(getBrewById).mockResolvedValue(mockBrew);

    const res = await brewingRoutes.request('/brews/1');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockBrew);
  });

  it('returns 404 for nonexistent brew', async () => {
    vi.mocked(getBrewById).mockResolvedValue(null);

    const res = await brewingRoutes.request('/brews/999');

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid ID', async () => {
    const res = await brewingRoutes.request('/brews/abc');

    expect(res.status).toBe(400);
  });
});

describe('GET /brews/:id/compare', () => {
  it('returns comparison data', async () => {
    vi.mocked(getBrewById).mockResolvedValue(mockBrew);
    vi.mocked(getBrewingMethods).mockResolvedValue(mockMethods);

    const res = await brewingRoutes.request('/brews/1/compare');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brew_id).toBe(1);
    expect(body.user_brew).toBeDefined();
    expect(body.user_brew.water_temp_c).toBe(95);
    expect(body.analysis).toBeDefined();
    expect(body.match_score).toBeDefined();
  });

  it('returns 404 for nonexistent brew', async () => {
    vi.mocked(getBrewById).mockResolvedValue(null);

    const res = await brewingRoutes.request('/brews/999/compare');

    expect(res.status).toBe(404);
  });

  it('returns real match_score when a recommendation link exists', async () => {
    vi.mocked(getBrewById).mockResolvedValue(mockBrew);
    vi.mocked(getBrewingMethods).mockResolvedValue(mockMethods);
    vi.mocked(getBrewLinks).mockResolvedValue([{ brew_id: 1, recommendation_id: 1, match_confidence: 0.82, linked_at: '2026-05-27T00:00:00Z' }]);

    const res = await brewingRoutes.request('/brews/1/compare');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.match_score).toBe(0.82);
  });

  it('falls back to 0.5 match_score when no recommendation link exists', async () => {
    vi.mocked(getBrewById).mockResolvedValue(mockBrew);
    vi.mocked(getBrewingMethods).mockResolvedValue(mockMethods);
    vi.mocked(getBrewLinks).mockResolvedValue([]);
    vi.mocked(getVoteCounts).mockResolvedValue({ thumbs_up: 0, thumbs_down: 0 });

    const res = await brewingRoutes.request('/brews/1/compare');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.match_score).toBe(0.5);
  });
});

describe('POST /recommend', () => {
  it('returns a full Recommendation using the specified method', async () => {
    vi.mocked(getBrewingMethods).mockResolvedValue(mockMethods);

    const res = await brewingRoutes.request('/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brewing_method_id: 1, origin: 'Colombia', roast_level: 'medium' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brewing_method).toBe('Pour Over');
    expect(body.recommendation).toBeDefined();
    expect(body.confidence).toBeDefined();
    expect(body.input.origin).toBe('Colombia');
    // New Recommendation shape fields
    expect(Array.isArray(body.sources)).toBe(true);
    expect(typeof body.data_points_used).toBe('number');
    expect(typeof body.id).toBe('number');
    // AC-TST-2: technique is present and is an object
    expect(body.technique).toBeDefined();
    expect(typeof body.technique).toBe('object');
  });

  it('falls back to first method when no method_id provided', async () => {
    vi.mocked(getBrewingMethods).mockResolvedValue(mockMethods);

    const res = await brewingRoutes.request('/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: 'Ethiopian Yirgacheffe' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brewing_method).toBe('Pour Over');
  });

  it('returns 404 when method_id does not match', async () => {
    vi.mocked(getBrewingMethods).mockResolvedValue(mockMethods);

    const res = await brewingRoutes.request('/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brewing_method_id: 999 }),
    });

    expect(res.status).toBe(404);
  });
});

// C4: user_vote flows through POST /recommend/:id/vote
describe('POST /recommend/:id/vote', () => {
  it('calls recordVote with correct recommendation_id and vote value, returns counts', async () => {
    vi.mocked(getRecommendation).mockResolvedValue(mockRecommendationRecord);
    vi.mocked(recordVote).mockResolvedValue({ thumbs_up: 1, thumbs_down: 0 });

    const res = await brewingRoutes.request('/recommend/1/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: 'up' }),
    });

    expect(res.status).toBe(200);
    expect(vi.mocked(recordVote)).toHaveBeenCalledWith(1, 'up');
    const body = await res.json();
    expect(body.thumbs_up).toBe(1);
    expect(body.thumbs_down).toBe(0);
  });

  it('returns 404 for unknown recommendation id', async () => {
    vi.mocked(getRecommendation).mockResolvedValue(null);

    const res = await brewingRoutes.request('/recommend/99999/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: 'up' }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid vote value', async () => {
    const res = await brewingRoutes.request('/recommend/1/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: 'sideways' }),
    });

    expect(res.status).toBe(400);
  });
});
