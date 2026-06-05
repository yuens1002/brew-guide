import {
  getBrewingMethods, getBrews, getOrigins,
  createRecommendation, findRecentRecommendation, linkBrewToRecommendation,
  getOriginBrewProfile,
} from './db.js';
import { getOrTriggerOriginProfile } from './origin-profile.js';
import type {
  BrewWithMethod, Brew, BrewTechnique,
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

const TASTING_NOTE_NOISE = /\b(test|week|today|month|this|that|brew)\b/i;

function isFlavorNote(raw: string): boolean {
  const note = raw.trim().toLowerCase();
  if (note.length < 2 || note.length > 28) return false;
  if (note.split(/\s+/).length > 3) return false;
  if (TASTING_NOTE_NOISE.test(note)) return false;
  return true;
}

function aggregateTastingNotes(brews: Array<{ brew: BrewWithMethod }>, limit: number): TastingNote[] {
  const counts: Record<string, number> = {};
  for (const { brew } of brews) {
    if (brew.tasting_notes) {
      // Structured field: already clean, no noise filter needed
      for (const raw of brew.tasting_notes.split(',')) {
        const note = raw.trim().toLowerCase();
        if (note) counts[note] = (counts[note] ?? 0) + 1;
      }
    } else if (brew.notes) {
      // Fall back to parsing free-form notes (user-submitted brews without tasting_notes)
      for (const raw of brew.notes.split(',')) {
        const note = raw.trim().toLowerCase();
        if (isFlavorNote(raw) && note) counts[note] = (counts[note] ?? 0) + 1;
      }
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([note, count]) => ({ note, count }));
}

// ── Technique Aggregation ───────────────────────────────

/**
 * Aggregate technique fields from the top-N matched brews.
 * Generic field-type dispatch — no per-method hardcoding:
 *   number  → weighted average (1 decimal)
 *   boolean → weighted majority
 *   array   → highest-weight source (pour_stages etc.)
 *   string  → weighted mode
 * Falls back to methodDefault when no brews carry technique data.
 */
function aggregateTechnique(
  topN: Array<{ brew: BrewWithMethod; score: number }>,
  methodDefault: BrewTechnique | null | undefined,
): { technique: BrewTechnique | null; technique_sources_count: number } {
  const withTechnique = topN.filter(({ brew }) => brew.technique != null);

  if (withTechnique.length === 0)
    return { technique: methodDefault ?? null, technique_sources_count: 0 };
  if (withTechnique.length === 1)
    return { technique: withTechnique[0].brew.technique!, technique_sources_count: 1 };

  const merged: Record<string, unknown> = {};
  const allKeys = new Set(
    withTechnique.flatMap(({ brew }) => Object.keys(brew.technique as object)),
  );

  for (const key of allKeys) {
    const entries = withTechnique
      .filter(({ brew }) => (brew.technique as Record<string, unknown>)[key] != null)
      .map(({ brew, score }) => ({
        value: (brew.technique as Record<string, unknown>)[key],
        weight: score,
      }));
    if (!entries.length) continue;

    const sample = entries[0].value;
    const wSum = entries.reduce((s, e) => s + e.weight, 0);

    if (typeof sample === 'number') {
      merged[key] =
        Math.round(
          (entries.reduce((s, e) => s + (e.value as number) * e.weight, 0) / wSum) * 10,
        ) / 10;
    } else if (typeof sample === 'boolean') {
      const trueW = entries.filter(e => e.value === true).reduce((s, e) => s + e.weight, 0);
      merged[key] = trueW / wSum >= 0.5;
    } else if (Array.isArray(sample)) {
      merged[key] = entries.reduce((a, b) => (a.weight >= b.weight ? a : b)).value;
    } else {
      const votes: Record<string, number> = {};
      entries.forEach(({ value, weight }) => {
        votes[value as string] = (votes[value as string] ?? 0) + weight;
      });
      merged[key] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    }
  }

  return {
    technique: merged as unknown as BrewTechnique,
    technique_sources_count: withTechnique.length,
  };
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
  let method = params.brewing_method_id
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
  // Single profile reference shared by the no-community branch and the attribution block below
  let resolvedProfile: import('../types.js').OriginBrewProfile | null = null;

  // HIGH requires at least one brew actually matching the requested origin.
  // Without this, method+roast alone can push unrelated origins to HIGH.
  const hasOriginMatch = params.origin
    ? topN.some(({ brew }) => brew.origin.toLowerCase() === params.origin!.toLowerCase())
    : true;

  if (topN.length >= 3 && totalWeight > 1.5) {
    confidence = hasOriginMatch ? 'high' : 'medium';
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
    // No community matches — try origin brew profile
    const triggered = params.origin && params.roast_level
      ? await getOrTriggerOriginProfile(params.origin, params.roast_level, method.id, method.name)
      : null;
    resolvedProfile = triggered;

    if (triggered && triggered.confident) {
      confidence = 'medium';
      sources = [];
      consensus = {
        water_temp_c: triggered.water_temp_c,
        ratio: triggered.ratio,
        brew_time_s: triggered.brew_time_s,
        grind_size: triggered.grind_size,
      };
      // Inject profile technique if method has no seeded technique
      if (!method.technique && triggered.technique) {
        method = { ...method, technique: triggered.technique };
      }
    } else {
      confidence = 'low';
      sources = [];
      consensus = {
        water_temp_c: method.default_temp_c,
        ratio: method.default_ratio,
        brew_time_s: method.default_brew_time_s,
        grind_size: method.grind_size,
      };
    }
  }

  // For community paths, fetch profile once for attribution + tasting note supplement.
  // For the no-community path, reuse the already-fetched resolvedProfile (no second DB call).
  const profile = topN.length > 0 && params.origin && params.roast_level
    ? await getOriginBrewProfile(params.origin, params.roast_level, method.id)
    : resolvedProfile;
  const hasProfile = profile?.confident ?? false;

  // Build source attribution
  let source_attribution: string;
  if (topN.length > 0 && hasProfile) {
    source_attribution = `Based on ${topN.length} community brew${topN.length > 1 ? 's' : ''} + origin profile`;
  } else if (topN.length > 0) {
    source_attribution = `Based on ${topN.length} community brew${topN.length > 1 ? 's' : ''}`;
  } else if (hasProfile) {
    source_attribution = 'Origin profile informed this recommendation';
  } else {
    source_attribution = `No community data yet — using ${method.name} defaults`;
  }
  if (params.origin && !hasOriginMatch && topN.length > 0) {
    source_attribution += ' (origin not in our database — method/roast data only)';
  }

  // Build recommendation text
  const originText = params.origin || 'your coffee';
  const roastText = params.roast_level ? ` (${params.roast_level} roast)` : '';
  const recommendation = `${source_attribution}. For ${originText}${roastText}, try ${method.name} at ${consensus.water_temp_c}°C with a ${consensus.grind_size} grind, ${consensus.brew_time_s}s brew time, 1:${Math.round(1 / consensus.ratio)} ratio.`;

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

  const { technique, technique_sources_count } = aggregateTechnique(
    topN,
    method.technique ?? profile?.technique,
  );

  let tasting_notes = aggregateTastingNotes(topN, 8);

  // Supplement tasting notes from origin profile when community brews have none
  if (tasting_notes.length === 0 && hasProfile && profile?.tasting_notes) {
    tasting_notes = profile.tasting_notes
      .split(',')
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8)
      .map((note) => ({ note, count: 1 }));
  }

  // When community brews exist but produced no usable tasting notes (e.g. all entries
  // were noise like "test brew"), trigger a background profile fetch so future calls
  // can supplement from the LLM-generated profile.
  if (tasting_notes.length === 0 && topN.length > 0 && params.origin && params.roast_level && !hasProfile) {
    getOrTriggerOriginProfile(params.origin, params.roast_level, method.id, method.name).catch(() => {});
  }

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
    technique,
    technique_sources_count,
    tasting_notes,
    source_attribution,
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
