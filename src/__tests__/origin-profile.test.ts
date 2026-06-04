import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BrewingMethod, BrewWithMethod, RecommendationRecord, OriginBrewProfile } from '../types.js';

// ── Mock DB and origin-profile for computeBestBrew tests ────
vi.mock('../lib/db.js', () => ({
  getBrewingMethods: vi.fn(),
  getBrews: vi.fn(),
  getOrigins: vi.fn(),
  createRecommendation: vi.fn(),
  findRecentRecommendation: vi.fn(),
  linkBrewToRecommendation: vi.fn(),
  getOriginBrewProfile: vi.fn(),
}));

vi.mock('../lib/origin-profile.js', () => ({
  getOrTriggerOriginProfile: vi.fn(),
}));

import { generateOriginBrewProfile } from '../lib/llm.js';
import { computeBestBrew } from '../lib/recommend.js';
import {
  getBrewingMethods, getBrews, createRecommendation, getOrigins,
  findRecentRecommendation, getOriginBrewProfile,
} from '../lib/db.js';
import { getOrTriggerOriginProfile } from '../lib/origin-profile.js';

// ── Shared fixtures ─────────────────────────────────────────

const MOCK_API_KEY = 'test-key';

function mockFetchOk(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  });
}

const mockMethod: BrewingMethod = {
  id: 1,
  name: 'Pour Over',
  description: 'Pour over',
  default_temp_c: 93,
  grind_size: 'medium-fine',
  default_brew_time_s: 210,
  default_ratio: 0.0625,
};

const mockRecRecord: RecommendationRecord = {
  id: 1,
  brewing_method_id: 1,
  origin: 'Ethiopia',
  roast_level: 'light',
  grind_size: 'medium-fine',
  water_temp_c: 93,
  ratio: 0.0625,
  brew_time_s: 210,
  recommendation: 'test',
  confidence: 'low',
  fingerprint: 'ethiopia-light-1',
  thumbs_up: 0,
  thumbs_down: 0,
  created_at: '2026-06-01T00:00:00Z',
};

const mockProfile: OriginBrewProfile = {
  id: 1,
  origin: 'Ethiopia',
  roast_level: 'light',
  brewing_method_id: 1,
  water_temp_c: 94,
  ratio: 0.0588,
  brew_time_s: 200,
  grind_size: 'medium',
  tasting_notes: 'blueberry, floral, citrus, bright',
  technique: null,
  source: 'llm_generated',
  confident: true,
  generated_at: '2026-06-01T00:00:00Z',
  last_verified: null,
};

// ── generateOriginBrewProfile (AC-TST-1, AC-TST-2) ──────────

describe('generateOriginBrewProfile', () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = MOCK_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedKey !== undefined) {
      process.env.OPENROUTER_API_KEY = savedKey;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  // AC-TST-1
  it('returns complete profile payload on successful mocked Haiku response', async () => {
    const payload = {
      confident: true,
      water_temp_c: 94,
      ratio: 0.0625,
      brew_time_s: 200,
      grind_size: 'medium-fine',
      tasting_notes: ['blueberry', 'floral', 'citrus', 'bright', 'jasmine'],
      technique: {
        bloom_weight_ratio: 2,
        bloom_duration_s: 45,
        pour_stages: [{ at_s: 0, volume_ml: 60 }],
      },
    };
    vi.stubGlobal('fetch', mockFetchOk(JSON.stringify(payload)));

    const result = await generateOriginBrewProfile('Ethiopia', 'light', 'Pour Over');

    expect(result).not.toBeNull();
    expect(result!.confident).toBe(true);
    expect(result!.water_temp_c).toBe(94);
    expect(result!.ratio).toBe(0.0625);
    expect(result!.brew_time_s).toBe(200);
    expect(result!.grind_size).toBe('medium-fine');
    expect(result!.tasting_notes).toEqual(['blueberry', 'floral', 'citrus', 'bright', 'jasmine']);
    expect(result!.technique).toBeDefined();
  });

  // AC-TST-2
  it('returns null when model responds with confident: false', async () => {
    vi.stubGlobal('fetch', mockFetchOk(JSON.stringify({ confident: false })));

    const result = await generateOriginBrewProfile('Ethiopia', 'light', 'Pour Over');

    expect(result).toBeNull();
  });

  it('returns null when OPENROUTER_API_KEY is not set', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await generateOriginBrewProfile('Ethiopia', 'light', 'Pour Over');

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null for an unknown method name', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await generateOriginBrewProfile('Ethiopia', 'light', 'Drip Machine');

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── computeBestBrew with profile fallback (AC-TST-3) ────────

describe('computeBestBrew — profile fallback (topN = 0)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getOrigins).mockResolvedValue([]);
    vi.mocked(createRecommendation).mockResolvedValue(mockRecRecord);
    vi.mocked(findRecentRecommendation).mockResolvedValue(null);
    vi.mocked(getOriginBrewProfile).mockResolvedValue(null);
    vi.mocked(getOrTriggerOriginProfile).mockResolvedValue(null);
  });

  // AC-TST-3: uses profile params when topN is empty and a confident profile exists
  it('uses profile water_temp_c, ratio, brew_time_s, grind_size when no community brews match', async () => {
    vi.mocked(getBrewingMethods).mockResolvedValue([mockMethod]);
    vi.mocked(getBrews).mockResolvedValue({ count: 0, brews: [] });
    vi.mocked(getOrTriggerOriginProfile).mockResolvedValue(mockProfile);
    vi.mocked(getOriginBrewProfile).mockResolvedValue(mockProfile);

    const result = await computeBestBrew({
      brewing_method_id: 1,
      origin: 'Ethiopia',
      roast_level: 'light',
    });

    expect(result.confidence).toBe('medium');
    expect(result.input.water_temp_c).toBe(mockProfile.water_temp_c);
    expect(result.input.ratio).toBe(mockProfile.ratio);
    expect(result.input.brew_time_s).toBe(mockProfile.brew_time_s);
    expect(result.input.grind_size).toBe(mockProfile.grind_size);
    expect(result.source_attribution).toBe('Origin profile informed this recommendation');
  });

  it('falls back to method defaults and source_attribution reflects no data when no profile', async () => {
    vi.mocked(getBrewingMethods).mockResolvedValue([mockMethod]);
    vi.mocked(getBrews).mockResolvedValue({ count: 0, brews: [] });
    vi.mocked(getOrTriggerOriginProfile).mockResolvedValue(null);
    vi.mocked(getOriginBrewProfile).mockResolvedValue(null);

    const result = await computeBestBrew({
      brewing_method_id: 1,
      origin: 'Ethiopia',
      roast_level: 'light',
    });

    expect(result.confidence).toBe('low');
    expect(result.input.water_temp_c).toBe(mockMethod.default_temp_c);
    expect(result.source_attribution).toContain('using Pour Over defaults');
  });

  it('populates tasting_notes from profile when topN brews have no notes', async () => {
    vi.mocked(getBrewingMethods).mockResolvedValue([mockMethod]);
    vi.mocked(getBrews).mockResolvedValue({ count: 0, brews: [] });
    vi.mocked(getOrTriggerOriginProfile).mockResolvedValue(mockProfile);
    vi.mocked(getOriginBrewProfile).mockResolvedValue(mockProfile);

    const result = await computeBestBrew({
      brewing_method_id: 1,
      origin: 'Ethiopia',
      roast_level: 'light',
    });

    expect(result.tasting_notes.length).toBeGreaterThan(0);
    expect(result.tasting_notes[0].note).toBe('blueberry');
  });
});
