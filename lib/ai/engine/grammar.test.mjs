// The tool-call grammar must accept every valid call and reject malformed ones.
// llama.cpp is not available in Node, so this file carries a small GBNF
// matcher (set-of-positions, no backtracking blowup) and runs the generated
// grammars through it — the grammar is checked as a language, not by eye.
// Run: npm run test:ai

import test from 'node:test'
import assert from 'node:assert/strict'
import { schemaToGbnf, toolCallGbnf, grammarRules } from './grammar.ts'

// ── A minimal GBNF matcher ─────────────────────────────────────────────────

function parseGrammar(src) {
  const rules = new Map()
  for (const line of src.split('\n')) {
    const m = /^([a-z][a-z0-9-]*) ::= (.*)$/.exec(line)
    if (m) rules.set(m[1], parseAlts(m[2]))
  }
  return rules
}

function parseAlts(s) {
  let i = 0
  const peek = () => s[i]
  function alts() {
    const out = [seq()]
    while (peek() === '|') { i++; out.push(seq()) }
    return { t: 'alt', v: out }
  }
  function seq() {
    const items = []
    for (;;) {
      while (s[i] === ' ') i++
      const c = peek()
      if (c === undefined || c === '|' || c === ')') break
      items.push(rep(atom()))
    }
    return { t: 'seq', v: items }
  }
  function atom() {
    const c = s[i]
    if (c === '"') {
      i++
      let lit = ''
      while (s[i] !== '"') {
        if (s[i] === '\\') {
          i++
          const e = s[i++]
          lit += e === 'n' ? '\n' : e === 't' ? '\t' : e
        } else lit += s[i++]
      }
      i++
      return { t: 'lit', v: lit }
    }
    if (c === '[') {
      i++
      let neg = false
      if (s[i] === '^') { neg = true; i++ }
      const ranges = []
      const ch = () => {
        if (s[i] === '\\') {
          i++
          const e = s[i++]
          if (e === 'x') { const h = s.slice(i, i + 2); i += 2; return String.fromCharCode(parseInt(h, 16)) }
          return e === 'n' ? '\n' : e === 't' ? '\t' : e
        }
        return s[i++]
      }
      while (s[i] !== ']') {
        const a = ch()
        if (s[i] === '-' && s[i + 1] !== ']') { i++; ranges.push([a, ch()]) } else ranges.push([a, a])
      }
      i++
      return { t: 'cls', neg, v: ranges }
    }
    if (c === '(') {
      i++
      const a = alts()
      assert.equal(s[i], ')', `unbalanced ( in: ${s}`)
      i++
      return a
    }
    const m = /^[a-z][a-z0-9-]*/.exec(s.slice(i))
    assert.ok(m, `cannot parse near "${s.slice(i, i + 20)}" in: ${s}`)
    i += m[0].length
    return { t: 'ref', v: m[0] }
  }
  function rep(a) {
    const c = s[i]
    if (c === '*') { i++; return { t: 'rep', min: 0, max: Infinity, v: a } }
    if (c === '+') { i++; return { t: 'rep', min: 1, max: Infinity, v: a } }
    if (c === '?') { i++; return { t: 'rep', min: 0, max: 1, v: a } }
    if (c === '{') {
      const m = /^\{(\d+)(?:,(\d*))?\}/.exec(s.slice(i))
      assert.ok(m, `bad repetition in: ${s}`)
      i += m[0].length
      const min = +m[1]
      const max = m[2] === undefined ? min : m[2] === '' ? Infinity : +m[2]
      return { t: 'rep', min, max, v: a }
    }
    return a
  }
  const r = alts()
  assert.equal(i, s.length, `trailing junk in rule: ${s.slice(i)}`)
  return r
}

/** Match `text` against rule `root`; returns true if the whole text is accepted. */
function accepts(rules, root, text) {
  const memo = new Map()
  // match(node, pos) → Set of end positions
  function m(node, pos) {
    switch (node.t) {
      case 'lit': return text.startsWith(node.v, pos) ? new Set([pos + node.v.length]) : new Set()
      case 'cls': {
        if (pos >= text.length) return new Set()
        const c = text[pos]
        const inR = node.v.some(([a, b]) => c >= a && c <= b)
        return inR !== node.neg ? new Set([pos + 1]) : new Set()
      }
      case 'ref': {
        const k = node.v + '@' + pos
        if (memo.has(k)) return memo.get(k)
        memo.set(k, new Set()) // guards left recursion
        assert.ok(rules.has(node.v), `undefined rule ${node.v}`)
        const r = m(rules.get(node.v), pos)
        memo.set(k, r)
        return r
      }
      case 'alt': { const out = new Set(); for (const a of node.v) for (const e of m(a, pos)) out.add(e); return out }
      case 'seq': {
        let cur = new Set([pos])
        for (const it of node.v) {
          const nxt = new Set()
          for (const p of cur) for (const e of m(it, p)) nxt.add(e)
          cur = nxt
          if (!cur.size) break
        }
        return cur
      }
      case 'rep': {
        let layer = new Set([pos])
        const out = new Set()
        if (node.min === 0) out.add(pos)
        const seen = new Set([pos])
        for (let n = 1; n <= node.max && layer.size; n++) {
          const nxt = new Set()
          for (const p of layer) for (const e of m(node.v, p)) nxt.add(e)
          layer = new Set([...nxt].filter((e) => n < node.min || !seen.has(e)))
          for (const e of nxt) { if (n >= node.min) out.add(e); seen.add(e) }
          if (n > 400) break
        }
        return out
      }
    }
    throw new Error('bad node')
  }
  return m(rules.get(root), 0).has(text.length)
}

const ok = (g, text) => accepts(parseGrammar(g), 'root', text)

// ── Tests ──────────────────────────────────────────────────────────────────

const SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    count: { type: 'integer' },
    mode: { enum: ['fast', 'slow'] },
    flag: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
    note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['id', 'count'],
}

test('every generated rule is defined and nothing is left dangling', () => {
  for (const g of [schemaToGbnf(SCHEMA), toolCallGbnf([{ name: 'a.b', inputSchema: SCHEMA }, { name: 'c.d', inputSchema: { type: 'object', properties: {} } }])]) {
    const { defined, referenced } = grammarRules(g)
    for (const r of referenced) assert.ok(defined.has(r), `rule "${r}" is referenced but never defined`)
    assert.ok(defined.has('root'))
  }
})

test('accepts valid objects: required only, with optionals, in any optional subset', () => {
  const g = schemaToGbnf(SCHEMA)
  for (const t of [
    '{"id":"x","count":3}',
    '{"id": "x", "count": -12}',
    '{"id":"x","count":3,"mode":"fast"}',
    '{"id":"x","count":3,"flag":true}',
    '{"id":"x","count":3,"tags":[]}',
    '{"id":"x","count":3,"tags":["a","b"],"note":null}',
    '{"id":"x","count":3,"mode":"slow","flag":false,"tags":["q"],"note":"hi"}',
    '{\n  "id":"a\\"b","count":0}',
  ]) assert.ok(ok(g, t), `should accept ${t}`)
})

test('rejects malformed or schema-violating objects', () => {
  const g = schemaToGbnf(SCHEMA)
  for (const t of [
    '{"id":"x"}', // missing required count
    '{"count":3}', // missing required id
    '{"id":"x","count":"3"}', // string where integer goes
    '{"id":"x","count":3.5}', // not an integer
    '{"id":"x","count":3,"mode":"medium"}', // outside enum
    '{"id":"x","count":3,"flag":"yes"}', // not a boolean
    '{"id":"x","count":3,}', // trailing comma
    '{"id":"x","count":3', // unterminated
    '{"id":x,"count":3}', // unquoted string
    'null',
  ]) assert.ok(!ok(g, t), `should reject ${t}`)
})

test('objects with only optional keys: any subset, never a stray comma', () => {
  const g = schemaToGbnf({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' }, c: { type: 'boolean' } } })
  for (const t of ['{}', '{"a":"x"}', '{"b":1}', '{"c":true}', '{"a":"x","c":false}', '{"b":2,"c":true}', '{"a":"x","b":1,"c":true}'])
    assert.ok(ok(g, t), `should accept ${t}`)
  for (const t of ['{,"a":"x"}', '{"a":"x",}', '{"c":true,"a":"x"}' /* out of order */, '{"d":1}'])
    assert.ok(!ok(g, t), `should reject ${t}`)
})

test('tool-call grammar: exactly one named tool with its own args', () => {
  const g = toolCallGbnf([
    { name: 'scene.run', inputSchema: { type: 'object', properties: {} } },
    { name: 'scene.measure', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'page.open', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  ])
  for (const t of [
    '{"tool":"scene.run","args":{}}',
    '{"tool": "scene.measure", "args": {"id":"ball"}}',
    '{"tool":"page.open","args":{"id":"p1"}}',
  ]) assert.ok(ok(g, t), `should accept ${t}`)
  for (const t of [
    '{"tool":"scene.nope","args":{}}', // unknown tool
    '{"tool":"scene.measure","args":{}}', // missing required arg
    '{"tool":"scene.run","args":{"id":"x"}}', // arg not in that tool's schema
    '{"tool":"scene.run"}', // no args
    '{"args":{},"tool":"scene.run"}', // wrong key order
  ]) assert.ok(!ok(g, t), `should reject ${t}`)
})

test('two tools that share a field name do not collide', () => {
  const g = toolCallGbnf([
    { name: 'a.x', inputSchema: { type: 'object', properties: { v: { type: 'string' } }, required: ['v'] } },
    { name: 'b.y', inputSchema: { type: 'object', properties: { v: { type: 'integer' } }, required: ['v'] } },
  ])
  assert.ok(ok(g, '{"tool":"a.x","args":{"v":"s"}}'))
  assert.ok(ok(g, '{"tool":"b.y","args":{"v":4}}'))
  assert.ok(!ok(g, '{"tool":"a.x","args":{"v":4}}'))
  assert.ok(!ok(g, '{"tool":"b.y","args":{"v":"s"}}'))
})

test('nested objects and arrays of objects', () => {
  const g = schemaToGbnf({
    type: 'object',
    properties: { ops: { type: 'array', items: { type: 'object', properties: { op: { enum: ['add', 'remove'] }, id: { type: 'string' } }, required: ['op'] } } },
    required: ['ops'],
  })
  assert.ok(ok(g, '{"ops":[{"op":"add","id":"a"},{"op":"remove"}]}'))
  assert.ok(!ok(g, '{"ops":[{"op":"explode"}]}'))
  assert.ok(!ok(g, '{"ops":[{"id":"a"}]}'))
})
