/**
 * scripts/batch-origin-profiles.ts
 *
 * Refreshes origin_brew_profiles rows that are stale or need review.
 * Intended to run as a weekly Railway cron or GitHub Actions scheduled workflow.
 *
 * Usage: npx tsx scripts/batch-origin-profiles.ts
 *
 * Env vars:
 *   DATABASE_URL          — required (Neon Postgres)
 *   OPENROUTER_API_KEY    — required for LLM generation
 *   ORIGIN_PROFILE_REFRESH_DAYS — cadence in days (default: 7)
 */

import { PrismaClient } from '@prisma/client';
import { generateAndUpsertProfile } from '../src/lib/origin-profile.js';

const prisma = new PrismaClient();
const REFRESH_DAYS = parseInt(process.env.ORIGIN_PROFILE_REFRESH_DAYS ?? '7', 10);

async function main() {
  const cutoff = new Date(Date.now() - REFRESH_DAYS * 24 * 60 * 60 * 1000);
  const methods = await prisma.brewingMethod.findMany();
  const methodMap = Object.fromEntries(methods.map(m => [m.id, m]));

  const pending = await prisma.originBrewProfile.findMany({
    where: {
      OR: [
        { source: 'needs_review' },
        { last_verified: { lt: cutoff } },
        { last_verified: null },
      ],
    },
  });

  console.log(`Processing ${pending.length} profiles (refresh cadence: ${REFRESH_DAYS} days)`);

  let refreshed = 0;
  let failed = 0;

  for (const row of pending) {
    const method = methodMap[row.brewing_method_id];
    if (!method) { console.warn(`  skip: unknown method id ${row.brewing_method_id}`); continue; }

    console.log(`  refreshing: ${row.origin} / ${row.roast_level} / ${method.name}`);
    try {
      const result = await generateAndUpsertProfile(row.origin, row.roast_level, {
        id: method.id,
        name: method.name,
        description: '',
        default_ratio: method.default_ratio,
        default_temp_c: method.default_temp_c,
        default_brew_time_s: method.default_brew_time_s,
        grind_size: method.grind_size,
        technique: null,
      });
      if (result?.confident) { refreshed++; console.log('    → confident'); }
      else { refreshed++; console.log('    → low confidence (needs_review)'); }
    } catch (e) {
      failed++;
      console.error(`    → error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nDone. Refreshed: ${refreshed} | Failed: ${failed}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
