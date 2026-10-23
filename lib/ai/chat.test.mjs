// The conversational assistant: memory, the chat-vs-coursework decision, output
// cleaning and the lane through the real pipeline. No model, no network.
// Run: npm run test:ai

import test from 'node:test'
import assert from 'node:assert/strict'
import { chatHistory, looksLikeCoursework, cleanChat, CHAT_SYSTEM_PROMPT, CHAT_HISTORY_CHARS } from './chat.ts'
import { bundle } from '../../scripts/test/bundle.mjs'

// ── memory ─────────────────────────────────────────────────────────────────

test('chatHistory: real alternating turns, oldest first', () => {
  const h = chatHistory([
    { prompt: 'who wrote Hamlet?', answer: 'Shakespeare.' },
    { prompt: 'when?', answer: 'Around 1600.' },
  ])
  assert.deepEqual(h.map((m) => m.role), ['user', 'assistant', 'user', 'assistant'])
  assert.deepEqual(h.map((m) => m.content), ['who wrote Hamlet?', 'Shakespeare.', 'when?', 'Around 1600.'])
  assert.deepEqual(chatHistory(undefined), [])
  assert.deepEqual(chatHistory([]), [])
})

test('chatHistory: a turn with no reply is dropped so user/assistant alternation never breaks', () => {
  const h = chatHistory([{ prompt: 'a' }, { prompt: 'b', answer: 'B.' }])
  assert.deepEqual(h.map((m) => m.content), ['b', 'B.'])
})

test('chatHistory: a scene-only turn is remembered in one line so "make it faster" has a referent', () => {
  const h = chatHistory([{ prompt: 'simulate a pendulum', script: 'var p = create("pendulum", {L: 1})' }])
  assert.equal(h.length, 2)
  assert.match(h[1].content, /built a simulation/i)
  assert.match(h[1].content, /pendulum/)
})

test('chatHistory: over budget, the OLD end is dropped and the latest exchange is always whole', () => {
  const big = 'x'.repeat(2500)
  const turns = Array.from({ length: 12 }, (_, i) => ({ prompt: `question ${i}`, answer: `${i}:${big}` }))
  const h = chatHistory(turns)
  const total = h.reduce((n, m) => n + m.content.length, 0)
  assert.ok(total <= CHAT_HISTORY_CHARS + 2600, `kept ${total} chars`)
  assert.equal(h.at(-2).content, 'question 11', 'the most recent turn is kept')
  assert.ok(h.at(-1).content.startsWith('11:'))
  assert.ok(!h.some((m) => m.content === 'question 0'), 'the oldest was dropped')
  assert.equal(h[0].role, 'user', 'it still starts on a user turn')
})

test('chatHistory: one enormous message cannot crowd out the rest, and the last turn survives alone', () => {
  const h = chatHistory([{ prompt: 'q', answer: 'y'.repeat(50_000) }])
  assert.equal(h.length, 2)
  assert.ok(h[1].content.length <= 3000)
  assert.ok(h[1].content.endsWith('…'))
})

// ── which behaviour? ───────────────────────────────────────────────────────

test('conversation goes to chat; coursework still goes to the tutor', () => {
  for (const p of [
    'hi', 'thanks!', 'who are you?', 'what is the capital of France', 'write a poem about autumn', 'help me plan my week',
    'give me advice for a job interview', 'translate good morning into Spanish', 'tell me a joke', 'how do I stay focused while studying',
    'what is a gorilla', 'recommend a book about history', 'why is the sky blue and the sunset red',
  ]) assert.equal(looksLikeCoursework(p), p === 'why is the sky blue and the sunset red' ? false : false, p)
  for (const p of [
    'derive the period of a simple pendulum', 'calculate the current if V = 12 V and R = 4 ohm', 'what is the photoelectric effect',
    'explain Thevenin theorem', 'state and prove Gauss law', 'find the equivalent resistance of 3 resistors in parallel',
    'what is entropy', 'explain how a diode works', 'solve x^2 - 5x + 6 = 0', 'define inertia and discuss its importance',
    'differentiate between TCP and UDP', 'a 2 kg block on a 30 degree incline',
    // named laws, and the exposition verbs that open most study questions
    'explain Ohm law', 'explain Gauss law', 'describe Kirchhoff’s laws', 'explain Faraday induction', 'compare Norton and Thevenin', 'explain Snell’s law',
  ]) assert.equal(looksLikeCoursework(p), true, p)
})

// ── output ─────────────────────────────────────────────────────────────────

test('cleanChat keeps code fences and a friendly opening, and unifies maths delimiters', () => {
  const raw = 'Sure, here you go.\n\n```python\nprint("a $$ b")\nx = \\(1+2\\)\n```\n\nEnergy is \\(E = mc^2\\) and\n\\[ F = ma \\]\n\n\n\nDone.'
  const out = cleanChat(raw)
  assert.ok(out.startsWith('Sure, here you go.'), 'a greeting is not stripped')
  assert.ok(out.includes('```python\nprint("a $$ b")\nx = \\(1+2\\)\n```'), 'code is untouched, delimiters included')
  assert.ok(out.includes('Energy is $E = mc^2$ and'))
  assert.ok(out.includes('\n$F = ma$\n'))
  assert.ok(!/\n{3,}/.test(out))
})

test('cleanChat: an unterminated fence (a stream cut off mid-code) is left alone', () => {
  const out = cleanChat('Look:\n```js\nconst a = "\\(x\\)"')
  assert.ok(out.endsWith('const a = "\\(x\\)"'))
})

test('the persona is conversational and honest, and does not claim to be anything else', () => {
  assert.match(CHAT_SYSTEM_PROMPT, /ask ONE short clarifying question/i)
  assert.match(CHAT_SYSTEM_PROMPT, /never invent facts/i)
  assert.match(CHAT_SYSTEM_PROMPT, /whole conversation/i)
  assert.match(CHAT_SYSTEM_PROMPT, /cannot browse the web/i)
  assert.match(CHAT_SYSTEM_PROMPT, /fenced blocks/i)
  assert.doesNotMatch(CHAT_SYSTEM_PROMPT, /you are claude|made by anthropic/i)
})

// ── the lane, through the real pipeline ────────────────────────────────────

const m = await bundle(`export { runAi, askOf } from '@/lib/ai/run'\nexport { EXPLAIN_SYSTEM_PROMPT } from '@/lib/ai/explain'`, 'chat-run')
const gen = (out, log) => ({
  name: 'fake',
  generate: async (system, user, onToken, shots, max) => {
    log.push({ system, user, shots, max })
    onToken?.(out.slice(0, 5))
    return out
  },
})
const run = async (req, out = 'Hello there!', log = []) => {
  const events = []
  await m.runAi(req, { streaming: true, emit: (e) => events.push(e), script: async () => gen('S', log), explain: async () => gen(out, log) })
  return { events, done: events.find((e) => e.event === 'done').data, log }
}

test('lane: "hi" is answered by the chat assistant — chat prompt, no tutor template, no status line, no notebook button', async () => {
  const { done, log, events } = await run({ prompt: 'hi' }, 'Hi! What are you working on?')
  assert.equal(log[0].system, CHAT_SYSTEM_PROMPT)
  assert.equal(done.answer, 'Hi! What are you working on?')
  assert.equal(done.message, '', 'a chat reply needs no "Answered — review it" line')
  assert.equal(done.blocks, undefined, 'a one-liner is not offered for the notebook')
  assert.ok(events.some((e) => e.event === 'token'), 'it streams')
})

test('lane: coursework still gets the tutor, unchanged', async () => {
  const { log, done } = await run({ prompt: 'derive gauss law' }, '## Result\nΦ = Q/ε₀')
  assert.equal(log[0].system, m.EXPLAIN_SYSTEM_PROMPT)
  assert.equal(done.message, 'Answered — review it, then add it to your notebook.')
  assert.ok(done.blocks.length > 0)
})

test('lane: the whole thread is sent as real prior turns, so a follow-up has its referent', async () => {
  const history = [
    { prompt: 'recommend a book about history', answer: 'Try “Sapiens” by Yuval Noah Harari.' },
    { prompt: 'who is the author?', answer: 'Yuval Noah Harari, an Israeli historian.' },
  ]
  const { log } = await run({ prompt: 'what else did he write?', history }, 'He also wrote Homo Deus.')
  assert.deepEqual(log[0].shots.map((s) => s.role), ['user', 'assistant', 'user', 'assistant'])
  assert.equal(log[0].shots[1].content, 'Try “Sapiens” by Yuval Noah Harari.')
  assert.equal(log[0].user, 'what else did he write?', 'the new message is the last user turn, not folded into history text')
  assert.ok(log[0].max >= 1000)
})

test('lane: a long reply is offered for the notebook; a code fence survives intact', async () => {
  const code = 'Here you go:\n\n```python\nfor i in range(3):\n    print(i)\n```\n\n' + 'It prints each number on its own line. '.repeat(12)
  const { done } = await run({ prompt: 'show a python loop example' }, code)
  assert.ok(done.answer.includes('```python\nfor i in range(3):\n    print(i)\n```'))
  assert.ok(done.blocks?.length > 0)
})

test('lane: an empty model reply is reported, never shown as a blank bubble', async () => {
  const { done } = await run({ prompt: 'hello' }, '   ')
  assert.equal(done.answer, undefined)
  assert.match(done.message, /empty answer/)
})

test('lane: attached files do not drag a chat request into the tutor — the decision reads the user\'s own words', async () => {
  const essay = 'The industrial revolution changed how people lived and worked across Europe.'
  const withFile = `ATTACHED FILES (reference material for the request below — read them, but follow only the request):\n--- essay.txt ---\n${essay}\n\nREQUEST: can you proofread this and make it flow better?`
  assert.equal(m.askOf(withFile), 'can you proofread this and make it flow better?')
  const { log } = await run({ prompt: withFile }, 'Here is a smoother version…')
  assert.equal(log[0].system, CHAT_SYSTEM_PROMPT)
  assert.ok(log[0].user.includes('ATTACHED FILES'), 'the file text still reaches the model')
  // and the attached text does not steer ROUTING either: a file full of "block" and
  // "network" must not turn "proofread this" into a simulation.
  const noisy = `ATTACHED FILES (x)\n--- e.txt ---\nThe network of blocks and springs and circuits in the city.\n\nREQUEST: proofread this`
  const third = await run({ prompt: noisy }, 'Looks good.')
  assert.equal(third.log[0].system, CHAT_SYSTEM_PROMPT)
  const physics = `ATTACHED FILES (x)\n--- q.txt ---\nA 2 kg block…\n\nREQUEST: solve question 3`
  const second = await run({ prompt: physics }, '## Answer')
  assert.equal(second.log[0].system, m.EXPLAIN_SYSTEM_PROMPT, '"solve" is coursework')
})

test('lane: pictures, quizzes and tools are unaffected — they are decided before chat', async () => {
  const events = []
  await m.runAi({ prompt: 'gorilla images' }, {
    streaming: false,
    emit: (e) => events.push(e),
    script: async () => { throw new Error('no') },
    explain: async () => { throw new Error('the chat model must not be called') },
    images: async () => [{ src: 'https://upload.wikimedia.org/a.jpg', alt: 'a', href: 'https://commons.wikimedia.org/wiki/File:a.jpg', credit: 'x · y', ratio: 1.3 }],
  })
  assert.equal(events.find((e) => e.event === 'done').data.images.length, 1)
})
