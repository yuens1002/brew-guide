const TASTING_NOTE_NOISE = /\b(test|week|today|month|this|that|brew)\b/i;

/** Returns true if a comma-split token looks like a flavor descriptor, not narrative noise. */
export function isFlavorNote(raw: string): boolean {
  const note = raw.trim().toLowerCase();
  if (note.length < 2 || note.length > 28) return false;
  if (note.split(/\s+/).length > 3) return false;
  if (TASTING_NOTE_NOISE.test(note)) return false;
  return true;
}
