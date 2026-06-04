# Frontend Dev — coffee-brew-inference-experiment

> Inherits from `/engineering-base` and the global `~/.claude/commands/frontend-dev.md` baseline (if present).
> Apply global principles first; project-specific rules below take precedence where they conflict.

## Project stack

- Vanilla HTML/CSS/JS (`landing/index.html`) — no build step, no bundler
- Dev server: Vite via `npm run dx` (port 5173); API on port 4000
- No TypeScript in the landing page — type safety via careful naming and inline comments

## Project-specific principles

### 1. Multi-field fetch triggers must listen on ALL required fields, not just the primary one

When a fetch requires N form fields (e.g., origin + roast_level + method_id), add `change`/`input` listeners on every field that participates — not just the one the user "usually" selects first.

Anti-pattern: fire fetch only on origin selection, guard on `if (!roast || !methodId) return`. Silent early return means users who select origin before method never get chip pre-population, with no error, no retry, no recovery.

Correct pattern:
```js
// Also listen on method change — retrigger if origin is already set
document.getElementById('methodB').addEventListener('change', () => {
  const origin = inputB.dataset.originName || inputB.value.trim();
  if (origin) onOriginBSelect(origin);
});
```

Rule: if the fetch has a guard (`if (!x || !y) return`), ensure a listener on `y` will retrigger the fetch when `x` is already set. Users will fill forms in any order.

### 2. Normalize strings to the same case before comparison

When comparing a user-stored or lowercased value against a pool or list, normalize both sides to the same case before the `includes()` / `indexOf()` check.

Anti-pattern:
```js
// _tastingChips stores lowercase; pool may have 'Bright'
!window._tastingChips.includes(n)  // n = 'Bright' → false negative
```

Correct pattern:
```js
!window._tastingChips.includes(n.toLowerCase())
```

Rule: wherever `addChip()` or any function normalizes to lowercase before storing, every downstream comparison must also normalize before checking. A mismatch produces silent duplicates — already-added chips keep appearing in the dropdown.

### 3. Do not use overflow:hidden for clip-during-transition without a replacement mechanism

`overflow: hidden` on a slide wrapper clips out-of-view content during CSS `translateX` transitions. Removing it (e.g., to fix dropdown visibility) allows Face B content to bleed outside the card boundary on narrow viewports during the animation.

If dropdown visibility is the concern, use `z-index` + `position: absolute` on the dropdown rather than removing the clip from the container. If the clip must be removed, add `clip-path` or `max-width: 100%; overflow-x: hidden` on a parent that doesn't affect the dropdown stacking context.
