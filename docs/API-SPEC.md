# Coffee Brew Inference Experiment — API Specification

> **Base URL:** `http://localhost:4000` (local dev)  
> **Authentication:** Open (no auth for experiment)  
> **Content-Type:** `application/json`

---

## Journey 1: "How?" — Query the Optimal Brew

### `GET /origins`
Returns all known coffee origins (seed data + discovered). Used for origin autocomplete and normalization.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Ethiopia",
    "region": "Africa",
    "subregion": "Yirgacheffe, Sidamo, Guji, Harrar",
    "variety": "heirloom",
    "aliases": "Ethiopean,Ethopian",
    "is_verified": true
  }
]
```

---

### `GET /brewing-methods`
Returns all available brewing methods to populate the dropdown.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Pour Over",
    "description": "Hand-poured water over coffee grounds in a filter (V60, Chemex, etc.)",
    "default_ratio": 0.0625,
    "default_temp_c": 93,
    "default_brew_time_s": 210,
    "grind_size": "medium-fine",
    "technique": {
      "bloom_weight_ratio": 2,
      "bloom_duration_s": 45,
      "pour_stages": [
        { "at_s": 0, "volume_ml": 60, "note": "bloom" },
        { "at_s": 45, "volume_ml": 150, "note": "first pour" },
        { "at_s": 90, "volume_ml": 290, "note": "second pour" }
      ],
      "agitation": "swirl",
      "drawdown_target_s": 210
    }
  }
]
```

The `technique` field is a discriminated-union JSONB object whose shape depends on the brewing method. See `src/types.ts` for each variant (`PourOverTechnique`, `EspressoTechnique`, `FrenchPressTechnique`, etc.).

---

### `POST /recommend`
**User Question:** *"I have Colombian medium roast and want to use Pour Over — how should I brew it?"*

Returns a brew recommendation computed from weighted consensus over logged brew history. Origin is normalized via `resolveOrigin` before matching. Confidence is `high` (≥3 quality matches), `medium` (1–2 matches, blended with method defaults), or `low` (no matches, pure method defaults).

**Request:**
```json
{
  "brewing_method_id": 1,
  "origin": "Colombia",
  "roast_level": "medium",
  "variety": "heirloom",
  "grind_size": "medium-fine",
  "include_narrative": true
}
```

All fields are optional. `include_narrative` defaults to `false`. When `true` and confidence is `medium` or `high`, the response includes an LLM-generated step-by-step brew guide. On `low` confidence, no narrative is returned even if the flag is set.

**Response:**
```json
{
  "id": 1,
  "brewing_method": "Pour Over",
  "input": {
    "origin": "Colombia",
    "variety": "heirloom",
    "roast_level": "medium",
    "grind_size": "medium-fine",
    "water_temp_c": 93,
    "ratio": 0.0625,
    "brew_time_s": 210
  },
  "recommendation": "Based on 3 community brews. For Colombia (medium roast), try Pour Over at 93°C with a medium-fine grind, 210s brew time, 1:16 ratio.",
  "confidence": "high",
  "sources": [{ "brew_id": 5, "relevance": 0.94 }],
  "data_points_used": 3,
  "technique": {
    "bloom_weight_ratio": 2,
    "bloom_duration_s": 45,
    "pour_stages": [
      { "at_s": 0, "volume_ml": 60, "note": "bloom" }
    ],
    "agitation": "swirl",
    "drawdown_target_s": 210
  },
  "technique_sources_count": 3,
  "tasting_notes": [{ "note": "blueberry", "count": 2 }, { "note": "floral", "count": 1 }],
  "source_attribution": "Based on 3 community brews",
  "narrative": "Grind your Colombia light roast to a medium-fine setting...",
  "thumbs_up": 2,
  "thumbs_down": 0
}
```

- `technique_sources_count`: number of community brews that contributed to the technique consensus (`0` = method default only)
- `narrative`: only present when `include_narrative: true` and confidence is `medium` or `high`; a plain-prose step-by-step brew guide (~150 words)
- `tasting_notes`: frequency-weighted flavor notes sorted by count descending
- `source_attribution`: human-readable string explaining the data path

`thumbs_up` and `thumbs_down` reflect community votes cast via `POST /recommend/:id/vote`. Calls with the same origin+roast+method return the same recommendation record (votes accumulate).

---

### `POST /recommend/:id/vote`
Records a thumbs-up or thumbs-down vote on a recommendation. The recommendation `id` comes from a prior `POST /recommend` response.

**Request:**
```json
{ "vote": "up" }
```

`vote` must be `"up"` or `"down"`. Any other value returns 400.

**Response (200):**
```json
{ "thumbs_up": 3, "thumbs_down": 1 }
```

**Errors:**
- `400` — invalid vote value
- `404` — recommendation not found

---

## Journey 2: "Real Experience" — Log & Validate

### `POST /brews`
**User Action:** *"I just brewed Colombian medium roast using Pour Over with these parameters — here's what I did and my rating."*

Logs a real-world brew experience.

**Request:**
```json
{
  "brewing_method_id": 1,
  "origin": "Colombia",
  "roast_level": "medium",
  "grind_size": "medium",
  "water_temp_c": 95,
  "ratio": 0.0625,
  "brew_time_s": 180,
  "rating": 4.0,
  "notes": "A bit bitter, extracted too fast"
}
```

**Response:**
```json
{
  "id": 1,
  "message": "Brew record added successfully"
}
```

---

### `GET /brews`
List all brew records (for browsing community experiences).

**Query Params:** `?limit=10&origin=Colombia&method=1`

**Response:**
```json
{
  "count": 42,
  "brews": [
    {
      "id": 1,
      "brewing_method": "Pour Over",
      "origin": "Colombia",
      "roast_level": "medium",
      "grind_size": "medium",
      "water_temp_c": 95,
      "ratio": 0.0625,
      "brew_time_s": 180,
      "rating": 4.0,
      "notes": "A bit bitter, extracted too fast",
      "created_at": "2026-05-25T10:30:00Z"
    }
  ]
}
```

---

### `GET /brews/:id/compare`
**User Question:** *"How did my brew compare to the AI recommendation?"*

Compares a logged brew against what the AI would have recommended.

**Response:**
```json
{
  "brew_id": 1,
  "user_brew": {
    "water_temp_c": 95,
    "ratio": 0.0625,
    "brew_time_s": 180,
    "grind_size": "medium",
    "rating": 4.0
  },
  "ai_recommendation": {
    "water_temp_c": 93,
    "ratio": 0.0588,
    "brew_time_s": 210,
    "grind_size": "medium-fine"
  },
  "analysis": "Your water was 2°C hotter and brew time 30s shorter than recommended. This likely caused the bitterness. Try lowering temp to 93°C and extending brew time to 210s.",
  "match_score": 0.75
}
```

---

## Admin MCP Endpoint

`POST /admin/mcp` — protected admin tools for full CRUD operations on brews, origins, and origin brew profiles.

**Auth:** `Authorization: Bearer <ADMIN_TOKEN>` (env var). Returns `401` if header is missing, wrong, or `ADMIN_TOKEN` is not set.  
**Origin policy:** same as public MCP (localhost, *.yuens.me, no-origin allowed).  
**Health check:** `GET /admin/health` → `{ "status": "ok" }` (unprotected).

### Tools

#### Brews

| Tool | Key inputs | Returns |
|------|------------|---------|
| `create_brew` | `brewing_method_id`, `origin`, `roast_level`, `grind_size`, `water_temp_c`, `ratio`, `brew_time_s`, `rating` | `{ created: true, record }` |
| `get_brew` | `id` | `{ found: true, record }` or `{ found: false, error }` |
| `list_brews` | `origin?`, `method?`, `limit?` | `{ records, count }` |
| `update_brew` | `id`, any updatable field(s) | `{ updated: true, record }` or `{ updated: false, error }` |
| `delete_brew` | `id` | `{ deleted: true, id }` or `{ deleted: false, error }` |

#### Origins

| Tool | Key inputs | Returns |
|------|------------|---------|
| `create_origin` | `name`, `region`, `subregion?`, `variety?`, `aliases?`, `is_verified?` | `{ created: true, record }` |
| `get_origin` | `id` | `{ found: true, record }` or `{ found: false, error }` |
| `list_origins` | — | `{ records, count }` |
| `update_origin` | `id`, any updatable field(s) | `{ updated: true, record }` or `{ updated: false, error }` |
| `delete_origin` | `id` | `{ deleted: true, id }` or `{ deleted: false, error }` |

#### Origin Brew Profiles

| Tool | Key inputs | Returns |
|------|------------|---------|
| `create_origin_profile` | `origin`, `roast_level`, `brewing_method_id`, `water_temp_c`, `ratio`, `brew_time_s`, `grind_size`, `tasting_notes` | `{ created: true, record }` |
| `get_origin_profile` | `id` | `{ found: true, record }` or `{ found: false, error }` |
| `list_origin_profiles` | `origin?`, `roast_level?`, `brewing_method_id?`, `source?` | `{ records, count }` |
| `update_origin_profile` | `id`, any updatable field(s) | `{ updated: true, record }` or `{ updated: false, error }` |
| `delete_origin_profile` | `id` | `{ deleted: true, id }` or `{ deleted: false, error }` |

---

## Summary of User Journeys

| Journey | Endpoint(s) | Purpose |
|---------|--------------|---------|
| **"How?"** | `GET /origins`, `GET /brewing-methods` → `POST /recommend` | Normalize origin, pick method, get recommendation |
| **"Real Experience"** | `POST /brews` → `GET /brews/:id/compare` | Log brew → compare against method baseline |

---

## Frontend Flow (Simple)

1. User selects brewing method → `GET /brewing-methods`
2. User fills in coffee details → clicks **"How should I brew this?"** → `POST /recommend`
3. User brews coffee in real life...
4. User logs what they did + rating → `POST /brews`
5. User clicks **"Compare to AI"** → `GET /brews/:id/compare`

---

*API spec created using Hermes Agent's `writing-plans` skill.*
