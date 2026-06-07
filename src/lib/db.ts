import { PrismaClient, Prisma } from '@prisma/client';
import { isFlavorNote } from './flavor-utils.js';
import type {
  BrewingMethod, Brew, BrewWithMethod, BrewSource,
  Origin, RecommendationRecord, BrewRecommendationLink, BrewTechnique, TastingNote, VoteResponse,
  OriginBrewProfile,
} from '../types.js';

const prisma = new PrismaClient();

// ── Origins ─────────────────────────────────────────────

export async function getOrigins(): Promise<Origin[]> {
  const rows = await prisma.origin.findMany({ orderBy: { name: 'asc' } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    subregion: r.subregion ?? undefined,
    variety: r.variety ?? undefined,
    aliases: r.aliases ?? undefined,
    is_verified: r.is_verified,
  }));
}

// ── Brewing Methods ─────────────────────────────────────

export async function getBrewingMethods(): Promise<BrewingMethod[]> {
  const rows = await prisma.brewingMethod.findMany({ orderBy: { id: 'asc' } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    default_ratio: r.default_ratio,
    default_temp_c: r.default_temp_c,
    default_brew_time_s: r.default_brew_time_s,
    grind_size: r.grind_size,
    technique: r.technique as BrewTechnique | null,
  }));
}

// ── Brews ────────────────────────────────────────────────

export async function getBrews(filters?: {
  origin?: string;
  method?: number;
  limit?: number;
}): Promise<{ count: number; brews: BrewWithMethod[] }> {
  const where = {
    ...(filters?.origin ? { origin: filters.origin } : {}),
    ...(filters?.method !== undefined ? { brewing_method_id: filters.method } : {}),
  };

  const [rows, count] = await prisma.$transaction([
    prisma.brew.findMany({
      where,
      include: { brewing_method: true },
      orderBy: { created_at: 'desc' },
      ...(filters?.limit ? { take: filters.limit } : {}),
    }),
    prisma.brew.count({ where }),
  ]);

  const brews: BrewWithMethod[] = rows.map((r) => ({
    id: r.id,
    brewing_method_id: r.brewing_method_id,
    brewing_method: r.brewing_method.name,
    origin: r.origin,
    variety: r.variety ?? undefined,
    roast_level: r.roast_level,
    grind_size: r.grind_size,
    water_temp_c: r.water_temp_c,
    ratio: r.ratio,
    brew_time_s: r.brew_time_s,
    rating: r.rating,
    notes: r.notes ?? undefined,
    tasting_notes: r.tasting_notes ?? undefined,
    created_at: r.created_at.toISOString(),
    source: (r.source as BrewSource) || 'user_submitted',
    source_url: r.source_url ?? undefined,
    field_confidence: r.field_confidence ?? undefined,
    technique: r.technique as BrewTechnique | null,
  }));

  return { count, brews };
}

export async function getBrewById(id: number): Promise<Brew | null> {
  const r = await prisma.brew.findUnique({ where: { id } });
  if (!r) return null;
  return {
    id: r.id,
    brewing_method_id: r.brewing_method_id,
    origin: r.origin,
    variety: r.variety ?? undefined,
    roast_level: r.roast_level,
    grind_size: r.grind_size,
    water_temp_c: r.water_temp_c,
    ratio: r.ratio,
    brew_time_s: r.brew_time_s,
    rating: r.rating,
    notes: r.notes ?? undefined,
    tasting_notes: r.tasting_notes ?? undefined,
    created_at: r.created_at.toISOString(),
    source: (r.source as BrewSource) || 'user_submitted',
    source_url: r.source_url ?? undefined,
    field_confidence: r.field_confidence ?? undefined,
    technique: r.technique as BrewTechnique | null,
  };
}

export async function addBrew(
  brew: Omit<Brew, 'id' | 'created_at'> & { source?: BrewSource; source_url?: string; field_confidence?: string },
): Promise<Brew> {
  const r = await prisma.brew.create({
    data: {
      brewing_method_id: brew.brewing_method_id,
      origin: brew.origin,
      variety: brew.variety ?? null,
      roast_level: brew.roast_level,
      grind_size: brew.grind_size,
      water_temp_c: brew.water_temp_c,
      ratio: brew.ratio,
      brew_time_s: brew.brew_time_s,
      rating: brew.rating,
      notes: brew.notes ?? null,
      tasting_notes: brew.tasting_notes ?? null,
      source: brew.source || 'user_submitted',
      source_url: brew.source_url ?? null,
      field_confidence: brew.field_confidence ?? null,
      technique: brew.technique != null ? (brew.technique as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
  return {
    id: r.id,
    brewing_method_id: r.brewing_method_id,
    origin: r.origin,
    variety: r.variety ?? undefined,
    roast_level: r.roast_level,
    grind_size: r.grind_size,
    water_temp_c: r.water_temp_c,
    ratio: r.ratio,
    brew_time_s: r.brew_time_s,
    rating: r.rating,
    notes: r.notes ?? undefined,
    tasting_notes: r.tasting_notes ?? undefined,
    created_at: r.created_at.toISOString(),
    source: (r.source as BrewSource) || 'user_submitted',
    source_url: r.source_url ?? undefined,
    field_confidence: r.field_confidence ?? undefined,
    technique: r.technique as BrewTechnique | null,
  };
}

export async function getTastingNotes(): Promise<TastingNote[]> {
  const rows = await prisma.brew.findMany({
    where: { OR: [{ notes: { not: null } }, { tasting_notes: { not: null } }] },
    select: { notes: true, tasting_notes: true },
  });
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.tasting_notes) {
      for (const raw of row.tasting_notes.split(',')) {
        const note = raw.trim().toLowerCase();
        if (note) counts[note] = (counts[note] ?? 0) + 1;
      }
    } else if (row.notes) {
      for (const raw of row.notes.split(',')) {
        const note = raw.trim().toLowerCase();
        if (isFlavorNote(raw) && note) counts[note] = (counts[note] ?? 0) + 1;
      }
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([note, count]) => ({ note, count }));
}

export async function updateBrewTechnique(id: number, technique: BrewTechnique): Promise<void> {
  await prisma.brew.update({ where: { id }, data: { technique: technique as Prisma.InputJsonValue } });
}

// ── Recommendations ─────────────────────────────────────

export async function createRecommendation(
  rec: Omit<RecommendationRecord, 'id' | 'created_at' | 'fingerprint' | 'thumbs_up' | 'thumbs_down'>,
): Promise<RecommendationRecord> {
  // Deterministic fingerprint: same origin+roast+method → same record (votes accumulate)
  const fingerprint = `${(rec.origin || 'unknown').toLowerCase()}-${(rec.roast_level || 'unknown').toLowerCase()}-${rec.brewing_method_id}`;
  const r = await prisma.recommendation.upsert({
    where: { fingerprint },
    update: {
      grind_size: rec.grind_size,
      water_temp_c: rec.water_temp_c,
      ratio: rec.ratio,
      brew_time_s: rec.brew_time_s,
      recommendation: rec.recommendation,
      confidence: rec.confidence,
      confidence_breakdown: rec.confidence_breakdown ?? null,
      sources: rec.sources ?? null,
    },
    create: {
      brewing_method_id: rec.brewing_method_id,
      origin: rec.origin,
      roast_level: rec.roast_level,
      grind_size: rec.grind_size,
      water_temp_c: rec.water_temp_c,
      ratio: rec.ratio,
      brew_time_s: rec.brew_time_s,
      recommendation: rec.recommendation,
      confidence: rec.confidence,
      confidence_breakdown: rec.confidence_breakdown ?? null,
      sources: rec.sources ?? null,
      fingerprint,
      thumbs_up: 0,
      thumbs_down: 0,
    },
  });
  return {
    id: r.id,
    brewing_method_id: r.brewing_method_id,
    origin: r.origin,
    roast_level: r.roast_level,
    grind_size: r.grind_size,
    water_temp_c: r.water_temp_c,
    ratio: r.ratio,
    brew_time_s: r.brew_time_s,
    recommendation: r.recommendation,
    confidence: r.confidence,
    confidence_breakdown: r.confidence_breakdown ?? undefined,
    sources: r.sources ?? undefined,
    fingerprint: r.fingerprint,
    thumbs_up: r.thumbs_up,
    thumbs_down: r.thumbs_down,
    created_at: r.created_at.toISOString(),
  };
}

export async function getRecommendation(id: number): Promise<RecommendationRecord | null> {
  const r = await prisma.recommendation.findUnique({ where: { id } });
  if (!r) return null;
  return {
    id: r.id,
    brewing_method_id: r.brewing_method_id,
    origin: r.origin,
    roast_level: r.roast_level,
    grind_size: r.grind_size,
    water_temp_c: r.water_temp_c,
    ratio: r.ratio,
    brew_time_s: r.brew_time_s,
    recommendation: r.recommendation,
    confidence: r.confidence,
    confidence_breakdown: r.confidence_breakdown ?? undefined,
    sources: r.sources ?? undefined,
    fingerprint: r.fingerprint,
    thumbs_up: r.thumbs_up,
    thumbs_down: r.thumbs_down,
    created_at: r.created_at.toISOString(),
  };
}

export async function findRecentRecommendation(params: {
  origin?: string;
  brewing_method_id?: number;
  roast_level?: string;
  withinSeconds?: number;
}): Promise<RecommendationRecord | null> {
  const since = new Date(Date.now() - (params.withinSeconds || 604800) * 1000);
  const r = await prisma.recommendation.findFirst({
    where: {
      origin: params.origin || '',
      brewing_method_id: params.brewing_method_id || 0,
      roast_level: params.roast_level || '',
      created_at: { gte: since },
    },
    orderBy: { created_at: 'desc' },
  });
  if (!r) return null;
  return {
    id: r.id,
    brewing_method_id: r.brewing_method_id,
    origin: r.origin,
    roast_level: r.roast_level,
    grind_size: r.grind_size,
    water_temp_c: r.water_temp_c,
    ratio: r.ratio,
    brew_time_s: r.brew_time_s,
    recommendation: r.recommendation,
    confidence: r.confidence,
    confidence_breakdown: r.confidence_breakdown ?? undefined,
    sources: r.sources ?? undefined,
    fingerprint: r.fingerprint,
    thumbs_up: r.thumbs_up,
    thumbs_down: r.thumbs_down,
    created_at: r.created_at.toISOString(),
  };
}

// ── Brew ↔ Recommendation Links ──────────────────────────

export async function linkBrewToRecommendation(
  brewId: number,
  recommendationId: number,
  matchConfidence: number,
  userVote?: 'up' | 'down' | null,
): Promise<BrewRecommendationLink> {
  const r = await prisma.brewRecommendationLink.upsert({
    where: { brew_id_recommendation_id: { brew_id: brewId, recommendation_id: recommendationId } },
    update: { match_confidence: matchConfidence, user_vote: userVote ?? null, linked_at: new Date() },
    create: { brew_id: brewId, recommendation_id: recommendationId, match_confidence: matchConfidence, user_vote: userVote ?? null },
  });
  return {
    brew_id: r.brew_id,
    recommendation_id: r.recommendation_id,
    match_confidence: r.match_confidence,
    user_vote: (r.user_vote as 'up' | 'down' | null) ?? undefined,
    linked_at: r.linked_at.toISOString(),
  };
}

export async function getBrewLinks(brewId: number): Promise<BrewRecommendationLink[]> {
  const rows = await prisma.brewRecommendationLink.findMany({ where: { brew_id: brewId }, orderBy: { linked_at: 'desc' } });
  return rows.map((r) => ({
    brew_id: r.brew_id,
    recommendation_id: r.recommendation_id,
    match_confidence: r.match_confidence,
    user_vote: (r.user_vote as 'up' | 'down' | null) ?? undefined,
    linked_at: r.linked_at.toISOString(),
  }));
}

// ── Origin Brew Profiles ─────────────────────────────────

function mapProfile(r: {
  id: number; origin: string; roast_level: string; brewing_method_id: number;
  water_temp_c: number; ratio: number; brew_time_s: number; grind_size: string;
  tasting_notes: string; technique: Prisma.JsonValue; source: string;
  confident: boolean; generated_at: Date; last_verified: Date | null;
}): OriginBrewProfile {
  return {
    id: r.id,
    origin: r.origin,
    roast_level: r.roast_level,
    brewing_method_id: r.brewing_method_id,
    water_temp_c: r.water_temp_c,
    ratio: r.ratio,
    brew_time_s: r.brew_time_s,
    grind_size: r.grind_size,
    tasting_notes: r.tasting_notes,
    technique: r.technique as BrewTechnique | null,
    source: r.source as OriginBrewProfile['source'],
    confident: r.confident,
    generated_at: r.generated_at.toISOString(),
    last_verified: r.last_verified?.toISOString() ?? null,
  };
}

export async function getOriginBrewProfile(
  origin: string,
  roastLevel: string,
  brewingMethodId: number,
): Promise<OriginBrewProfile | null> {
  const r = await prisma.originBrewProfile.findUnique({
    where: { origin_roast_level_brewing_method_id: { origin, roast_level: roastLevel, brewing_method_id: brewingMethodId } },
  });
  return r ? mapProfile(r) : null;
}

export async function upsertOriginBrewProfile(
  profile: Omit<OriginBrewProfile, 'id' | 'generated_at' | 'last_verified'> & { last_verified?: Date },
): Promise<OriginBrewProfile> {
  const data = {
    water_temp_c: profile.water_temp_c,
    ratio: profile.ratio,
    brew_time_s: profile.brew_time_s,
    grind_size: profile.grind_size,
    tasting_notes: profile.tasting_notes,
    technique: profile.technique != null ? (profile.technique as Prisma.InputJsonValue) : Prisma.JsonNull,
    source: profile.source,
    confident: profile.confident,
    last_verified: profile.last_verified ?? new Date(),
  };
  const r = await prisma.originBrewProfile.upsert({
    where: { origin_roast_level_brewing_method_id: { origin: profile.origin, roast_level: profile.roast_level, brewing_method_id: profile.brewing_method_id } },
    update: data,
    create: { origin: profile.origin, roast_level: profile.roast_level, brewing_method_id: profile.brewing_method_id, ...data },
  });
  return mapProfile(r);
}

export async function getUnverifiedOriginProfiles(olderThanDays: number): Promise<OriginBrewProfile[]> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.originBrewProfile.findMany({
    where: {
      OR: [
        { source: 'needs_review' },
        { last_verified: { lt: cutoff } },
        { last_verified: null },
      ],
    },
  });
  return rows.map(mapProfile);
}

// ── Vote Counts ───────────────────────────────────────────

export async function getVoteCounts(recommendationId: number): Promise<{ thumbs_up: number; thumbs_down: number }> {
  const r = await prisma.recommendation.findUnique({
    where: { id: recommendationId },
    select: { thumbs_up: true, thumbs_down: true },
  });
  return { thumbs_up: r?.thumbs_up ?? 0, thumbs_down: r?.thumbs_down ?? 0 };
}

export async function recordVote(recommendationId: number, vote: 'up' | 'down'): Promise<VoteResponse> {
  const r = await prisma.recommendation.update({
    where: { id: recommendationId },
    data: vote === 'up' ? { thumbs_up: { increment: 1 } } : { thumbs_down: { increment: 1 } },
    select: { thumbs_up: true, thumbs_down: true },
  });
  return r;
}
