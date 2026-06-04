import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractTechnique } from '../lib/llm.js';

const MOCK_API_KEY = 'test-openrouter-key';

function mockFetchOk(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  });
}

describe('extractTechnique', () => {
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

  // AC-TST-4
  it('returns null and never calls fetch when OPENROUTER_API_KEY is not set', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await extractTechnique('Pour Over', 'Bloom for 30s, then pour slowly.');

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // AC-FN-B2 (also a guard for AC-TST-4 pattern)
  it('returns null and never calls fetch for an unknown method name', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await extractTechnique('Drip Machine', 'Some notes about drip coffee.');

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // AC-TST-1
  it('returns a typed technique object on a successful OpenRouter response', async () => {
    const technique = {
      bloom_weight_ratio: 2,
      bloom_duration_s: 30,
      pour_stages: [{ at_s: 0, volume_ml: 60, note: 'bloom' }],
    };
    vi.stubGlobal('fetch', mockFetchOk(JSON.stringify(technique)));

    const result = await extractTechnique(
      'Pour Over',
      'Bloom 60g water (2x dose) for 30s. Pour 300ml in two stages starting at 45s.',
    );

    expect(result).toEqual(technique);
  });

  // AC-TST-2
  it('returns null when the model responds with the string "null"', async () => {
    vi.stubGlobal('fetch', mockFetchOk('null'));

    const result = await extractTechnique('Pour Over', 'Bright and fruity, chocolate finish.');

    expect(result).toBeNull();
  });

  // AC-TST-3
  it('returns null when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const result = await extractTechnique('Pour Over', 'Bloom for 30s.');

    expect(result).toBeNull();
  });

  // AC-FN-B5
  it('returns null on a non-OK HTTP response (e.g. 429)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const result = await extractTechnique('Pour Over', 'Bloom for 30s.');

    expect(result).toBeNull();
  });

  // AC-FN-B6
  it('returns null when the model returns malformed JSON', async () => {
    vi.stubGlobal('fetch', mockFetchOk('not valid json {{{'));

    const result = await extractTechnique('Pour Over', 'Bloom for 30s.');

    expect(result).toBeNull();
  });
});
