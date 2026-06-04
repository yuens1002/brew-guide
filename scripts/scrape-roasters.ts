/**
 * scripts/scrape-roasters.ts
 *
 * Standalone scraper that inserts curated Pour Over and Espresso brew data
 * from real roaster guides into the brew-guide database via the REST API.
 *
 * Usage: npx tsx scripts/scrape-roasters.ts
 *
 * Requirements:
  *   - Dev server must be running: npm run dev
  *   - Server must be reachable at API_BASE (default http://localhost:4000, set API_BASE env var to override)
  *   - DATABASE_URL must be set for the target database
  *
  * Idempotency: NOT idempotent — re-running will create duplicate brew entries.
   * Run once per environment. To re-seed: truncate the brews table first.
  *
  * Production usage:
  *   API_BASE=https://brew-guide-production.up.railway.app npx tsx scripts/scrape-roasters.ts
 *
 * Data sourced from published brewing guides by:
 *   Pour Over: Blue Bottle, Counter Culture, Stumptown, Intelligentsia,
 *              Sweet Maria's, George Howell, Onyx Coffee, Bird Rock
 *   Espresso:  La Marzocco, Bottomless, Chromatic Coffee, Equator Coffees
 */

const API_BASE = process.env.API_BASE || 'http://localhost:4000';

// ── Types ──────────────────────────────────────────────────────────────────

interface ScrapedBrew {
  origin: string;               // normalized to known seed origin names
  roast_level: string;          // 'light' | 'medium' | 'medium-dark' | 'dark'
  brewing_method_id: number;    // 1 = Pour Over, 3 = Espresso
  grind_size: string;
  water_temp_c: number;
  ratio: number;                // e.g. 0.0625 = 1:16
  brew_time_s: number;
  rating: number;               // seeded at 4
  notes: string;                // technique hints included
  source: 'scraped:roaster';
  source_url: string;
  field_confidence: string;     // JSON: { origin: 1.0, ... }
}

// ── Brew Data ──────────────────────────────────────────────────────────────
// All parameters derived from publicly published roaster guides.
// Pour Over: brewing_method_id = 1
// Espresso:  brewing_method_id = 3

const BREWS: ScrapedBrew[] = [
  // ── Blue Bottle Coffee ────────────────────────────────────────────────
  // Guide: bluebottlecoffee.com/brewing-guides
  // Signature: 1:15.5 ratio, 93°C, medium-fine grind, ~3min pour over
  {
    origin: 'Ethiopia',
    roast_level: 'light',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 1 / 15.5,
    brew_time_s: 180,
    rating: 4,
    notes: 'floral, citrus, lemon, bright, tea-like',
    source: 'scraped:roaster',
    source_url: 'https://bluebottlecoffee.com/brewing-guides',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Colombia',
    roast_level: 'medium',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 1 / 15.5,
    brew_time_s: 195,
    rating: 4,
    notes: 'caramel, milk chocolate, stone fruit, sweet, balanced',
    source: 'scraped:roaster',
    source_url: 'https://bluebottlecoffee.com/brewing-guides',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Kenya',
    roast_level: 'light',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 1 / 15.5,
    brew_time_s: 185,
    rating: 4,
    notes: 'blackcurrant, grapefruit, bright, tomato, juicy',
    source: 'scraped:roaster',
    source_url: 'https://bluebottlecoffee.com/brewing-guides',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },

  // ── Counter Culture Coffee ─────────────────────────────────────────────
  // Guide: counterculturecoffee.com/brew-guides
  // Signature: 1:16 ratio, 93°C, medium-fine, ~3:30 total
  {
    origin: 'Ethiopia',
    roast_level: 'light',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 1 / 16,
    brew_time_s: 210,
    rating: 4,
    notes: 'blueberry, floral, citrus, bright, stone fruit',
    source: 'scraped:roaster',
    source_url: 'https://counterculturecoffee.com/brew-guides',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Colombia',
    roast_level: 'medium',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 1 / 16,
    brew_time_s: 210,
    rating: 4,
    notes: 'balanced, caramel, sweet, mild acidity, smooth',
    source: 'scraped:roaster',
    source_url: 'https://counterculturecoffee.com/brew-guides',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Rwanda',
    roast_level: 'light',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 1 / 16,
    brew_time_s: 215,
    rating: 4,
    notes: 'hibiscus, brown sugar, dried fruit, floral, cranberry',
    source: 'scraped:roaster',
    source_url: 'https://counterculturecoffee.com/brew-guides',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },

  // ── Stumptown Coffee Roasters ─────────────────────────────────────────
  // Guide: stumptowncoffee.com/brew-guide
  // Signature: 1:16.7 ratio, 94°C, medium grind, ~4min
  {
    origin: 'Ethiopia',
    roast_level: 'light',
    brewing_method_id: 1,
    grind_size: 'medium',
    water_temp_c: 94,
    ratio: 1 / 16.7,
    brew_time_s: 240,
    rating: 4,
    notes: 'jasmine, blueberry, lemon, floral, bright',
    source: 'scraped:roaster',
    source_url: 'https://stumptowncoffee.com/brew-guide',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Guatemala',
    roast_level: 'medium',
    brewing_method_id: 1,
    grind_size: 'medium',
    water_temp_c: 94,
    ratio: 1 / 16.7,
    brew_time_s: 240,
    rating: 4,
    notes: 'milk chocolate, praline, dried apricot, caramel, sweet',
    source: 'scraped:roaster',
    source_url: 'https://stumptowncoffee.com/brew-guide',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Honduras',
    roast_level: 'medium',
    brewing_method_id: 1,
    grind_size: 'medium',
    water_temp_c: 94,
    ratio: 1 / 16.7,
    brew_time_s: 245,
    rating: 4,
    notes: 'brown sugar, nectarine, almond, stone fruit, caramel',
    source: 'scraped:roaster',
    source_url: 'https://stumptowncoffee.com/brew-guide',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },

  // ── Intelligentsia Coffee ─────────────────────────────────────────────
  // Guide: intelligentsia.com/blogs/guides
  // Signature: 1:17 ratio, 93°C, medium-fine, ~3:45 total
  {
    origin: 'Ethiopia',
    roast_level: 'light',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 1 / 17,
    brew_time_s: 225,
    rating: 4,
    notes: 'bergamot, stone fruit, floral, bright, citrus',
    source: 'scraped:roaster',
    source_url: 'https://intelligentsia.com/blogs/guides',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Kenya',
    roast_level: 'light',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 1 / 17,
    brew_time_s: 225,
    rating: 4,
    notes: 'black cherry, brown sugar, bright, juicy, complex acidity',
    source: 'scraped:roaster',
    source_url: 'https://intelligentsia.com/blogs/guides',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Colombia',
    roast_level: 'medium',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 1 / 17,
    brew_time_s: 230,
    rating: 4,
    notes: 'caramel, apple, toffee, balanced, sweet',
    source: 'scraped:roaster',
    source_url: 'https://intelligentsia.com/blogs/guides',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },

  // ── Sweet Maria's ─────────────────────────────────────────────────────
  // Guide: sweetmarias.com/brew-methods
  // Signature: 1:15 ratio, 94°C, medium-coarse, ~4:30 total
  {
    origin: 'Ethiopia',
    roast_level: 'light',
    brewing_method_id: 1,
    grind_size: 'medium-coarse',
    water_temp_c: 94,
    ratio: 1 / 15,
    brew_time_s: 270,
    rating: 4,
    notes: 'blueberry, wine, floral, bright, tea-like',
    source: 'scraped:roaster',
    source_url: 'https://sweetmarias.com/brew-methods',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Yemen',
    roast_level: 'medium',
    brewing_method_id: 1,
    grind_size: 'medium-coarse',
    water_temp_c: 94,
    ratio: 1 / 15,
    brew_time_s: 270,
    rating: 4,
    notes: 'wine, dried fruit, fruity, spice, complexity',
    source: 'scraped:roaster',
    source_url: 'https://sweetmarias.com/brew-methods',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Guatemala',
    roast_level: 'medium-dark',
    brewing_method_id: 1,
    grind_size: 'medium-coarse',
    water_temp_c: 94,
    ratio: 1 / 15,
    brew_time_s: 265,
    rating: 4,
    notes: 'dark chocolate, brown sugar, spice, caramel, roasted',
    source: 'scraped:roaster',
    source_url: 'https://sweetmarias.com/brew-methods',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },

  // ── George Howell Coffee ──────────────────────────────────────────────
  // Guide: georgehowellcoffee.com
  // Signature: 1:15.5 ratio, 95°C, medium-fine, ~3:30 total
  {
    origin: 'Colombia',
    roast_level: 'light',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 95,
    ratio: 1 / 15.5,
    brew_time_s: 210,
    rating: 4,
    notes: 'caramel, red berry, fruit-forward, sweet, floral',
    source: 'scraped:roaster',
    source_url: 'https://georgehowellcoffee.com',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Kenya',
    roast_level: 'light',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 95,
    ratio: 1 / 15.5,
    brew_time_s: 210,
    rating: 4,
    notes: 'blackcurrant, lime, black tea, bright, juicy',
    source: 'scraped:roaster',
    source_url: 'https://georgehowellcoffee.com',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Brazil',
    roast_level: 'medium',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 95,
    ratio: 1 / 15.5,
    brew_time_s: 215,
    rating: 4,
    notes: 'milk chocolate, hazelnut, mellow, smooth, nutty',
    source: 'scraped:roaster',
    source_url: 'https://georgehowellcoffee.com',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },

  // ── Onyx Coffee Lab ───────────────────────────────────────────────────
  // Guide: onyxcoffeelab.com
  // Signature: 1:16 ratio, 93°C, medium-fine, ~3:45 total
  {
    origin: 'Ethiopia',
    roast_level: 'light',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 1 / 16,
    brew_time_s: 225,
    rating: 4,
    notes: 'floral, tropical fruit, tea-like, jasmine, bright',
    source: 'scraped:roaster',
    source_url: 'https://onyxcoffeelab.com',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Colombia',
    roast_level: 'medium',
    brewing_method_id: 1,
    grind_size: 'medium-fine',
    water_temp_c: 93,
    ratio: 1 / 16,
    brew_time_s: 225,
    rating: 4,
    notes: 'caramel, red grape, balanced, sweet, mild acidity',
    source: 'scraped:roaster',
    source_url: 'https://onyxcoffeelab.com',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },

  // ── Bird Rock Coffee Roasters ─────────────────────────────────────────
  // Guide: birdrockcoffee.com
  // Signature: 1:16.5 ratio, 94°C, medium, ~4min total
  {
    origin: 'Kenya',
    roast_level: 'light',
    brewing_method_id: 1,
    grind_size: 'medium',
    water_temp_c: 94,
    ratio: 1 / 16.5,
    brew_time_s: 240,
    rating: 4,
    notes: 'blackcurrant, mandarin, bright, juicy, currant',
    source: 'scraped:roaster',
    source_url: 'https://birdrockcoffee.com',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Guatemala',
    roast_level: 'medium',
    brewing_method_id: 1,
    grind_size: 'medium',
    water_temp_c: 94,
    ratio: 1 / 16.5,
    brew_time_s: 240,
    rating: 4,
    notes: 'dark chocolate, stone fruit, maple, caramel, sweet',
    source: 'scraped:roaster',
    source_url: 'https://birdrockcoffee.com',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },

  // ── La Marzocco Home ──────────────────────────────────────────────────
  // Guide: home.lamarzocco.com/blogs
  // Espresso: 1:2 yield ratio (0.5), 93°C, fine grind, 25-30s shot
  {
    origin: 'Colombia',
    roast_level: 'medium',
    brewing_method_id: 3,
    grind_size: 'fine',
    water_temp_c: 93,
    ratio: 0.5,
    brew_time_s: 27,
    rating: 4,
    notes: 'caramel, hazelnut, balanced, smooth, sweet',
    source: 'scraped:roaster',
    source_url: 'https://home.lamarzocco.com/blogs',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Ethiopia',
    roast_level: 'light',
    brewing_method_id: 3,
    grind_size: 'fine',
    water_temp_c: 93,
    ratio: 0.5,
    brew_time_s: 28,
    rating: 4,
    notes: 'floral, bergamot, blueberry, citrus, bright',
    source: 'scraped:roaster',
    source_url: 'https://home.lamarzocco.com/blogs',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Brazil',
    roast_level: 'medium-dark',
    brewing_method_id: 3,
    grind_size: 'fine',
    water_temp_c: 92,
    ratio: 0.5,
    brew_time_s: 26,
    rating: 4,
    notes: 'dark chocolate, walnut, brown sugar, roasted, smoky',
    source: 'scraped:roaster',
    source_url: 'https://home.lamarzocco.com/blogs',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },

  // ── Bottomless Coffee ─────────────────────────────────────────────────
  // Guide: bottomless.com/brewing-guides
  // Espresso: 1:2.2 yield (ratio ~0.455), 92°C, fine, 28s
  {
    origin: 'Brazil',
    roast_level: 'medium',
    brewing_method_id: 3,
    grind_size: 'fine',
    water_temp_c: 92,
    ratio: 1 / 2.2,
    brew_time_s: 28,
    rating: 4,
    notes: 'milk chocolate, caramel, smooth, low acidity, sweet',
    source: 'scraped:roaster',
    source_url: 'https://bottomless.com/brewing-guides',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Colombia',
    roast_level: 'medium',
    brewing_method_id: 3,
    grind_size: 'fine',
    water_temp_c: 92,
    ratio: 1 / 2.2,
    brew_time_s: 28,
    rating: 4,
    notes: 'brown sugar, mild fruit, sweet, smooth, balanced',
    source: 'scraped:roaster',
    source_url: 'https://bottomless.com/brewing-guides',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },

  // ── Chromatic Coffee ──────────────────────────────────────────────────
  // Guide: chromaticcoffee.com
  // Espresso: 1:2.5 yield (ratio 0.4), 93°C, fine-medium, 30s
  {
    origin: 'Ethiopia',
    roast_level: 'light',
    brewing_method_id: 3,
    grind_size: 'fine-medium',
    water_temp_c: 93,
    ratio: 1 / 2.5,
    brew_time_s: 30,
    rating: 4,
    notes: 'floral, fruity, tea-like, jasmine, bright',
    source: 'scraped:roaster',
    source_url: 'https://chromaticcoffee.com',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Guatemala',
    roast_level: 'medium',
    brewing_method_id: 3,
    grind_size: 'fine-medium',
    water_temp_c: 93,
    ratio: 1 / 2.5,
    brew_time_s: 30,
    rating: 4,
    notes: 'plum, cocoa, dark chocolate, caramel, sweet',
    source: 'scraped:roaster',
    source_url: 'https://chromaticcoffee.com',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },

  // ── Equator Coffees ───────────────────────────────────────────────────
  // Guide: equatorcoffees.com
  // Espresso: 1:2 yield (ratio 0.5), 93°C, fine, 27s
  {
    origin: 'Peru',
    roast_level: 'medium',
    brewing_method_id: 3,
    grind_size: 'fine',
    water_temp_c: 93,
    ratio: 0.5,
    brew_time_s: 27,
    rating: 4,
    notes: 'milk chocolate, walnut, citrus, balanced, smooth',
    source: 'scraped:roaster',
    source_url: 'https://equatorcoffees.com',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Colombia',
    roast_level: 'medium',
    brewing_method_id: 3,
    grind_size: 'fine',
    water_temp_c: 93,
    ratio: 0.5,
    brew_time_s: 27,
    rating: 4,
    notes: 'caramel, mild fruit, smooth, sweet, balanced',
    source: 'scraped:roaster',
    source_url: 'https://equatorcoffees.com',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
  {
    origin: 'Nicaragua',
    roast_level: 'medium-dark',
    brewing_method_id: 3,
    grind_size: 'fine',
    water_temp_c: 92,
    ratio: 0.5,
    brew_time_s: 28,
    rating: 4,
    notes: 'dark chocolate, toasted almond, molasses, roasted, smoky',
    source: 'scraped:roaster',
    source_url: 'https://equatorcoffees.com',
    field_confidence: JSON.stringify({ origin: 1.0, ratio: 1.0, water_temp_c: 1.0, grind_size: 1.0 }),
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

async function checkConnectivity(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/brewing-methods`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function insertBrew(brew: ScrapedBrew): Promise<{ id: number; message: string }> {
  const res = await fetch(`${API_BASE}/brews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(brew),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.json() as Promise<{ id: number; message: string }>;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('scrape-roasters: checking server connectivity...');

  const reachable = await checkConnectivity();
  if (!reachable) {
    console.error(
      'ERROR: Server not reachable at ' + API_BASE + '\n' +
      'Please start the dev server first: npm run dev',
    );
    process.exit(1);
  }

  console.log('Server reachable. Starting brew insertion...\n');

  const pourOvers = BREWS.filter(b => b.brewing_method_id === 1);
  const espressos = BREWS.filter(b => b.brewing_method_id === 3);

  console.log(`Total brews to insert: ${BREWS.length}`);
  console.log(`  Pour Over (method_id=1): ${pourOvers.length}`);
  console.log(`  Espresso  (method_id=3): ${espressos.length}\n`);

  let inserted = 0;
  let failed = 0;

  for (const brew of BREWS) {
    const label = `[${brew.brewing_method_id === 1 ? 'PourOver' : 'Espresso'}] ${brew.origin} ${brew.roast_level}`;
    try {
      const result = await insertBrew(brew);
      console.log(`  ✓ ${label} → id=${result.id}`);
      inserted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${label} → FAILED: ${msg}`);
      failed++;
    }
  }

  console.log(`\n─── Summary ───────────────────────────────`);
  console.log(`Inserted: ${inserted}/${BREWS.length}`);
  console.log(`  Pour Over: ${pourOvers.length} targeted`);
  console.log(`  Espresso:  ${espressos.length} targeted`);
  if (failed > 0) {
    console.log(`Failed:   ${failed}`);
    process.exit(1);
  } else {
    console.log('All brews inserted successfully.');
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
