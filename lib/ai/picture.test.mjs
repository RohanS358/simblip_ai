// Picture requests: an honest reply instead of ASCII art, real options, and
// SVG output that is safe and small. No model.
// Run: npm run test:ai

import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyPicture, pictureReply, sanitizeSvg } from './picture.ts'
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

test('asking for code gives an svg request — the subject can come from the previous turn', () => {
  assert.deepEqual(classifyPicture('SVG code for a gorilla'), { kind: 'svg', subject: 'gorilla' })
  assert.deepEqual(classifyPicture('give me svg code of an elephant'), { kind: 'svg', subject: 'elephant' })
  assert.deepEqual(classifyPicture('create the image yourself and give me the code', 'give me the picture of gorilla'), { kind: 'svg', subject: 'gorilla' })
  assert.equal(classifyPicture('give me the code', 'explain Thevenin theorem'), null, 'no picture subject → not ours')
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

const GOOD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="50" fill="#444"/><g><ellipse cx="80" cy="90" rx="8" ry="10" fill="#fff"/></g></svg>'

test('sanitizeSvg accepts a small clean SVG and adds the namespace if missing', () => {
  const ok = sanitizeSvg('```svg\n' + GOOD + '\n```\nSave it as gorilla.svg.')
  // A size is added so the drawing can be placed as an image; otherwise unchanged.
  assert.equal(ok.svg, GOOD.replace('<svg ', '<svg width="320" height="320" '))
  assert.equal(ok.note, 'Save it as gorilla.svg.')
  const bare = sanitizeSvg(GOOD.replace(' xmlns="http://www.w3.org/2000/svg"', ''))
  assert.match(bare.svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
})

test('sanitizeSvg blocks scripts, handlers, links, foreign content, bloat and broken markup', () => {
  const bad = (svg) => assert.ok('error' in sanitizeSvg(svg), svg.slice(0, 70))
  bad('<svg xmlns="x"><script>alert(1)</script></svg>')
  bad('<svg xmlns="x"><circle onclick="x()" r="5"/></svg>')
  bad('<svg xmlns="x"><a href="http://evil"><circle r="5"/></a></svg>')
  bad('<svg xmlns="x"><image href="data:..."/></svg>')
  bad('<svg xmlns="x"><foreignObject><div/></foreignObject></svg>')
  bad('<svg xmlns="x"><use xlink:href="#a"/></svg>')
  bad('<svg xmlns="x"><circle style="fill:url(http://x)" r="5"/></svg>')
  bad('<svg xmlns="x"><circle r="5"/>' + '<path d="M0 0L1 1"/>'.repeat(300) + '</svg>')
  bad('<svg xmlns="x"><g><circle r="5"/></svg>')
  bad('no svg here at all')
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

test('in the pipeline: an svg request returns a sanitised SVG, and a hostile one is blocked', async () => {
  const seen = []
  const svgGen = { name: 'svg', generate: async (sys, user, _t, _s, max) => (seen.push({ sys, user, max }), 'Here:\n```svg\n' + GOOD + '\n```\nSave as .svg.') }
  const svg = await run({ prompt: 'SVG code for a gorilla' }, svgGen)
  assert.match(svg.answer, /```svg\n<svg/)
  assert.match(seen[0].user, /gorilla/)
  assert.ok(seen[0].max <= 1500, 'a small token budget keeps it efficient')
  const evil = { name: 'evil', generate: async () => '```svg\n<svg xmlns="x"><script>1</script></svg>\n```' }
  const blocked = await run({ prompt: 'SVG code for a gorilla' }, evil)
  assert.match(blocked.message, /not allowed/)
  assert.equal(blocked.answer, undefined)
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

test('requests for CODE or abstract things that merely start with "show" are never picture requests', () => {
  for (const p of [
    'show a python loop example', 'show me an example of recursion', 'show me the steps', 'show me tips for studying',
    'show me how to cook rice', 'show me the code', 'show a javascript function', 'show me a regex that matches emails',
    'I want to see a demo', 'show me an algorithm', 'show a sql query example',
  ]) assert.equal(classifyPicture(p), null, p)
  // but with an explicit picture word the subject is whatever they say
  assert.equal(classifyPicture('pictures of a python')?.subject, 'python')
})
