// Real pictures: the Commons parser, the pipeline around it, and the follow-ups
// that go with it. No network, no model.
// Run: npm run test:ai

import test from 'node:test'
import assert from 'node:assert/strict'
import { commonsUrl, parseCommons, selectImages, isHighRes, IMAGES_SHOWN } from './image-search.ts'
import { classifyPicture, sanitizeSvg, svgDataUri } from './picture.ts'
import { bundle } from '../../scripts/test/bundle.mjs'

const page = (index, title, thumburl, extra = {}) => ({
  title,
  index,
  imageinfo: [{
    thumburl,
    descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
    mime: 'image/jpeg',
    width: 3000,
    height: 2000,
    extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<bdi><a href="https://x">Jane <b>Doe</b></a></bdi> &amp; co' } },
    ...extra,
  }],
})
const T = (n) => `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a${n}/Gorilla_${n}.jpg/500px-Gorilla_${n}.jpg`

test('the search URL asks for photos (bitmap) or diagrams (drawing), with licence data, at a sane size', () => {
  const photo = new URL(commonsUrl('gorilla', 'photo'))
  assert.equal(photo.hostname, 'commons.wikimedia.org')
  assert.equal(photo.searchParams.get('gsrsearch'), 'gorilla filetype:bitmap')
  assert.equal(photo.searchParams.get('gsrnamespace'), '6')
  assert.match(photo.searchParams.get('iiprop'), /extmetadata/)
  assert.match(photo.searchParams.get('iiprop'), /size/, 'the ORIGINAL dimensions are requested')
  assert.equal(photo.searchParams.get('iiurlwidth'), '1000', 'a 1000 px rendition, not a thumbnail')
  assert.equal(new URL(commonsUrl('heart', 'diagram')).searchParams.get('gsrsearch'), 'heart filetype:drawing')
})

test('parseCommons: ordered by relevance, credit is plain text with the licence, capped', () => {
  const json = { query: { pages: { 7: page(2, 'File:Gorilla b.jpg', T(2)), 5: page(1, 'File:Gorilla_a.jpg', T(1)), 9: page(3, 'File:Gorilla c.png', T(3)) } } }
  const hits = parseCommons(json, 2)
  assert.equal(hits.length, 2)
  assert.deepEqual(hits.map((h) => h.alt), ['Gorilla a', 'Gorilla b'], 'index order, File: prefix and extension removed')
  assert.equal(hits[0].credit, 'Jane Doe & co · CC BY-SA 4.0')
  assert.match(hits[0].href, /^https:\/\/commons\.wikimedia\.org\/wiki\//)
})

test('parseCommons only ever returns Wikimedia https image URLs — a hostile response cannot aim the panel elsewhere', () => {
  const json = { query: { pages: {
    1: page(1, 'File:ok.jpg', T(1)),
    2: page(2, 'File:evil1.jpg', 'https://evil.example/x.jpg'),
    3: page(3, 'File:evil2.jpg', 'http://upload.wikimedia.org/x.jpg'),
    4: page(4, 'File:evil3.jpg', 'javascript:alert(1)'),
    5: page(5, 'File:evil4.jpg', 'https://upload.wikimedia.org.evil.example/x.jpg'),
    6: page(6, 'File:evil5.jpg', T(6), { descriptionurl: 'https://evil.example/page' }),
    7: { title: 'File:noinfo.jpg', index: 7 },
  } } }
  assert.deepEqual(parseCommons(json).map((h) => h.alt), ['ok'])
})

test('parseCommons never throws on garbage', () => {
  for (const j of [null, undefined, 5, 'x', {}, { query: {} }, { query: { pages: [] } }, { query: { pages: { 1: null } } }])
    assert.doesNotThrow(() => parseCommons(j), String(j))
  assert.deepEqual(parseCommons({ query: { pages: { 1: { title: 'x', imageinfo: [] } } } }), [])
})

test('"in image" and friends are answers to our own offer, with the subject from the last request', () => {
  const last = 'hi please provide me the diagram of gorilla'
  for (const p of ['in image', 'In an image', 'as a picture', 'the photo please', 'image', 'show it in a picture', 'in image.']) {
    const r = classifyPicture(p, last)
    assert.equal(r?.kind, 'photo', p)
    assert.equal(r.subject, 'gorilla', p)
    assert.equal(r.want, 'diagram', 'the earlier request said "diagram"')
  }
  assert.equal(classifyPicture('give me the exact picture of a tiger').want, 'photo')
  assert.equal(classifyPicture('diagram of a tiger').want, 'diagram')
  assert.equal(classifyPicture('in image', 'explain Thevenin theorem'), null, 'nothing pictorial to follow up on')
  assert.equal(classifyPicture('in image'), null, 'no previous request, no subject')
})

test('sanitizeSvg gives the drawing a size, and the data URI round-trips', () => {
  const out = sanitizeSvg('```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="9" cy="9" r="5"/></svg>\n```')
  assert.match(out.svg, /^<svg width="320" height="320" xmlns/)
  const uri = svgDataUri(out.svg)
  assert.match(uri, /^data:image\/svg\+xml;charset=utf-8,/)
  assert.equal(decodeURIComponent(uri.split(',')[1]), out.svg)
  const sized = sanitizeSvg('<svg xmlns="x" width="50" height="50"><g/></svg>')
  assert.equal((sized.svg.match(/width=/g) ?? []).length, 1, 'an existing size is kept')
})

const m = await bundle(`export { runAi } from '@/lib/ai/run'`, 'images-run')
const run = async (req, deps) => {
  const events = []
  await m.runAi(req, { streaming: false, emit: (e) => events.push(e), script: async () => { throw new Error('no model') }, explain: async () => { throw new Error('no model') }, ...deps })
  return events.find((e) => e.event === 'done').data
}
const HITS = [{ src: T(1), alt: 'Gorilla a', href: 'https://commons.wikimedia.org/wiki/File:a.jpg', credit: 'Jane · CC BY-SA 4.0' }]
const MANY = ['Mountain gorilla yawn', 'Silverback in forest', 'Gorilla mother and baby', 'Western lowland gorilla', 'Gorilla skeleton drawing', 'Gorilla at zoo'].map((alt, i) => ({ src: T(i), alt, href: `https://commons.wikimedia.org/wiki/File:g${i}.jpg`, credit: `Author ${i} · CC BY 4.0`, ratio: 1.3 }))

test('pipeline: a picture request returns real pictures, no model call, nothing but the pictures and a note', async () => {
  const calls = []
  const d = await run({ prompt: 'hi please provide me the diagram of gorilla' }, { images: async (s, w) => (calls.push([s, w]), HITS) })
  // one candidate cannot make four, so it also looked for photos to top up
  assert.deepEqual(calls, [['gorilla', 'diagram'], ['gorilla', 'photo']])
  assert.equal(d.images.length, 1)
  assert.equal(d.images[0].credit, 'Jane · CC BY-SA 4.0')
  assert.equal(d.answer, undefined)
  assert.match(d.message, /Wikimedia Commons/)
  assert.match(d.message, /only find 1 high-resolution picture/, 'one candidate → says so, does not pad')
})

test('pipeline: a diagram search that finds nothing falls back to photos', async () => {
  const calls = []
  const d = await run({ prompt: 'diagram of a tiger' }, { images: async (s, w) => (calls.push(w), w === 'diagram' ? [] : HITS) })
  assert.deepEqual(calls, ['diagram', 'photo'])
  assert.equal(d.images.length, 1)
})

test('pipeline: if image search fails or is absent, the honest reply is shown as an ANSWER, never as ASCII art', async () => {
  const down = await run({ prompt: 'photo of a tiger' }, { images: async () => { throw new Error('offline') } })
  assert.match(down.answer, /couldn’t reach the image search/)
  assert.ok(down.blocks.length > 0)
  const none = await run({ prompt: 'photo of a tiger' }, { images: async () => [] })
  assert.match(none.answer, /can’t produce a real picture/)
  const absent = await run({ prompt: 'photo of a tiger' }, {})
  assert.match(absent.answer, /can’t produce a real picture/)
})

test('pipeline: "in image" after our offer fetches pictures of the previous subject', async () => {
  const calls = []
  const d = await run(
    { prompt: 'in image', history: [{ prompt: 'hi please provide me the diagram of gorilla', answer: 'I can’t produce…' }] },
    { images: async (s, w) => (calls.push([s, w]), HITS) }
  )
  assert.deepEqual(calls, [['gorilla', 'diagram'], ['gorilla', 'photo']])
  assert.equal(d.images.length, 1)
})

test('pipeline: an SVG request returns the drawing as an image AND its code', async () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="50" fill="#444"/></svg>'
  const gen = { name: 'svg', generate: async () => '```svg\n' + SVG + '\n```\nSave as .svg.' }
  const d = await run({ prompt: 'SVG code for a gorilla' }, { explain: async () => gen })
  assert.match(d.answer, /```svg\n<svg/)
  assert.equal(d.images.length, 1)
  assert.match(d.images[0].src, /^data:image\/svg\+xml/)
})

// ── Exactly four, high-resolution only ─────────────────────────────────────

const H = (alt, credit, ratio = 1.4) => ({ src: T(1), alt, href: 'https://commons.wikimedia.org/wiki/File:x', credit, ratio })

test('isHighRes: judged on the ORIGINAL file; vector drawings always qualify', () => {
  assert.equal(isHighRes(3000, 2000, 'image/jpeg'), true)
  assert.equal(isHighRes(1200, 800, 'image/jpeg'), true, 'the minimum')
  assert.equal(isHighRes(800, 1200, 'image/jpeg'), true, 'portrait is fine')
  assert.equal(isHighRes(1199, 900, 'image/jpeg'), false, 'longer side under 1200')
  assert.equal(isHighRes(1600, 600, 'image/jpeg'), false, 'shorter side under 700')
  assert.equal(isHighRes(640, 480, 'image/png'), false)
  assert.equal(isHighRes(undefined, undefined, 'image/jpeg'), false, 'unknown size is not assumed to be big')
  assert.equal(isHighRes(100, 100, 'image/svg+xml'), true, 'SVG is sharp at any size')
})

test('parseCommons drops every low-resolution original, so none can be shown', () => {
  const lo = (n, w, h, mime = 'image/jpeg') => page(n, `File:Lo ${n}.jpg`, T(n), { width: w, height: h, mime })
  const json = { query: { pages: {
    1: page(1, 'File:Big.jpg', T(1)),
    2: lo(2, 640, 480),
    3: lo(3, 1100, 800),
    4: lo(4, 2000, 500),
    5: lo(5, 90, 90, 'image/svg+xml'),
    6: { title: 'File:nosize.jpg', index: 6, imageinfo: [{ thumburl: T(6), descriptionurl: 'https://commons.wikimedia.org/wiki/File:nosize.jpg' }] },
  } } }
  assert.deepEqual(parseCommons(json).map((h) => h.alt), ['Big', 'Lo 5'])
})

test('selectImages: always four when four exist — varied first, then relaxed, never padded', () => {
  assert.equal(IMAGES_SHOWN, 4)
  const hits = [
    H('Mountain gorilla yawn 1', 'Sharp · CC BY'),
    H('Mountain gorilla yawn 2', 'Sharp · CC BY'), // same shoot
    H('Mountain gorilla yawn 3', 'Sharp · CC BY'), // same shoot
    H('Silverback in the forest', 'Sharp · CC BY'),
    H('Gorilla mother and baby', 'Sharp · CC BY'), // third from Sharp
    H('Western lowland gorilla', 'Lee · CC BY'),
    H('Gorilla at the zoo', 'Kim · CC0'),
  ]
  const out = selectImages(hits)
  assert.equal(out.length, 4)
  assert.equal(out[0], hits[0], 'the top result always leads')
  assert.equal(new Set(out.map((h) => h.alt.replace(/\d+/g, '').trim())).size, 4, 'four different subjects')
  assert.ok(out.filter((h) => h.credit.startsWith('Sharp')).length <= 2, 'no author fills the grid')
})

test('selectImages: relaxes variety and shape rather than showing fewer than four', () => {
  // all one shoot by one author, one of them a banner: still four are returned
  const one = [H('Heron 1', 'A · x'), H('Heron 2', 'A · x'), H('Heron 3', 'A · x'), H('Heron 4', 'A · x', 5.0), H('Heron 5', 'A · x')]
  const out = selectImages(one)
  assert.equal(out.length, 4)
  assert.ok(!out.includes(one[3]) || out.length === 4, 'the banner is used only if needed')
  assert.ok(!selectImages(one).slice(0, 3).includes(one[3]), 'and not before the well-shaped ones')
})

test('selectImages: fewer than four exist → only those, never invented', () => {
  assert.deepEqual(selectImages([]), [])
  const three = [H('A', 'x · y'), H('B', 'p · q'), H('C', 'r · s')]
  assert.deepEqual(selectImages(three), three)
  assert.equal(selectImages(Array.from({ length: 40 }, (_, i) => H(`Subject ${String.fromCharCode(97 + (i % 26))}${i}`, `Author${i} · L`))).length, 4)
})

test('pipeline: always exactly four, whether the request is singular or plural', async () => {
  for (const prompt of ['give me the exact picture of gorilla', 'show me pictures of gorilla', 'gorilla images']) {
    const d = await run({ prompt }, { images: async () => MANY })
    assert.equal(d.images.length, 4, prompt)
    assert.match(d.message, /four high-resolution pictures of gorilla/, prompt)
  }
})

test('pipeline: if photos cannot supply four, it tops up from drawings (and the other way round)', async () => {
  const calls = []
  const DRAW = MANY.map((h, i) => ({ ...h, src: T(100 + i), alt: `Drawing ${i} of a gorilla` }))
  const d = await run({ prompt: 'photos of gorilla' }, {
    images: async (s, w) => (calls.push(w), w === 'photo' ? MANY.slice(0, 2) : DRAW),
  })
  assert.deepEqual(calls, ['photo', 'diagram'])
  assert.equal(d.images.length, 4)
})

test('pipeline: when fewer than four high-resolution pictures exist, it says so honestly', async () => {
  const d = await run({ prompt: 'pictures of gorilla' }, { images: async () => MANY.slice(0, 2) })
  assert.equal(d.images.length, 2)
  assert.match(d.message, /only find 2 high-resolution pictures of gorilla/)
  const one = await run({ prompt: 'pictures of gorilla' }, { images: async () => MANY.slice(0, 1) })
  assert.match(one.message, /only find 1 high-resolution picture of gorilla.*under it/)
})

test('images appear ONLY when asked for: ordinary questions never fetch any', async () => {
  const asked = []
  const deps = { images: async (s) => (asked.push(s), MANY), explain: async () => ({ name: 'e', generate: async () => '## Gorillas\nLarge apes.' }) }
  for (const prompt of ['what is a gorilla', 'tell me about gorillas', 'explain how gorillas live', 'show me the answer', 'how are images stored in a database', 'what is an image', 'show me the steps', 'I want to see the solution']) {
    await run({ prompt }, deps)
  }
  assert.deepEqual(asked, [], 'no image search was made for any of these')
})

