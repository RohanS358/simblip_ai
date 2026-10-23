// Ordinary conversation is answered, never built — and real build orders and coursework keep
// their lanes. Pure routing: no model, no network.
// Run: npm run test:ai

import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyIntent, isGeneralConversation } from './route-intent.ts'

test('routing: ordinary conversation is answered, not built — even when it opens with a build verb', () => {
  for (const p of ['hi', 'make me a study plan for exams', 'build a daily habit of reading', 'create a short story about a robot', 'write a poem about autumn', 'put together a packing list for a trip'])
    assert.equal(classifyIntent(p), 'explain', p)
  assert.equal(isGeneralConversation('hi'), true)
})

test('routing: real build orders and coursework keep their lanes', () => {
  assert.equal(classifyIntent('simulate a pendulum'), 'simulate')
  assert.equal(classifyIntent('build an RLC circuit and plot the current'), 'simulate')
  assert.equal(classifyIntent('plot y = x^2'), 'simulate')
  assert.equal(classifyIntent('derive gauss law'), 'explain')
  assert.equal(classifyIntent('derive the torque equation of a DC motor'), 'both')
  assert.equal(classifyIntent('make me slides on thermodynamics'), 'explain')
  assert.equal(isGeneralConversation('simulate a pendulum'), false)
  assert.equal(isGeneralConversation('plot y = x^2'), false)
})

test('routing: with a page open, a bare build verb stays a command about that page', () => {
  assert.notEqual(classifyIntent('make the bob heavier', true), 'explain')
  assert.equal(classifyIntent('make it heavier', true), 'edit')
  assert.equal(classifyIntent('make me a study plan', true), 'explain', 'but naming something to WRITE is still conversation')
})
