/**
 * One-shot backfill: extract technique data from notes for brews that have notes
 * but no technique yet.
 *
 * Usage: npx tsx scripts/backfill-technique.ts
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { extractTechnique } from '../src/lib/llm.js';
import type { BrewTechnique } from '../src/types.js';

const prisma = new PrismaClient();

async function main() {
  const brews = await prisma.brew.findMany({
    where: { notes: { not: null }, technique: { equals: Prisma.AnyNull } },
    include: { brewing_method: true },
    orderBy: { id: 'asc' },
  });

  console.log(`Found ${brews.length} brews with notes and no technique.`);

  let updated = 0;
  let skipped = 0;

  for (const brew of brews) {
    if (!brew.notes) continue;
    process.stdout.write(`  brew ${brew.id} (${brew.brewing_method.name})... `);

    const technique = await extractTechnique(brew.brewing_method.name, brew.notes);
    if (technique) {
      await prisma.brew.update({ where: { id: brew.id }, data: { technique: technique as object } });
      console.log('extracted');
      updated++;
    } else {
      console.log('skipped (no technique data in notes)');
      skipped++;
    }

    // Avoid rate-limit hammering
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
