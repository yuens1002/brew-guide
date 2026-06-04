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

  // Not found — write a needs_review placeholder first (acts as a lock so concurrent
  // requests see an existing row and don't trigger duplicate LLM generations), then
  // generate and overwrite if successful.
  Promise.resolve()
    .then(async () => {
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
      const payload = await generateOriginBrewProfile(origin, roastLevel, methodName);
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
      }
      // If null, placeholder remains as needs_review — cron will retry
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

  // Don't overwrite a confident or curated row with a failure placeholder
  const existing = await getOriginBrewProfile(origin, roastLevel, method.id);
  if (existing?.confident || existing?.source === 'curated') return existing;

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
