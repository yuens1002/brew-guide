import {
  getBrewingMethods, getBrews, getOrigins,
  createRecommendation, findRecentRecommendation, linkBrewToRecommendation,
} from './db.js';
import type {
  BrewWithMethod, Brew,
  Recommendation, RecommendationParams, SourceRef, TastingNote,
} from '../types.js';

// ── Similarity Scoring ──────────────────────────────────

const ADJACENT_ROASTS: Record<string, string[]> = {
  light: ['medium-light'],
  'medium-light': ['light', 'medium'],
  medium: ['medium-light', 'medium-dark'],
  'medium-dark': ['medium', 'dark'],
  dark: ['medium-dark'],
};

function matchScore(brew: BrewWithMethod, params: RecommendationParams): number {
  let score = 0;
  let weights = 0;

  if (params.origin && brew.origin) {
    weights += 3;
    if (brew.origin.toLowerCase() === params.origin.toLowerCase()) score += 3;
    else if (brew.origin.toLowerCase().includes(params.origin.toLowerCase()) ||
             params.origin.toLowerCase().includes(brew.origin.toLowerCase())) score += 1.5;
  }

  // Per-brew variety scoring: brew's own variety vs requested variety
  if (params.variety && brew.variety) {
    weights += 1;
    if (brew.variety.toLowerCase() === params.variety.toLowerCase()) score += 1;
  }

  if (params.brewing_method_id) {
    weights += 3;
    if (brew.brewing_method_id === params.brewing_method_id) score += 3;
  }

  if (params.roast_level && brew.roast_level) {
    weights += 2;
    if (brew.roast_level === params.roast_level) score += 2;
    else if (ADJACENT_ROASTS[params.roast_level]?.includes(brew.roast_level)) score += 1;
  }

  if (params.grind_size && brew.grind_size) {
    weights += 1;
    if (brew.grind_size === params.grind_size) score += 1;
  }

  return weights > 0 ? score / weights : 0;
}

/** Days since brew was logged; newer = higher weight */
function recencyDecay(createdAt: string): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0.1, 1 - ageDays / 365); // decays to 0.1 over a year
}

/** Trust multiplier by source type */
function sourceTrust(source: string): number {
  if (source === 'user_submitted') return 1.0;
  if (source === 'scraped:reddit') return 0.7;
  if (source === 'scraped:home-barista') return 0.85;
  return 0.5;
}

/**
 * Origin confidence from field_confidence JSON.
 * 1.0 = verified exact/alias, 0.7 = fuzzy resolved, 0.5 = unknown pass-through.
 * Defaults to 1.0 when absent (backward-compatible with brews logged before this field was stored).
 */
function originConf(brew: BrewWithMethod): number {
  if (!brew.field_confidence) return 1.0;
  try {
    const conf = JSON.parse(brew.field_confidence) as { origin?: number };
    return conf.origin ?? 1.0;
  } catch {
    return 1.0;
  }
}

// ── Weighted Average Helpers ────────────────────────────

function weightedAvg(
  items: Array<{ brew: BrewWithMethod; score: number }>,
  field: keyof BrewWithMethod,
  totalWeight: number,
): number {
  if (totalWeight === 0) return 0;
  return items.reduce((sum, { brew, score }) => {
    const val = brew[field];
    return sum + (typeof val === 'number' ? val : 0) * score;
  }, 0) / totalWeight;
}

function modeField(
  items: Array<{ brew: BrewWithMethod; score: number }>,
  field: keyof BrewWithMethod,
): string {
  const counts: Record<string, number> = {};
  for (const { brew, score } of items) {
    const val = String(brew[field] || '');
    counts[val] = (counts[val] || 0) + score;
  }
  let best = '';
  let bestScore = 0;
  for (const [val, s] of Object.entries(counts)) {
    if (s > bestScore) { bestScore = s; best = val; }
  }
  return best;
}

// ── Tasting Note Aggregation ────────────────────────────

function aggregateTastingNotes(brews: Array<{ brew: BrewWithMethod }>, limit: number): TastingNote[] {
  const counts: Record<string, number> = {};
  for (const { brew } of brews) {
    if (!brew.notes) continue;
    for (const raw of brew.notes.split(',')) {
      const note = raw.trim().toLowerCase();
      if (note) counts[note] = (counts[note] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([note, count]) => ({ note, count }));
}

// ── Main Compute ────────────────────────────────────────

/**
 * Deterministic "best coffee" baseline.
 * Given origin + roast + method → searches similar brews → computes
 * weighted consensus params → falls back to method defaults.
 * No LLM. Pure math. Same input = same output (until new data arrives).
 */
export async function computeBestBrew(
  params: RecommendationParams,
): Promise<Recommendation> {
  const methods = await getBrewingMethods();

  // Resolve method
  const method = params.brewing_method_id
    ? methods.find((m) => m.id === params.brewing_method_id)
    : methods[0];
  if (!method) throw new Error(params.brewing_method_id ? 'Brewing method not found' : 'No brewing methods available');

  // Determine data points provided
  let dataPoints = 0;
  if (params.origin) dataPoints++;
  if (params.variety) dataPoints++;
  if (params.roast_level) dataPoints++;
  if (params.brewing_method_id) dataPoints++;
  if (params.grind_size) dataPoints++;
  if (params.water_temp_c !== undefined) dataPoints++;
  if (params.ratio !== undefined) dataPoints++;
  if (params.brew_time_s !== undefined) dataPoints++;

  // Search for matching brews
  const { brews } = await getBrews({ limit: 50 });

  // Score and filter
  const scored = brews
    .map((brew) => ({
      brew,
      matchScore: matchScore(brew, params),
    }))
    .filter(({ matchScore: ms }) => ms > 0)
    .map(({ brew, matchScore: ms }) => ({
      brew,
      score: ms * (brew.rating / 5) * recencyDecay(brew.created_at) * sourceTrust(brew.source) * originConf(brew),
    }))
    .sort((a, b) => b.score - a.score);

  // Top-N
  const topN = scored.slice(0, 5);
  const totalWeight = topN.reduce((s, { score }) => s + score, 0);

  let confidence: 'high' | 'medium' | 'low';
  let sources: SourceRef[];
  let consensus: { water_temp_c: number; ratio: number; brew_time_s: number; grind_size: string };

  if (topN.length >= 3 && totalWeight > 1.5) {
    confidence = 'high';
    sources = topN.map(({ brew: b, score }) => ({ brew_id: b.id, relevance: score }));
    consensus = {
      water_temp_c: Math.round(weightedAvg(topN, 'water_temp_c', totalWeight)),
      ratio: weightedAvg(topN, 'ratio', totalWeight),
      brew_time_s: Math.round(weightedAvg(topN, 'brew_time_s', totalWeight)),
      grind_size: modeField(topN, 'grind_size'),
    };
  } else if (topN.length >= 1) {
    confidence = 'medium';
    sources = topN.map(({ brew: b, score }) => ({ brew_id: b.id, relevance: score }));
    // Blend top matches with method defaults (50/50 when only 1 match)
    const blendWeight = Math.min(totalWeight, 1);
    consensus = {
      water_temp_c: Math.round(
        (weightedAvg(topN, 'water_temp_c', totalWeight) * blendWeight) +
        (method.default_temp_c * (1 - blendWeight)),
      ),
      ratio: (weightedAvg(topN, 'ratio', totalWeight) * blendWeight) +
             (method.default_ratio * (1 - blendWeight)),
      brew_time_s: Math.round(
        (weightedAvg(topN, 'brew_time_s', totalWeight) * blendWeight) +
        (method.default_brew_time_s * (1 - blendWeight)),
      ),
      grind_size: modeField(topN, 'grind_size') || method.grind_size,
    };
  } else {
    // No matches — pure method defaults
    confidence = 'low';
    sources = [];
    consensus = {
      water_temp_c: method.default_temp_c,
      ratio: method.default_ratio,
      brew_time_s: method.default_brew_time_s,
      grind_size: method.grind_size,
    };
  }

  // Build recommendation text
  const originText = params.origin || 'your coffee';
  const roastText = params.roast_level ? ` (${params.roast_level} roast)` : '';
  const sourceText = topN.length > 0
    ? `Based on ${topN.length} community brew${topN.length > 1 ? 's' : ''}`
    : `No community data yet — using ${method.name} defaults`;

  const recommendation = `${sourceText}. For ${originText}${roastText}, try ${method.name} at ${consensus.water_temp_c}°C with a ${consensus.grind_size} grind, ${consensus.brew_time_s}s brew time, 1:${Math.round(1 / consensus.ratio)} ratio.`;

  // Upsert prediction (deterministic fingerprint → votes accumulate across calls)
  const rec = await createRecommendation({
    brewing_method_id: method.id,
    origin: params.origin || '',
    roast_level: params.roast_level || '',
    grind_size: consensus.grind_size,
    water_temp_c: consensus.water_temp_c,
    ratio: consensus.ratio,
    brew_time_s: consensus.brew_time_s,
    recommendation,
    confidence,
    confidence_breakdown: JSON.stringify({ data_points: dataPoints, match_count: topN.length, match_quality: topN.length > 0 ? (totalWeight / topN.length).toFixed(2) : '0' }),
    sources: JSON.stringify(sources),
  });

  const tasting_notes = aggregateTastingNotes(topN, 8);

  return {
    id: rec.id,
    brewing_method: method.name,
    input: {
      origin: params.origin || '',
      variety: params.variety,
      roast_level: params.roast_level || '',
      grind_size: consensus.grind_size,
      water_temp_c: consensus.water_temp_c,
      ratio: consensus.ratio,
      brew_time_s: consensus.brew_time_s,
    },
    recommendation,
    confidence,
    sources,
    data_points_used: topN.length,
    technique: method.technique ?? null,
    tasting_notes,
    thumbs_up: rec.thumbs_up,
    thumbs_down: rec.thumbs_down,
  };
}

// ── Auto-Linking ────────────────────────────────────────

/**
 * After a brew is logged, try to link it to a recent recommendation
 * with matching origin + method + roast. Returns link if found, null otherwise.
 */
export async function tryLinkBrew(brew: Brew): Promise<{ linked: boolean; recommendationId?: number }> {
  const recent = await findRecentRecommendation({
    origin: brew.origin,
    brewing_method_id: brew.brewing_method_id,
    roast_level: brew.roast_level,
  });

  if (recent) {
    await linkBrewToRecommendation(brew.id, recent.id, 0.85);
    return { linked: true, recommendationId: recent.id };
  }
  return { linked: false };
}

// ── Origin Resolution ────────────────────────────────────

/**
 * Given a user-supplied origin string, try to resolve it to a known origin.
 * Uses exact match → alias match → fuzzy substring → returns input as-is.
 */
export async function resolveOrigin(raw: string): Promise<{ resolved: string; verified: boolean }> {
  const origins = await getOrigins();
  const q = raw.trim();

  if (!q) return { resolved: raw, verified: false };

  // Exact match
  const exact = origins.find(o => o.name.toLowerCase() === q.toLowerCase());
  if (exact) return { resolved: exact.name, verified: exact.is_verified };

  // Alias match — filter empty strings so origins with aliases:'' don't match blank input
  const alias = origins.find(o =>
    (o.aliases || '').split(',').map(a => a.trim()).filter(Boolean).some(a => a.toLowerCase() === q.toLowerCase()),
  );
  if (alias) return { resolved: alias.name, verified: true };

  // Fuzzy — if origin name contains user input or vice versa
  const fuzzy = origins.find(o =>
    o.name.toLowerCase().includes(q.toLowerCase()) ||
    q.toLowerCase().includes(o.name.toLowerCase()),
  );
  if (fuzzy) return { resolved: fuzzy.name, verified: false };

  // Unknown — accept as new origin
  return { resolved: q, verified: false };
}
