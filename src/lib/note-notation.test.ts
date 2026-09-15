import assert from 'node:assert/strict'
import test from 'node:test'

import type { NoteNotation } from './note-notation.ts'
import { formatNote } from './note-notation.ts'

const noteNames = [
  ['C4', 'Dó4'],
  ['D4', 'Ré4'],
  ['E4', 'Mi4'],
  ['F4', 'Fa4'],
  ['G4', 'So4'],
  ['A4', 'La4'],
  ['B4', 'Ci4'],
] as const

test('letter notation keeps the current pitch labels', () => {
  const notation: NoteNotation = 'letter'

  for (const [pitch] of noteNames) {
    assert.equal(formatNote(pitch, notation), pitch)
  }
})

test('solfege notation uses the classic note names', () => {
  const notation: NoteNotation = 'solfege'

  for (const [pitch, expected] of noteNames) {
    assert.equal(formatNote(pitch, notation), expected)
  }
})
