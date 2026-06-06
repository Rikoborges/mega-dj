// Pitch class 0-11 → [major (mode=1), minor (mode=0)]
const MAP = [
  ['8B', '5A'],   // C
  ['3B', '12A'],  // C#/Db
  ['10B', '7A'],  // D
  ['5B', '2A'],   // D#/Eb
  ['12B', '9A'],  // E
  ['7B', '4A'],   // F
  ['2B', '11A'],  // F#/Gb
  ['9B', '6A'],   // G
  ['4B', '1A'],   // G#/Ab
  ['11B', '8A'],  // A
  ['6B', '3A'],   // A#/Bb
  ['1B', '10A'],  // B
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function toCamelot(key, mode) {
  if (key == null || mode == null || key < 0) return null;
  return MAP[key]?.[mode === 1 ? 0 : 1] ?? null;
}

export function keyLabel(key, mode) {
  if (key == null || mode == null || key < 0) return null;
  return `${NOTE_NAMES[key]} ${mode === 1 ? 'maj' : 'min'}`;
}

export function keyCompat(camA, camB) {
  if (!camA || !camB) return null;
  if (camA === camB) return { label: 'HARMÔNICO', color: '#22c55e' };

  const numA = parseInt(camA, 10);
  const numB = parseInt(camB, 10);
  const modeA = camA.slice(-1);
  const modeB = camB.slice(-1);

  // Same number, different mode (major ↔ relative minor)
  if (numA === numB) return { label: 'RELATIVO', color: '#84cc16' };

  // Adjacent on Camelot wheel (±1, same mode) — compatible blend
  if (modeA === modeB) {
    const diff = Math.abs(numA - numB);
    if (Math.min(diff, 12 - diff) === 1) return { label: 'COMPATÍVEL', color: '#84cc16' };
  }

  return { label: 'DISSONANTE', color: '#ef4444' };
}
