export type NoteStyle = "sharp" | "flat";

export const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

const NOTE_TO_INDEX: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11
};

const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb"]);
const CHORD_ROOT = /^([A-G](?:#|b)?)(.*)$/;

export const KEY_OPTIONS = [...SHARP_NOTES, "Db", "Eb", "Gb", "Ab", "Bb"];

// Rigid enharmonic rule:
// - Flat keys always use flat spellings for chromatic notes: A#/Bb becomes Bb.
// - Sharp and neutral keys always use sharp spellings: A#/Bb becomes A#.
// This keeps the output predictable for musicians and avoids mixed notation in a chart.
const KEY_NOTE_SPELLINGS: Record<string, readonly string[]> = {
  C: SHARP_NOTES,
  G: SHARP_NOTES,
  D: SHARP_NOTES,
  A: SHARP_NOTES,
  E: SHARP_NOTES,
  B: SHARP_NOTES,
  "F#": SHARP_NOTES,
  "C#": SHARP_NOTES,
  "A#": SHARP_NOTES,
  "D#": SHARP_NOTES,
  F: FLAT_NOTES,
  Bb: FLAT_NOTES,
  Eb: FLAT_NOTES,
  Ab: FLAT_NOTES,
  Db: FLAT_NOTES,
  Gb: FLAT_NOTES
};

export function normalizeNote(note: string) {
  return note.trim().replace("♯", "#").replace("♭", "b");
}

export function noteIndex(note: string) {
  return NOTE_TO_INDEX[normalizeNote(note)];
}

export function noteStyleForKey(key: string): NoteStyle {
  return FLAT_KEYS.has(normalizeNote(key)) || normalizeNote(key).includes("b") ? "flat" : "sharp";
}

export function noteFromIndex(index: number, style: NoteStyle = "sharp") {
  const notes = style === "flat" ? FLAT_NOTES : SHARP_NOTES;
  return notes[((index % 12) + 12) % 12];
}

export function noteFromIndexForKey(index: number, key: string) {
  const spellings = KEY_NOTE_SPELLINGS[normalizeNote(key)] ?? SHARP_NOTES;
  return spellings[((index % 12) + 12) % 12];
}

export function semitoneDistance(from: string, to: string) {
  const fromIndex = noteIndex(from);
  const toIndex = noteIndex(to);
  if (fromIndex === undefined || toIndex === undefined) return 0;
  return toIndex - fromIndex;
}

export function transposeNote(note: string, semitones: number, preferredStyle?: NoteStyle) {
  const index = noteIndex(note);
  if (index === undefined) return note;
  const style = preferredStyle ?? noteStyleForKey(note);
  return noteFromIndex(index + semitones, style);
}

export function transposeNoteToKey(note: string, semitones: number, key: string) {
  const index = noteIndex(note);
  if (index === undefined) return note;
  return noteFromIndexForKey(index + semitones, key);
}

export function transposeChord(chord: string, semitones: number, preferredStyle?: NoteStyle) {
  return chord
    .split("/")
    .map((part) => {
      const match = part.match(CHORD_ROOT);
      if (!match) return part;

      const [, root, suffix] = match;
      const index = noteIndex(root);
      if (index === undefined) return part;

      const style = preferredStyle ?? (root.includes("b") ? "flat" : "sharp");
      return `${noteFromIndex(index + semitones, style)}${suffix}`;
    })
    .join("/");
}

export function transposeChordToKey(chord: string, semitones: number, key: string) {
  return chord
    .split("/")
    .map((part) => {
      const match = part.match(CHORD_ROOT);
      if (!match) return part;

      const [, root, suffix] = match;
      const index = noteIndex(root);
      if (index === undefined) return part;

      return `${noteFromIndexForKey(index + semitones, key)}${suffix}`;
    })
    .join("/");
}

export function transposeText(text: string, semitones: number, preferredStyle?: NoteStyle) {
  return text.replace(/\[([^\]\n]+)\]/g, (_, chord: string) => `[${transposeChord(chord.trim(), semitones, preferredStyle)}]`);
}

export function transposeTextToKey(text: string, semitones: number, key: string) {
  return text.replace(/\[([^\]\n]+)\]/g, (_, chord: string) => `[${transposeChordToKey(chord.trim(), semitones, key)}]`);
}

export function simplifyChord(chord: string) {
  const main = chord.split("/")[0];
  const match = main.match(CHORD_ROOT);
  if (!match) return chord;

  const [, root, suffix] = match;
  if (/^m(?!aj)/i.test(suffix)) return `${root}m`;
  return root;
}

export function simplifyText(text: string) {
  return text.replace(/\[([^\]\n]+)\]/g, (_, chord: string) => `[${simplifyChord(chord.trim())}]`);
}

export function suggestCapo(realKey: string, playedShape: string) {
  const real = noteIndex(realKey);
  const shape = noteIndex(playedShape);
  if (real === undefined || shape === undefined) return 0;
  return ((real - shape) % 12 + 12) % 12;
}

export function applyCapoShape(text: string, realKey: string, playedShape: string, capoHouse?: number) {
  const house = capoHouse && capoHouse > 0 ? capoHouse : suggestCapo(realKey, playedShape);
  const effectiveShape = transposeNoteToKey(realKey, -house, playedShape);
  return transposeTextToKey(text, -house, effectiveShape);
}

export function detectOriginalKey(text: string) {
  const firstChord = text.match(/\[([A-G](?:#|b)?)[^\]\n]*\]/);
  return firstChord?.[1] ?? "C";
}
