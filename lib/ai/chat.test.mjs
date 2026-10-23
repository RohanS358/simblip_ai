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
