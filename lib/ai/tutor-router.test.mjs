// Which requests become tool calls — and, as importantly, which do NOT.
// Run: npm run test:ai
import test from 'node:test'
import assert from 'node:assert/strict'
import { routeAct } from './tutor/router.ts'

const quick = (p) => routeAct(p, true)?.kind === 'quick' ? routeAct(p, true).tool : null

test('transport and history commands are quick: no model, one tool', () => {
  for (const [p, tool] of [
    ['run', 'scene.run'], ['Run it', 'scene.run'], ['play', 'scene.run'], ['please start the simulation', 'scene.run'], ['press play!', 'scene.run'],
    ['pause', 'scene.pause'], ['freeze it', 'scene.pause'],
    ['reset', 'scene.reset'], ['stop the simulation', 'scene.reset'], ['restart', 'scene.reset'],
    ['undo', 'scene.undo'], ['undo that', 'scene.undo'], ['take that back', 'scene.undo'],
    ['redo', 'scene.redo'],
    ["what's on this page?", 'scene.describe'], ['describe the page', 'scene.describe'],
  ]) assert.equal(quick(p), tool, p)
})

test('a sentence that merely CONTAINS a command word is not a command', () => {
  for (const p of [
    'run a simulation of a pendulum with a 2 kg bob',
    'start by deriving Gauss law',
    'play with the spring constant and show the graph',
    'stop and think: why does the current fall?',
    'undo the damping and add a graph',
  ]) assert.equal(routeAct(p, true), null, p)
})

test('measurement questions go to the agent with a narrow tool list — only when a page exists', () => {
  for (const p of ['how fast is the ball going?', 'what is the current through R2', 'what is the voltage across the capacitor?', 'measure the speed', 'how high does it go']) {
    const plan = routeAct(p, true)
    assert.equal(plan?.kind, 'agent', p)
    assert.ok(plan.tools.length <= 4, `a 1–2B model must not see more than 4 tools (${plan.tools})`)
    assert.ok(plan.tools.includes('scene.measure'))
  }
  assert.equal(routeAct('how fast is the ball going?', false), null, 'nothing on the page → nothing to measure')
})

test('page navigation goes to the agent with only page tools', () => {
  for (const p of ['open my circuits page', 'create a new page', 'list my pages', 'go to the physics board', 'new document']) {
    const plan = routeAct(p, false)
    assert.equal(plan?.kind, 'agent', p)
    assert.deepEqual(plan.tools.sort(), ['page.create', 'page.list', 'page.open'])
  }
})

test('ordinary questions and builds fall through to the existing lanes', () => {
  for (const p of ['derive the period of a simple pendulum', 'simulate a half-wave rectifier', 'explain Thevenin theorem', 'make me slides on diodes', 'add a note saying check units'])
    assert.equal(routeAct(p, true), null, p)
})

test('learning requests route to the learn tools', () => {
  assert.equal(quick('quiz me'), 'learn.cards.next')
  assert.deepEqual(routeAct('make 3 flash cards about Kirchhoff', true).tools, ['course.search', 'learn.cards.create'])
  assert.ok(routeAct("I'm stuck on this", true).tools.includes('learn.hint'))
  assert.ok(routeAct('what should I study for tomorrow? test tomorrow', true).tools.includes('learn.mastery.get'))
  assert.deepEqual(routeAct('give me a mnemonic for the resistor colours', true).tools, ['learn.mnemonic'])
})

test('"teach me whatever is in this page" tours the OPEN page; a topic still means a topic', () => {
  for (const p of ['teach me whatever is in this page', 'Teach me everything on this page', 'explain this page', 'walk me through this slide deck', 'read this page and teach me', 'teach me what is on the current board', 'explain whatever is on the page to me']) {
    assert.deepEqual(routeAct(p, true), { kind: 'direct', tool: 'teach.page', args: {} }, p)
  }
  assert.equal(routeAct('teach me ohms law', true).tool, 'teach.lesson')
  assert.equal(routeAct('teach me how pages are stored in memory', true).tool, 'teach.lesson', 'memory paging is a topic, not this page')
  assert.equal(routeAct('explain the page replacement algorithm', true), null)
})

test('sketch requests go to the agent with the sketch tools (reading, building, and "why does it not work")', () => {
  for (const p of ['read my drawing', 'what did you read?', 'recognize this circuit diagram', 'check my sketch', 'is my circuit correct?', "what's wrong with my circuit", 'look at this photo', 'identify my circuit drawing']) {
    const plan = routeAct(p, true)
    assert.equal(plan?.kind, 'agent', p)
    assert.equal(plan.tools[0], 'sketch.recognize', `${p} → ${plan.tools}`)
    assert.ok(plan.tools.length <= 4)
  }
  for (const p of ['turn my drawing into a circuit', 'convert this photo into a simulation', 'make my sketch live', 'simulate my drawing', 'make it live', 'bring my sketch to life']) {
    const plan = routeAct(p, true)
    assert.equal(plan?.kind, 'agent', p)
    assert.equal(plan.tools[0], 'sketch.to_scene', `${p} → ${plan.tools}`)
  }
  for (const p of ['why does the LED not light?', "why isn't my circuit working", 'why doesn\'t the bulb glow', 'why won\'t the current flow?']) {
    const plan = routeAct(p, true)
    assert.equal(plan?.kind, 'agent', p)
    assert.ok(plan.tools.includes('sketch.recognize'), `${p} → ${plan.tools}`)
  }
  assert.equal(routeAct("why does the LED not light?", false)?.tools.includes('sketch.recognize') ?? false, false, '"why" needs a page with something on it')
})

test('ordinary questions about drawing, circuits or LEDs are NOT sketch requests', () => {
  for (const p of ['how do I draw a circuit?', 'explain how an LED works', 'what is a drawing of a free body diagram', 'why do capacitors block DC', 'draw me a resistor', 'what does a diode do']) {
    const plan = routeAct(p, true)
    assert.ok(!plan || !plan.tools?.includes('sketch.to_scene'), `${p} → ${JSON.stringify(plan)}`)
  }
})
