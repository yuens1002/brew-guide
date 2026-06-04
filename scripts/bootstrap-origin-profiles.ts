/**
 * scripts/bootstrap-origin-profiles.ts
 *
 * Upserts origin_brew_profiles for all seeded origins.
 *
 * Strategy:
 *   1. Origins with existing brew data → derive curated profiles from DB brews
 *   2. Remaining seeded origins with no brews → generate via LLM (Pour Over + light/medium)
 *
 * Usage: npx tsx scripts/bootstrap-origin-profiles.ts
 *
 * Requirements: DATABASE_URL must be set; OPENROUTER_API_KEY needed for LLM fallbacks.
 * Idempotent — safe to re-run; existing profiles are updated.
 */

import { PrismaClient } from '@prisma/client';
import { generateAndUpsertProfile } from '../src/lib/origin-profile.js';

const prisma = new PrismaClient();

async function main() {
  const methods = await prisma.brewingMethod.findMany({ orderBy: { id: 'asc' } });
  const methodMap = Object.fromEntries(methods.map(m => [m.name, m]));

  const pourOver = methodMap['Pour Over'];
  const espresso = methodMap['Espresso'];
  if (!pourOver || !espresso) throw new Error('Pour Over or Espresso method not found in DB');

  const origins = await prisma.origin.findMany({ orderBy: { name: 'asc' } });

  // Group existing brews by (origin, roast_level, brewing_method_id)
  const brews = await prisma.brew.findMany({
    where: { notes: { not: null } },
    select: { origin: true, roast_level: true, brewing_method_id: true, notes: true, water_temp_c: true, ratio: true, brew_time_s: true, grind_size: true },
  });

  type BrewGroup = Map<string, typeof brews>;
  const grouped: BrewGroup = new Map();
  for (const b of brews) {
    const key = `${b.origin}|${b.roast_level}|${b.brewing_method_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(b);
  }

  let upserted = 0;
  let generated = 0;
  let skipped = 0;

  // 1. Upsert curated profiles from existing brews
  for (const [key, group] of grouped.entries()) {
    const [origin, roastLevel, methodIdStr] = key.split('|');
    const methodId = parseInt(methodIdStr, 10);
    const method = methods.find(m => m.id === methodId);
    if (!method) continue;

    // Aggregate tasting notes
    const noteCounts: Record<string, number> = {};
    for (const b of group) {
      if (!b.notes) continue;
      for (const raw of b.notes.split(',')) {
        const note = raw.trim().toLowerCase();
        if (note) noteCounts[note] = (noteCounts[note] ?? 0) + 1;
      }
    }
    const tastingNotes = Object.entries(noteCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([note]) => note)
      .join(', ');

    // Consensus brew params
    const waterTemps = group.map(b => b.water_temp_c).filter(v => v > 0);
    const ratios = group.map(b => b.ratio).filter(v => v > 0);
    const times = group.map(b => b.brew_time_s).filter(v => v > 0);
    const grindCounts: Record<string, number> = {};
    for (const b of group) {
      if (b.grind_size) grindCounts[b.grind_size] = (grindCounts[b.grind_size] ?? 0) + 1;
    }
    const grindMode = Object.entries(grindCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || method.grind_size;

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    await prisma.originBrewProfile.upsert({
      where: { origin_roast_level_brewing_method_id: { origin, roast_level: roastLevel, brewing_method_id: methodId } },
      update: {
        water_temp_c: Math.round(avg(waterTemps)) || method.default_temp_c,
        ratio: avg(ratios) || method.default_ratio,
        brew_time_s: Math.round(avg(times)) || method.default_brew_time_s,
        grind_size: grindMode,
        tasting_notes: tastingNotes,
        source: 'curated',
        confident: true,
        last_verified: new Date(),
      },
      create: {
        origin,
        roast_level: roastLevel,
        brewing_method_id: methodId,
        water_temp_c: Math.round(avg(waterTemps)) || method.default_temp_c,
        ratio: avg(ratios) || method.default_ratio,
        brew_time_s: Math.round(avg(times)) || method.default_brew_time_s,
        grind_size: grindMode,
        tasting_notes: tastingNotes,
        technique: null,
        source: 'curated',
        confident: true,
        last_verified: new Date(),
      },
    });
    upserted++;
    console.log(`  curated: ${origin} / ${roastLevel} / ${method.name}`);
  }

  // 2. LLM-generate profiles for seeded origins with no brew data (Pour Over, light + medium)
  const originNamesWithBrews = new Set(brews.map(b => b.origin.toLowerCase()));
  const targetRoasts = ['light', 'medium'];

  for (const origin of origins) {
    if (originNamesWithBrews.has(origin.name.toLowerCase())) continue;

    for (const roastLevel of targetRoasts) {
      // Check Pour Over
      const existing = await prisma.originBrewProfile.findUnique({
        where: { origin_roast_level_brewing_method_id: { origin: origin.name, roast_level: roastLevel, brewing_method_id: pourOver.id } },
      });
      if (existing?.confident) { skipped++; continue; }

      console.log(`  llm: ${origin.name} / ${roastLevel} / Pour Over`);
      const result = await generateAndUpsertProfile(origin.name, roastLevel, {
        id: pourOver.id,
        name: pourOver.name,
        description: '',
        default_ratio: pourOver.default_ratio,
        default_temp_c: pourOver.default_temp_c,
        default_brew_time_s: pourOver.default_brew_time_s,
        grind_size: pourOver.grind_size,
        technique: null,
      });
      if (result?.confident) generated++;
      else { console.log(`    → low confidence (queued for cron review)`); generated++; }
    }
  }

  console.log(`\nDone. Curated: ${upserted} | LLM-generated: ${generated} | Skipped: ${skipped}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
