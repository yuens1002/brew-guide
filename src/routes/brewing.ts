import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getBrewingMethods, getBrews, getBrewById, addBrew, updateBrewTechnique, getTastingNotes, getOrigins, getBrewLinks, recordVote, getRecommendation, getOriginBrewProfile } from '../lib/db.js';
import { computeBestBrew, tryLinkBrew, resolveOrigin } from '../lib/recommend.js';
import { extractTechnique } from '../lib/llm.js';
import type { BrewingMethod, Brew, BrewTechnique } from '../types.js';

const app = new Hono();

// GET /origins
app.get('/origins', async (c) => {
  const origins = await getOrigins();
  return c.json(origins);
});

// GET /tasting-notes
app.get('/tasting-notes', async (c) => {
  const notes = await getTastingNotes();
  return c.json(notes);
});

// GET /tasting-suggestions?origin=X&roast_level=Y&method_id=Z
app.get('/tasting-suggestions', async (c) => {
  const origin = c.req.query('origin');
  if (!origin) return c.json([]);

  const roastLevel = c.req.query('roast_level');
  const methodIdRaw = c.req.query('method_id');
  const methodId = methodIdRaw ? parseInt(methodIdRaw, 10) : NaN;

  if (roastLevel && !isNaN(methodId)) {
    const profile = await getOriginBrewProfile(origin, roastLevel, methodId);
    if (profile?.confident && profile.tasting_notes) {
      const notes = profile.tasting_notes
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      return c.json(notes);
    }
  }

  const global = await getTastingNotes();
  return c.json(global.slice(0, 20).map((n) => n.note));
});

// GET /brewing-methods
app.get('/brewing-methods', async (c) => {
  const methods = await getBrewingMethods();
  return c.json(methods);
});

// GET /brews?origin=&method=&limit=
app.get('/brews', async (c) => {
  const origin = c.req.query('origin');
  const methodRaw = c.req.query('method');
  const limitRaw = c.req.query('limit');

  const filters: { origin?: string; method?: number; limit?: number } = {};
  if (origin) filters.origin = origin;
  if (methodRaw) {
    const m = parseInt(methodRaw, 10);
    if (!isNaN(m)) filters.method = m;
  }
  if (limitRaw) {
    const l = parseInt(limitRaw, 10);
    if (!isNaN(l)) filters.limit = l;
  }

  const result = await getBrews(filters);
  return c.json(result);
});

// POST /brews
const brewSchema = z.object({
  brewing_method_id: z.number(),
  origin: z.string(),
  variety: z.string().optional(),
  roast_level: z.string(),
  grind_size: z.string(),
  water_temp_c: z.number(),
  ratio: z.number(),
  brew_time_s: z.number(),
  rating: z.number().int().min(1).max(5),
  notes: z.string().optional(),
  technique: z.object({}).passthrough().optional(),
  source: z.enum(['user_submitted', 'scraped:reddit', 'scraped:home-barista', 'scraped:roaster']).optional().default('user_submitted'),
  source_url: z.string().url().optional(),
  field_confidence: z.string().optional(),
});

app.post('/brews', zValidator('json', brewSchema), async (c) => {
  const data = c.req.valid('json');
  const { resolved: origin, verified } = await resolveOrigin(data.origin);

  // Compute origin confidence from resolution quality and merge into field_confidence
  const originConfValue = verified ? 1.0 : origin !== data.origin ? 0.7 : 0.5;
  let base: Record<string, unknown> = {};
  if (data.field_confidence) {
    try { base = JSON.parse(data.field_confidence); } catch { /* ignore invalid JSON */ }
  }
  const fieldConfidence = JSON.stringify({ ...base, origin: originConfValue });

  const brew = await addBrew({
    brewing_method_id: data.brewing_method_id,
    origin,
    variety: data.variety,
    roast_level: data.roast_level,
    grind_size: data.grind_size,
    water_temp_c: data.water_temp_c,
    ratio: data.ratio,
    brew_time_s: data.brew_time_s,
    rating: data.rating,
    notes: data.notes,
    technique: data.technique as BrewTechnique | undefined,
    source: data.source,
    source_url: data.source_url,
    field_confidence: fieldConfidence,
  });
  tryLinkBrew(brew).catch(() => {}); // fire-and-forget implicit feedback link

  if (!data.technique && data.notes) {
    const brewId = brew.id;
    const methodId = data.brewing_method_id;
    const notes = data.notes;
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

  return c.json({ id: brew.id, message: 'Brew record added successfully' }, 201);
});

// GET /brews/:id
app.get('/brews/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid brew ID' }, 400);
  const brew = await getBrewById(id);
  if (!brew) return c.json({ error: 'Brew not found' }, 404);
  return c.json(brew);
});

// GET /brews/:id/compare
app.get('/brews/:id/compare', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid brew ID' }, 400);

  const brew = await getBrewById(id);
  if (!brew) return c.json({ error: 'Brew not found' }, 404);

  const links = await getBrewLinks(brew.id);
  // Real match confidence from brew_recommendation_links; falls back to 0.5 if no recommendation was linked
  const matchScore = links.length > 0 ? links[0].match_confidence : 0.5;

  const methods = await getBrewingMethods();
  const method = methods.find((m) => m.id === brew.brewing_method_id);

  const tempDelta = method ? brew.water_temp_c - method.default_temp_c : 0;
  const timeDelta = method ? brew.brew_time_s - method.default_brew_time_s : 0;

  return c.json({
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
  });
});

// POST /recommend — deterministic community consensus via computeBestBrew()
const recommendSchema = z.object({
  brewing_method_id: z.number().optional(),
  origin: z.string().optional(),
  roast_level: z.string().optional(),
  grind_size: z.string().optional(),
  water_temp_c: z.number().optional(),
  ratio: z.number().optional(),
  brew_time_s: z.number().optional(),
  variety: z.string().optional(),
});

// POST /recommend/:id/vote
const voteSchema = z.object({ vote: z.enum(['up', 'down']) });

app.post('/recommend/:id/vote', zValidator('json', voteSchema), async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid recommendation ID' }, 400);
  const rec = await getRecommendation(id);
  if (!rec) return c.json({ error: 'Recommendation not found' }, 404);
  const { vote } = c.req.valid('json');
  const counts = await recordVote(id, vote);
  return c.json(counts);
});

app.post('/recommend', zValidator('json', recommendSchema), async (c) => {
  const params = c.req.valid('json');
  const resolvedOrigin = params.origin
    ? (await resolveOrigin(params.origin)).resolved
    : params.origin;
  try {
    const result = await computeBestBrew({ ...params, origin: resolvedOrigin, variety: params.variety });
    return c.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Recommendation failed';
    if (msg === 'Brewing method not found' || msg === 'No brewing methods available') {
      return c.json({ error: msg }, 404);
    }
    return c.json({ error: msg }, 500);
  }
});

export default app;
