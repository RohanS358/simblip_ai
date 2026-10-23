// Picture requests: an honest reply instead of ASCII art, real options, and
// SVG output that is safe and small. No model.
// Run: npm run test:ai

import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyPicture, pictureReply } from './picture.ts'
import { bundle } from '../../scripts/test/bundle.mjs'

test('requests for a picture of a real-world thing get the honest reply, with the subject', () => {
  for (const [p, subject, want] of [
    ['hi please provide me the diagram of gorilla', 'gorilla', 'diagram'],
    ['give me the exact picture of gorilla', 'gorilla', 'photo'],
    ['show me a photo of the Eiffel Tower', 'Eiffel Tower', 'photo'],
    ['what does a red panda look like', 'red panda', 'photo'],
    ['draw a tiger', 'tiger', 'photo'],
    ['image of a human heart', 'human heart', 'photo'],
  ]) assert.deepEqual(classifyPicture(p), { kind: 'photo', subject, want }, p)
})

test('things SIMBLIP can build or explain are NOT picture requests', () => {
  for (const p of [
    'diagram of a half-wave rectifier', 'draw a circuit with two resistors', 'show me a free body diagram of a block on a slope',
    'picture of a binary tree', 'plot a sine wave', 'draw a flowchart for bubble sort', 'show me the truth table of an AND gate',
    'block diagram of a CPU', 'derive Gauss law', 'explain the pigeonhole principle', 'make flash cards for Ohm’s law', 'code for bubble sort',
  ]) assert.equal(classifyPicture(p), null, p)
})

test('the reply names the subject, offers three real options, and contains no art', () => {
  const r = pictureReply('gorilla')
  assert.match(r, /can’t produce a real picture or photo of gorilla/)
  assert.match(r, /1\. \*\*Use a real image/)
  assert.match(r, /2\. \*\*Create it yourself/)
  assert.match(r, /3\. \*\*Get code/)
  assert.match(r, /SVG code for gorilla/)
  assert.doesNotMatch(r, /_{4}|\|\s*\(|\/\s+\\/, 'no ASCII art')
})

const m = await bundle(`export { runAi } from '@/lib/ai/run'`, 'picture-run')
const run = async (req, gen) => {
  const events = []
  await m.runAi(req, { script: async () => gen, explain: async () => gen, emit: (e) => events.push(e), streaming: false })
  return events.find((e) => e.event === 'done').data
}

test('in the pipeline: a photo request makes NO model call and answers honestly', async () => {
  const boom = { name: 'boom', generate: async () => { throw new Error('the model must not be called') } }
  const photo = await run({ prompt: 'hi please provide me the diagram of gorilla' }, boom)
  assert.match(photo.answer, /can’t produce a real picture/)
  assert.ok(photo.blocks.length > 0, 'it is rendered as an answer, not an error line')
  assert.doesNotMatch(photo.message, /error|failed/i)
})

test('every natural way of asking for pictures is recognised — including subject-first wordings', () => {
  for (const [p, subject] of [
    ['gorilla images', 'gorilla'],
    ['gorilla pictures', 'gorilla'],
    ['gorilla photos', 'gorilla'],
    ['gorilla photo', 'gorilla'],
    ['show gorilla images', 'gorilla'],
    ['eiffel tower pictures', 'eiffel tower'],
    ['send me a cat photo', 'cat'],
    ['a picture of a cat please', 'cat'],
    ['give me 4 images of a lion', 'lion'],
    ['pictures of elephants', 'elephants'],
    ['find images of a red panda', 'red panda'],
    ['I want to see a gorilla', 'gorilla'],
    ['can you show me what a gorilla looks like', 'gorilla'],
    ['show me a golden retriever', 'golden retriever'],
  ]) assert.equal(classifyPicture(p)?.subject, subject, p)
})

test('ordinary questions are NOT picture requests — pictures only when asked for', () => {
  for (const p of [
    'what is a gorilla', 'tell me about gorillas', 'explain how gorillas live', 'show me the answer', 'show me the steps',
    'I want to see the solution', 'how are images stored in a database', 'what is an image', 'why do photos fade',
    'write a note about photos', 'image compression algorithm', 'explain Thevenin theorem', 'pictures of resistors', 'show me how a diode works',
    'give me more', 'show me everything', 'what does this mean',
  ]) assert.equal(classifyPicture(p), null, p)
})

