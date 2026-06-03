/** Brewing method definition (GET /brewing-methods) */
export interface BrewingMethod {
  id: number;
  name: string;
  description: string;
  default_ratio: number;
  default_temp_c: number;
  default_brew_time_s: number;
  grind_size: string;
  technique?: BrewTechnique | null;
}

/** Coffee origin reference (seed data + user-discovered) */
export interface Origin {
  id: number;
  name: string;
  region: string;
  subregion?: string;
  variety?: string;
  aliases?: string;       // comma-separated misspellings: "Ethiopean,Ethopian"
  is_verified: boolean;
}

/** Source attribution for a brew entry */
export type BrewSource = 'user_submitted' | 'scraped:reddit' | 'scraped:home-barista' | 'scraped:roaster';

/** Per-field extraction confidence from narrative parsing */
export interface FieldConfidence {
  origin?: number;
  roast_level?: number;
  brewing_method_name?: number;
  grind_size?: number;
  water_temp_c?: number;
  ratio?: number;
  brew_time_s?: number;
  rating?: number;
  notes?: number;
}

/** Brew log record (POST /brews request body, stored row) */
export interface Brew {
  id: number;
  brewing_method_id: number;
  origin: string;
  variety?: string;
  roast_level: string;
  grind_size: string;
  water_temp_c: number;
  ratio: number;
  brew_time_s: number;
  rating: number;
  notes?: string;
  created_at: string;
  source: BrewSource;
  source_url?: string;
  field_confidence?: string; // JSON-serialized FieldConfidence
  technique?: BrewTechnique | null;
}

/** Parameters submitted to POST /recommend */
export interface RecommendationParams {
  brewing_method_id?: number;
  origin?: string;
  variety?: string;
  roast_level?: string;
  grind_size?: string;
  water_temp_c?: number;
  ratio?: number;
  brew_time_s?: number;
}

/** Brew input fields echoed back in the recommendation response */
export interface BrewInput {
  origin: string;
  variety?: string;
  roast_level: string;
  grind_size: string;
  water_temp_c: number;
  ratio: number;
  brew_time_s: number;
}

/** Source reference — a brew that informed this recommendation */
export interface SourceRef {
  brew_id: number;
  relevance: number; // 0-1 match score
}

/** Tasting note with community count */
export interface TastingNote {
  note: string;
  count: number;
}

/** AI recommendation (POST /recommend response) */
export interface Recommendation {
  id: number;
  brewing_method: string;
  input: BrewInput;
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
  sources: SourceRef[];
  data_points_used: number;
  technique?: BrewTechnique | null;
  tasting_notes: TastingNote[];
  thumbs_up?: number;
  thumbs_down?: number;
}

/** Stored recommendation record (prediction log) */
export interface RecommendationRecord {
  id: number;
  brewing_method_id: number;
  origin: string;
  roast_level: string;
  grind_size: string;
  water_temp_c: number;
  ratio: number;
  brew_time_s: number;
  recommendation: string;
  confidence: string;
  confidence_breakdown?: string; // JSON: {data_points, match_count, match_quality}
  sources?: string;              // JSON: SourceRef[]
  fingerprint: string;
  thumbs_up: number;
  thumbs_down: number;
  created_at: string;
}

/** POST /recommend/:id/vote request body */
export interface VoteRequest {
  vote: 'up' | 'down';
}

/** POST /recommend/:id/vote response */
export interface VoteResponse {
  thumbs_up: number;
  thumbs_down: number;
}

/** Implicit link between a brew and a recommendation */
export interface BrewRecommendationLink {
  brew_id: number;
  recommendation_id: number;
  match_confidence: number;
  user_vote?: 'up' | 'down' | null;
  linked_at: string;
}

/** Brew record with resolved method name (GET /brews response) */
export interface BrewWithMethod {
  id: number;
  brewing_method_id: number;
  brewing_method: string;
  origin: string;
  variety?: string;
  roast_level: string;
  grind_size: string;
  water_temp_c: number;
  ratio: number;
  brew_time_s: number;
  rating: number;
  notes?: string;
  created_at: string;
  source: BrewSource;
  source_url?: string;
  field_confidence?: string; // JSON-serialized FieldConfidence; used by computeBestBrew scoring
  technique?: BrewTechnique | null;
}

// ── Technique Types (Phase 6 — method-scoped) ──────────────

export interface PourOverTechnique {
  bloom_weight_ratio: number;   // multiplier of coffee weight, e.g. 2 = 2x dose
  bloom_duration_s: number;
  pour_stages: Array<{
    at_s: number;
    volume_ml: number;
    note?: string;
  }>;
  agitation?: string;           // 'swirl' | 'stir' | 'none'
  drawdown_target_s?: number;
}

export interface EspressoTechnique {
  preinfusion_s?: number;
  yield_ratio: number;          // e.g. 2 = 1:2 in:out by weight
  shot_time_s: number;
  pressure_bar?: number;
  filter_type?: string;         // 'paper' | 'metal' | 'cloth'
}

export interface FrenchPressTechnique {
  steep_time_s: number;
  plunge_speed?: string;        // 'slow' | 'medium'
  pre_wet?: boolean;
  stir_at_s?: number;
}

export interface AeroPressTechnique {
  inverted: boolean;
  steep_time_s: number;
  stir_count?: number;
  filter_type?: string;         // 'paper' | 'metal'
}

export interface ColdBrewTechnique {
  steep_time_h: number;
  steep_temp?: string;          // 'room' | 'fridge'
  dilution_ratio?: number;
}

export interface MokaPotTechnique {
  preheat_water: boolean;
  heat_level?: string;          // 'low' | 'medium'
  tamp?: string;                // 'none' | 'light'
}

export interface ChemexTechnique {
  filter_rinse: boolean;
  bloom_duration_s: number;
  bloom_weight_ratio: number;
  pour_stages: Array<{ at_s: number; volume_ml: number; note?: string }>;
}

export interface SiphonTechnique {
  heat_source?: string;         // 'butane' | 'halogen' | 'electric'
  stir_pattern?: string;
  drawdown_time_s?: number;
}

export interface TurkishTechnique {
  heat_level?: string;          // 'low' | 'medium'
  foam_technique?: string;      // 'traditional' | 'none'
  serve_with_grounds?: boolean;
}

export type BrewTechnique =
  | PourOverTechnique
  | EspressoTechnique
  | FrenchPressTechnique
  | AeroPressTechnique
  | ColdBrewTechnique
  | MokaPotTechnique
  | ChemexTechnique
  | SiphonTechnique
  | TurkishTechnique;
