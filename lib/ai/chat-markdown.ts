// Markdown for chat replies: text in, a small typed tree out.
//
// A tree, not an HTML string, on purpose. The renderer (components/workspace/
// chat-markdown.tsx) turns it into React elements, so every character of model
// output reaches the page as TEXT — there is no path from a reply to markup,
// which is the whole safety argument. The only HTML in the result is KaTeX's,
// produced by the maths library from an expression, never from the reply.
//
// Supported: paragraphs (line breaks kept — chat replies use them), headings,
// fenced code (an unterminated fence is fine: that is a reply still streaming),
// block quotes, nested bullet/numbered lists, tables, rules, and inline code,
// bold, italic, strikethrough, links, bare URLs and $maths$.
// Links are limited to http, https and mailto; anything else renders as text.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'math'; v: string }
  | { t: 'bold' | 'italic' | 'strike'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'br' }

export interface ListItem {
  c: Inline[]
  /** Nested lists (and any other blocks) under this item. */
  children: Block[]
}

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'math'; v: string }
  | { t: 'h'; level: 1 | 2 | 3 | 4 | 5 | 6; c: Inline[] }
  | { t: 'code'; lang: string; v: string; open: boolean }
  | { t: 'quote'; c: Block[] }
  | { t: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { t: 'table'; head: Inline[][]; align: ('left' | 'right' | 'center' | null)[]; rows: Inline[][][] }
  | { t: 'hr' }

// ── Inline ─────────────────────────────────────────────────────────────────

const SAFE_PROTOCOL = /^(?:https?:\/\/|mailto:)/i

/** A link target that is safe to put in an href. */
export function safeHref(raw: string): string | null {
  const href = raw.trim()
  if (!href || /[\s<>"]/.test(href)) return null
  return SAFE_PROTOCOL.test(href) ? href : null
}

const isWordChar = (c: string | undefined) => !!c && /[A-Za-z0-9]/.test(c)

/** Find the index of `marker` at or after `from` that closes an emphasis run:
 *  not escaped, and not the start of a longer run of the same character. */
function findClose(s: string, marker: string, from: number): number {
  let i = from
  while (i < s.length) {
    const j = s.indexOf(marker, i)
    if (j < 0) return -1
    if (s[j - 1] === '\\') {
      i = j + 1
      continue
    }
    // `*` must not close on the first star of `**` (and vice versa).
    if (marker.length === 1 && s[j + 1] === marker) {
      i = j + 2
      continue
    }
    return j
  }
  return -1
}

const EMPHASIS = [
  ['~~', 'strike'],
  ['**', 'bold'],
  ['__', 'bold'],
  ['*', 'italic'],
  ['_', 'italic'],
] as const

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf })
    buf = ''
  }
  let i = 0
  scan: while (i < s.length) {
    const c = s[i]

    // Backslash escape of a markdown character.
    if (c === '\\' && i + 1 < s.length && /[\\`*_{}\[\]()#+\-.!$~|>]/.test(s[i + 1])) {
      buf += s[i + 1]
      i += 2
      continue
    }

    // Inline code: `x` or ``x`x``.
    if (c === '`') {
      let n = 1
      while (s[i + n] === '`') n++
      const fence = '`'.repeat(n)
      const end = s.indexOf(fence, i + n)
      if (end > 0 && s[end + n] !== '`') {
        flush()
        out.push({ t: 'code', v: s.slice(i + n, end).replace(/^ (.*) $/, '$1') })
        i = end + n
      } else {
        buf += fence
        i += n
      }
      continue
    }

    // Maths: $…$ with no space just inside the dollars, so "$5 and $10" is money.
    if (c === '$' && s[i + 1] !== '$' && s[i + 1] !== undefined && !/\s/.test(s[i + 1])) {
      const end = s.indexOf('$', i + 1)
      if (end > i + 1 && !/\s/.test(s[end - 1]) && !/\d/.test(s[end + 1] ?? '') && !s.slice(i + 1, end).includes('\n')) {
        flush()
        out.push({ t: 'math', v: s.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }

    // Link: [text](https://…)
    if (c === '[') {
      const close = s.indexOf('](', i + 1)
      if (close > 0 && !s.slice(i + 1, close).includes('\n')) {
        const end = s.indexOf(')', close + 2)
        if (end > 0) {
          const href = safeHref(s.slice(close + 2, end).trim().split(/\s+"/)[0])
          if (href) {
            flush()
            out.push({ t: 'link', href, c: parseInline(s.slice(i + 1, close)) })
            i = end + 1
            continue
          }
        }
      }
    }

    // Bare URL.
    if ((c === 'h' || c === 'H') && /^https?:\/\//i.test(s.slice(i, i + 8)) && !isWordChar(s[i - 1])) {
      const m = /^https?:\/\/[^\s<>"]+/i.exec(s.slice(i))
      if (m) {
        const url = m[0].replace(/[.,;:!?)\]]+$/, '')
        const href = safeHref(url)
        if (href) {
          flush()
          out.push({ t: 'link', href, c: [{ t: 'text', v: url }] })
          i += url.length
          continue
        }
      }
    }

    // Strikethrough, bold, italic.
    for (const [marker, kind] of EMPHASIS) {
      if (!s.startsWith(marker, i)) continue
      // `_` is emphasis only at word edges: snake_case_name stays text.
      if (marker[0] === '_' && isWordChar(s[i - 1])) continue
      // An opener is followed by non-space; "* " is a bullet or a star.
      if (/\s/.test(s[i + marker.length] ?? ' ')) continue
      const end = findClose(s, marker, i + marker.length)
      if (end < 0 || end === i + marker.length || /\s/.test(s[end - 1])) continue
      if (marker[0] === '_' && isWordChar(s[end + marker.length])) continue
      flush()
      out.push({ t: kind, c: parseInline(s.slice(i + marker.length, end)) })
      i = end + marker.length
      continue scan
    }

    buf += c
    i++
  }
  flush()
  return out
}

// ── Blocks ─────────────────────────────────────────────────────────────────

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^\n]*$/
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const HR_RE = /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/
const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/
const DISPLAY_MATH_RE = /^\s*\$\$?([^$\n]+?)\$?\$\s*$/

const indentOf = (line: string) => line.match(/^(\s*)/)![1].replace(/\t/g, '    ').length

function splitRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') {
      cur += '|'
      i++
    } else if (t[i] === '|') {
      cells.push(cur.trim())
      cur = ''
    } else cur += t[i]
  }
  cells.push(cur.trim())
  return cells
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  const startsBlock = (line: string, next?: string) =>
    FENCE_RE.test(line) || HEADING_RE.test(line) || HR_RE.test(line) || QUOTE_RE.test(line) || LIST_RE.test(line) || (line.includes('|') && next !== undefined && TABLE_SEP_RE.test(next) && next.includes('-'))

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i++
      continue
    }

    // Fenced code. Runs to the closing fence, or to the end of the text while the
    // reply is still streaming.
    const fence = FENCE_RE.exec(line)
    if (fence) {
      const marker = fence[1]
      const body: string[] = []
      i++
      let open = true
      while (i < lines.length) {
        if (new RegExp(`^\\s{0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[i])) {
          open = false
          i++
          break
        }
        body.push(lines[i])
        i++
      }
      blocks.push({ t: 'code', lang: fence[2], v: body.join('\n'), open })
      continue
    }

    const h = HEADING_RE.exec(line)
    if (h) {
      blocks.push({ t: 'h', level: h[1].length as 1 | 2 | 3 | 4 | 5 | 6, c: parseInline(h[2]) })
      i++
      continue
    }

    if (HR_RE.test(line)) {
      blocks.push({ t: 'hr' })
      i++
      continue
    }

    // A line that is only a $display$ equation.
    const dm = DISPLAY_MATH_RE.exec(line)
    if (dm && line.trim().startsWith('$') && !/\s\$/.test(line.trim().slice(1, -1) + ' ')) {
      blocks.push({ t: 'math', v: dm[1].trim() })
      i++
      continue
    }

    if (QUOTE_RE.test(line)) {
      const inner: string[] = []
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        inner.push(QUOTE_RE.exec(lines[i])![1])
        i++
      }
      blocks.push({ t: 'quote', c: parseMarkdown(inner.join('\n')) })
      continue
    }

    // Table: a header row, then a |---|---| separator.
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = splitRow(line)
      const align = splitRow(lines[i + 1]).map((c) =>
        /^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : null
      ) as ('left' | 'right' | 'center' | null)[]
      i += 2
      const rows: Inline[][][] = []
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        const cells = splitRow(lines[i])
        rows.push(head.map((_, k) => parseInline(cells[k] ?? '')))
        i++
      }
      blocks.push({ t: 'table', head: head.map(parseInline), align, rows })
      continue
    }

    if (LIST_RE.test(line)) {
      const items: { indent: number; ordered: boolean; start: number; text: string }[] = []
      while (i < lines.length) {
        const m = LIST_RE.exec(lines[i])
        if (m) {
          const ordered = /\d/.test(m[2])
          items.push({ indent: indentOf(m[1]), ordered, start: ordered ? parseInt(m[2], 10) : 1, text: m[3] })
          i++
        } else if (lines[i].trim() && items.length && indentOf(lines[i]) > items.at(-1)!.indent && !startsBlock(lines[i], lines[i + 1])) {
          // A wrapped continuation line belongs to the item above.
          items.at(-1)!.text += `\n${lines[i].trim()}`
          i++
        } else break
      }
      blocks.push(buildList(items))
      continue
    }

    // Paragraph: runs until a blank line or the start of another block.
    const para: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) {
      para.push(lines[i])
      i++
    }
    blocks.push({ t: 'p', c: parseLines(para) })
  }
  return blocks
}

/** Lines of one paragraph, with the line breaks kept: replies lean on them (a
 *  poem, an address, a short list written without bullets). */
function parseLines(lines: string[]): Inline[] {
  const out: Inline[] = []
  lines.forEach((l, k) => {
    if (k > 0) out.push({ t: 'br' })
    out.push(...parseInline(l.replace(/\s+$/, '').replace(/^\s+/, '')))
  })
  return out
}

function buildList(items: { indent: number; ordered: boolean; start: number; text: string }[]): Block {
  // Root list at the shallowest indent; deeper items nest under the item above.
  const base = Math.min(...items.map((x) => x.indent))
  const root: Extract<Block, { t: 'list' }> = { t: 'list', ordered: items[0].ordered, start: items[0].start, items: [] }
  const stack: { indent: number; list: typeof root }[] = [{ indent: base, list: root }]
  for (const it of items) {
    while (stack.length > 1 && it.indent < stack.at(-1)!.indent) stack.pop()
    let top = stack.at(-1)!
    if (it.indent > top.indent && top.list.items.length) {
      const parent = top.list.items.at(-1)!
      const nested: typeof root = { t: 'list', ordered: it.ordered, start: it.start, items: [] }
      parent.children.push(nested)
      stack.push({ indent: it.indent, list: nested })
      top = stack.at(-1)!
    }
    top.list.items.push({ c: parseLines(it.text.split('\n')), children: [] })
  }
  return root
}
