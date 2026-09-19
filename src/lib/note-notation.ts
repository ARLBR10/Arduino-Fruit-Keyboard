export type NoteNotation = 'letter' | 'solfege'

const solfegeNames: Readonly<Record<string, string>> = {
  C: 'Dó',
  D: 'Ré',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
}

export function formatNote(pitch: string, notation: NoteNotation) {
  if (notation === 'letter') return pitch

  return pitch.replace(/^([A-G])/, (letter) => solfegeNames[letter] ?? letter)
}
