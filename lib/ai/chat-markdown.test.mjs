// Chat markdown: structure, streaming, and — the point of building a tree rather
// than HTML — that nothing a model writes can become markup.
// Run: npm run test:ai

import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMarkdown, parseInline, safeHref } from './chat-markdown.ts'

const text = (inl) =>
  inl.map((n) => (n.t === 'text' ? n.v : n.t === 'br' ? '\n' : n.t === 'code' ? `\`${n.v}\`` : n.t === 'math' ? `$${n.v}$` : n.c ? `<${n.t}>${text(n.c)}</${n.t}>` : '')).join('')

test('inline: bold, italic, strike, code and nesting', () => {
  assert.equal(text(parseInline('a **bold** and *it* and ~~gone~~ and `x = 1`')), 'a <bold>bold</bold> and <italic>it</italic> and <strike>gone</strike> and `x = 1`')
  assert.equal(text(parseInline('**bold with *italic* inside**')), '<bold>bold with <italic>italic</italic> inside</bold>')
  assert.equal(text(parseInline('__bold__ and _it_')), '<bold>bold</bold> and <italic>it</italic>')
})

test('inline: things that LOOK like emphasis but are not stay text', () => {
  for (const s of ['snake_case_name', 'a * b * c', '2 * 3', 'price is 5*4=20 ok', 'unclosed **bold', 'a_b_c and d_e', '* not a list inline']) {
    const out = parseInline(s)
    assert.ok(out.every((n) => n.t === 'text'), `${s} → ${JSON.stringify(out)}`)
    assert.equal(text(out), s)
  }
})

test('inline: an escaped marker is literal', () => {
  assert.equal(text(parseInline('2 \\* 3 \\* 4 and \\`not code\\`')), '2 * 3 * 4 and `not code`')
})

test('inline: maths needs no space inside the dollars, so money is not maths', () => {
  assert.equal(text(parseInline('Energy is $E = mc^2$ here')), 'Energy is $E = mc^2$ here')
  assert.equal(parseInline('Energy is $E = mc^2$ here').filter((n) => n.t === 'math').length, 1)
  assert.equal(parseInline('it costs $5 and then $10 more').filter((n) => n.t === 'math').length, 0)
  assert.equal(parseInline('between $5$10').filter((n) => n.t === 'math').length, 0)
})

test('inline: links — only http, https and mailto become links; the rest is plain text', () => {
  const ok = parseInline('see [the docs](https://example.com/a?b=1) now')
  assert.equal(ok.find((n) => n.t === 'link').href, 'https://example.com/a?b=1')
  assert.equal(parseInline('[mail](mailto:a@b.co)').find((n) => n.t === 'link')?.href, 'mailto:a@b.co')
  for (const bad of ['[x](javascript:alert(1))', '[x](data:text/html;base64,AAAA)', '[x](vbscript:run)', '[x](//evil.example)', '[x](file:///etc/passwd)', '[x]( javascript:alert(1))', '[x](JaVaScRiPt:alert(1))']) {
    assert.ok(!parseInline(bad).some((n) => n.t === 'link'), `${bad} must not become a link`)
  }
  assert.equal(safeHref('https://a.b'), 'https://a.b')
  assert.equal(safeHref('javascript:1'), null)
  assert.equal(safeHref('https://a.b/"onmouseover="x'), null, 'quotes cannot break out of an attribute')
  assert.equal(safeHref('https://a.b/<script>'), null)
})

test('inline: bare URLs are linked, without trailing punctuation', () => {
  const l = parseInline('go to https://example.com/page, then stop.').find((n) => n.t === 'link')
  assert.equal(l.href, 'https://example.com/page')
  assert.equal(parseInline('see (https://a.example/x).').find((n) => n.t === 'link').href, 'https://a.example/x')
  assert.ok(!parseInline('xhttps://a.example').some((n) => n.t === 'link'), 'not inside a word')
})

test('blocks: paragraphs keep their line breaks (poems, addresses, short lists)', () => {
  const [p] = parseMarkdown('Roses are red\nViolets are blue')
  assert.equal(p.t, 'p')
  assert.equal(text(p.c), 'Roses are red\nViolets are blue')
  assert.equal(parseMarkdown('one\n\ntwo').length, 2)
})

test('blocks: headings, rules, quotes', () => {
  const b = parseMarkdown('# Title\n\n### Sub ###\n\n---\n\n> quoted **text**\n> second line')
  assert.deepEqual(b.map((x) => x.t), ['h', 'h', 'hr', 'quote'])
  assert.equal(b[0].level, 1)
  assert.equal(b[1].level, 3)
  assert.equal(text(b[1].c), 'Sub')
  assert.equal(text(b[3].c[0].c), 'quoted <bold>text</bold>\nsecond line')
})

test('blocks: fenced code keeps every character, names its language, and is never parsed as markdown', () => {
  const [c] = parseMarkdown('```python\nfor i in range(3):\n    print("**not bold** <b>x</b>")\n```')
  assert.equal(c.t, 'code')
  assert.equal(c.lang, 'python')
  assert.equal(c.open, false)
  assert.equal(c.v, 'for i in range(3):\n    print("**not bold** <b>x</b>")')
})

test('blocks: a fence still open (a reply mid-stream) renders as code so far — and text after a closed one is normal', () => {
  const [c] = parseMarkdown('Here:\n\n```js\nconst a = 1\nconst b = ')
  const code = parseMarkdown('Here:\n\n```js\nconst a = 1\nconst b = ').find((x) => x.t === 'code')
  assert.equal(code.open, true)
  assert.equal(code.v, 'const a = 1\nconst b = ')
  assert.equal(c.t, 'p')
  const after = parseMarkdown('```\nx\n```\nthen **bold**')
  assert.deepEqual(after.map((x) => x.t), ['code', 'p'])
})

test('blocks: a longer fence can contain a shorter one', () => {
  const [c] = parseMarkdown('````md\n```js\ninner\n```\n````')
  assert.equal(c.v, '```js\ninner\n```')
})

test('blocks: lists — bullets, numbers (with their start), and nesting by indent', () => {
  const [l] = parseMarkdown('- one\n- two\n  - two-a\n  - two-b\n- three')
  assert.equal(l.t, 'list')
  assert.equal(l.ordered, false)
  assert.equal(l.items.length, 3)
  assert.equal(l.items[1].children[0].t, 'list')
  assert.deepEqual(l.items[1].children[0].items.map((i) => text(i.c)), ['two-a', 'two-b'])
  const [n] = parseMarkdown('3. third\n4. fourth')
  assert.equal(n.ordered, true)
  assert.equal(n.start, 3)
  const mixed = parseMarkdown('1. step\n   - detail a\n   - detail b\n2. next')
  assert.equal(mixed[0].items[0].children[0].ordered, false)
})

test('blocks: a wrapped list item continues the item above it', () => {
  const [l] = parseMarkdown('- a long item that\n  wraps onto a second line\n- next')
  assert.equal(l.items.length, 2)
  assert.match(text(l.items[0].c), /wraps onto a second line/)
})

test('blocks: tables — header, alignment, rows; ragged rows are padded', () => {
  const [t] = parseMarkdown('| Name | Qty | Note |\n|:-----|----:|:----:|\n| a | 1 | x |\n| b | 2 |')
  assert.equal(t.t, 'table')
  assert.deepEqual(t.head.map(text), ['Name', 'Qty', 'Note'])
  assert.deepEqual(t.align, ['left', 'right', 'center'])
  assert.equal(t.rows.length, 2)
  assert.deepEqual(t.rows[1].map(text), ['b', '2', ''])
  assert.ok(!parseMarkdown('a | b\nplain text').some((x) => x.t === 'table'), 'a pipe alone is not a table')
})

test('blocks: a standalone $equation$ line is display maths; a sentence with maths is not', () => {
  assert.deepEqual(parseMarkdown('$F = ma$'), [{ t: 'math', v: 'F = ma' }])
  assert.deepEqual(parseMarkdown('$$F = ma$$'), [{ t: 'math', v: 'F = ma' }])
  assert.equal(parseMarkdown('so $F = ma$ holds')[0].t, 'p')
  assert.equal(parseMarkdown('$5 and $10')[0].t, 'p', 'money is not maths')
})

test('SAFETY: raw HTML, scripts and event handlers come out as plain text, never as markup', () => {
  const attack = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">click</a>',
    '<iframe src="https://evil.example"></iframe>',
    '<svg onload=alert(1)>',
    '[click](javascript:alert(1))',
    '![img](https://evil.example/track.gif)',
  ].join('\n\n')
  const walk = (blocks) => JSON.stringify(blocks)
  const tree = parseMarkdown(attack)
  const json = walk(tree)
  assert.ok(!tree.some((b) => b.t === 'html'), 'there is no html node type at all')
  assert.ok(!/"t":"link","href":"javascript/i.test(json))
  // every angle bracket survives only inside text nodes
  for (const b of tree) {
    for (const n of b.c ?? []) assert.ok(['text', 'br', 'code', 'bold', 'italic', 'strike', 'link', 'math'].includes(n.t))
  }
  assert.ok(json.includes('<script>alert(1)</script>'), 'kept verbatim as text')
})

test('SAFETY: every node type the renderer must handle is a known one', () => {
  const doc = '# h\n\ntext **b** *i* ~~s~~ `c` $m$ [l](https://a.b)\n\n- x\n  1. y\n\n> q\n\n| a |\n|---|\n| b |\n\n---\n\n```\ncode\n```\n\n$e$'
  const seen = new Set()
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk)
    if (x && typeof x === 'object') {
      if (x.t) seen.add(x.t)
      Object.values(x).forEach(walk)
    }
  }
  walk(parseMarkdown(doc))
  const allowed = new Set(['p', 'h', 'hr', 'quote', 'list', 'table', 'code', 'math', 'text', 'bold', 'italic', 'strike', 'link', 'br'])
  for (const t of seen) assert.ok(allowed.has(t), `unexpected node type ${t}`)
})

test('robust: pathological and hostile input never throws and stays fast', () => {
  const nasty = [
    '', ' ', '\n\n\n', '*'.repeat(5000), '_'.repeat(5000), '['.repeat(3000) + '](' + ')'.repeat(3000), '`'.repeat(4001),
    '$'.repeat(4000), '| a |'.repeat(2000), '> '.repeat(500) + 'x', '- '.repeat(2000), '1. '.repeat(2000), '**a** '.repeat(3000),
    '\\'.repeat(5000), '```'.repeat(2000), '#'.repeat(9000), 'https://' + 'a'.repeat(50_000), ('- a\n' + '  '.repeat(100) + '- deep\n').repeat(300),
  ]
  const t0 = performance.now()
  for (const s of nasty) assert.doesNotThrow(() => parseMarkdown(s), s.slice(0, 20))
  assert.ok(performance.now() - t0 < 4000, `took ${(performance.now() - t0).toFixed(0)} ms`)
})

test('performance: a 40 KB reply parses in a few milliseconds per pass (it re-parses as it streams)', () => {
  const chunk = '## Heading\n\nSome **bold** text with `code` and $x^2$ maths and a [link](https://a.b).\n\n- item one\n- item two\n\n```js\nconst a = 1\n```\n\n'
  const src = chunk.repeat(Math.ceil(40_000 / chunk.length))
  parseMarkdown(src)
  const t0 = performance.now()
  for (let i = 0; i < 10; i++) parseMarkdown(src)
  const per = (performance.now() - t0) / 10
  assert.ok(per < 60, `${per.toFixed(1)} ms per parse`)
})
