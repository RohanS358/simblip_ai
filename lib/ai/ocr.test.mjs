// The photo reader's pure parts. The reader itself needs a browser (a canvas and an
// origin serving /vendor/tesseract); the Node path through tesseract.js's own defaults
// is exercised by attachments.test.mjs.
// Run: npm run test:ai

import test from 'node:test'
import assert from 'node:assert/strict'
import { fitWithin, MAX_SIDE, PHOTO_UNREADABLE, PHOTO_NO_TEXT } from './ocr.ts'

test('fitWithin scales a big photo down for reading, never up', () => {
  assert.deepEqual(fitWithin(4000, 3000), { w: 2000, h: 1500 })
  assert.deepEqual(fitWithin(3000, 4000), { w: 1500, h: 2000 })
  assert.deepEqual(fitWithin(800, 600), { w: 800, h: 600 })
  assert.deepEqual(fitWithin(0, 0), { w: 1, h: 1 })
  assert.equal(MAX_SIDE, 2000)
})

test('when a photo cannot be read, the student is told what to do next, not what broke', () => {
  for (const msg of [PHOTO_UNREADABLE, PHOTO_NO_TEXT]) {
    assert.match(msg, /tell me what it shows in your question/i)
    assert.doesNotMatch(msg, /error|exception|fetch|undefined|tesseract|wasm/i, 'no internals leak into the message')
  }
  assert.notEqual(PHOTO_UNREADABLE, PHOTO_NO_TEXT)
})
