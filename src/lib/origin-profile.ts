import type { OriginBrewProfile, BrewingMethod } from '../types.js';
import { getOriginBrewProfile, upsertOriginBrewProfile } from './db.js';
import { generateOriginBrewProfile } from './llm.js';

/**
 * Returns a confident stored profile for the given combination, or null.
 * If no profile exists at all, fires a background generation without blocking.
 */
export async function getOrTriggerOriginProfile(
  origin: string,
  roastLevel: string,
  methodId: number,
  methodName: string,
): Promise<OriginBrewProfile | null> {
  if (!origin || !roastLevel) return null;

  const existing = await getOriginBrewProfile(origin, roastLevel, methodId);

  if (existing) {
    return existing.confident ? existing : null;
  }

  // Not found — fire-and-forget generation
  Promise.resolve()
    .then(() => generateOriginBrewProfile(origin, roastLevel, methodName))
    .then(async (payload) => {
      if (payload) {
        await upsertOriginBrewProfile({
          origin,
          roast_level: roastLevel,
          brewing_method_id: methodId,
          water_temp_c: payload.water_temp_c,
          ratio: payload.ratio,
          brew_time_s: payload.brew_time_s,
          grind_size: payload.grind_size,
          tasting_notes: payload.tasting_notes.join(', '),
          technique: payload.technique,
          source: 'llm_generated',
          confident: true,
        });
      } else {
        // Low / no confidence — store as needs_review so cron can retry
        await upsertOriginBrewProfile({
          origin,
          roast_level: roastLevel,
          brewing_method_id: methodId,
          water_temp_c: 0,
          ratio: 0,
          brew_time_s: 0,
          grind_size: '',
          tasting_notes: '',
          technique: null,
          source: 'needs_review',
          confident: false,
        });
      }
    })
    .catch(() => {});

  return null;
}

/**
 * Generates a profile via LLM and upserts it. Used by bootstrap + cron scripts.
 * Returns the upserted profile on success, null on LLM failure.
 */
export async function generateAndUpsertProfile(
  origin: string,
  roastLevel: string,
  method: BrewingMethod,
): Promise<OriginBrewProfile | null> {
  const payload = await generateOriginBrewProfile(origin, roastLevel, method.name);

  if (payload) {
    return upsertOriginBrewProfile({
      origin,
      roast_level: roastLevel,
      brewing_method_id: method.id,
      water_temp_c: payload.water_temp_c,
      ratio: payload.ratio,
      brew_time_s: payload.brew_time_s,
      grind_size: payload.grind_size,
      tasting_notes: payload.tasting_notes.join(', '),
      technique: payload.technique,
      source: 'llm_generated',
      confident: true,
    });
  }

  return upsertOriginBrewProfile({
    origin,
    roast_level: roastLevel,
    brewing_method_id: method.id,
    water_temp_c: 0,
    ratio: 0,
    brew_time_s: 0,
    grind_size: '',
    tasting_notes: '',
    technique: null,
    source: 'needs_review',
    confident: false,
  });
}
