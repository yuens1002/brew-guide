import type { BrewTechnique } from '../types.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'anthropic/claude-haiku-4-5';

// Per-method JSON schema shapes sent to the LLM as extraction targets
const METHOD_SCHEMAS: Record<string, object> = {
  'Pour Over': {
    bloom_weight_ratio: 'number (multiplier of coffee weight, e.g. 2)',
    bloom_duration_s: 'number (seconds)',
    pour_stages: 'array of {at_s: number, volume_ml: number, note?: string}',
    agitation: 'string: "swirl" | "stir" | "none" (optional)',
    drawdown_target_s: 'number (optional)',
  },
  Espresso: {
    preinfusion_s: 'number (optional)',
    yield_ratio: 'number (e.g. 2 for 1:2 in:out)',
    shot_time_s: 'number',
    pressure_bar: 'number (optional)',
    filter_type: 'string: "paper" | "metal" | "cloth" (optional)',
  },
  'French Press': {
    steep_time_s: 'number',
    plunge_speed: 'string: "slow" | "medium" (optional)',
    pre_wet: 'boolean (optional)',
    stir_at_s: 'number (optional)',
  },
  AeroPress: {
    inverted: 'boolean',
    steep_time_s: 'number',
    stir_count: 'number (optional)',
    filter_type: 'string: "paper" | "metal" (optional)',
  },
  'Cold Brew': {
    steep_time_h: 'number (hours)',
    steep_temp: 'string: "room" | "fridge" (optional)',
    dilution_ratio: 'number (optional)',
  },
  'Moka Pot': {
    preheat_water: 'boolean',
    heat_level: 'string: "low" | "medium" (optional)',
    tamp: 'string: "none" | "light" (optional)',
  },
  Chemex: {
    filter_rinse: 'boolean',
    bloom_duration_s: 'number',
    bloom_weight_ratio: 'number',
    pour_stages: 'array of {at_s: number, volume_ml: number, note?: string}',
  },
  Siphon: {
    heat_source: 'string: "butane" | "halogen" | "electric" (optional)',
    stir_pattern: 'string (optional)',
    drawdown_time_s: 'number (optional)',
  },
  Turkish: {
    heat_level: 'string: "low" | "medium" (optional)',
    foam_technique: 'string: "traditional" | "none" (optional)',
    serve_with_grounds: 'boolean (optional)',
  },
};

export async function extractTechnique(
  methodName: string,
  notes: string,
): Promise<BrewTechnique | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const schema = METHOD_SCHEMAS[methodName];
  if (!schema) return null;

  const systemPrompt = `You are a coffee technique extractor. Given brew notes and a method schema, extract structured technique data as JSON. Return only valid JSON matching the schema, or null if the notes lack sufficient technique information. Do not include fields that are not mentioned or inferable from the notes.`;

  const userPrompt = `Method: ${methodName}
Schema: ${JSON.stringify(schema, null, 2)}

Brew notes:
${notes}

Extract technique data as JSON. If notes lack technique detail, respond with null.`;

  try {
    const res = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://brew-guide-production.up.railway.app',
        'X-Title': 'brew-guide',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 512,
        temperature: 0,
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content || content === 'null') return null;

    return JSON.parse(content) as BrewTechnique;
  } catch {
    return null;
  }
}
