// JSON Schema → GBNF (llama.cpp grammar), so a small model's tool call is
// valid BY CONSTRUCTION (decision D7). A 1–2B model fails at syntax before it
// fails at semantics — a missing brace, a string where a number goes — and each
// failure costs a repair round on a slow CPU. With the grammar active the
// sampler can only emit tokens that keep the output schema-valid.
//
// Covers what the tool registry produces (zod-to-json-schema): object with
// required + optional properties, string, number, integer, boolean, enum/const,
// array, nullable/anyOf, and free-form values. Anything it cannot express
// becomes the permissive `value` rule rather than an error — a looser grammar
// is still safe, because the registry validates arguments again with zod.
//
// Pure and synchronous; no dependency on the engine.

interface Schema {
  type?: string | string[]
  properties?: Record<string, Schema>
  required?: string[]
  items?: Schema
  enum?: unknown[]
  const?: unknown
  anyOf?: Schema[]
  oneOf?: Schema[]
  minItems?: number
}

/** Shared lexical rules (same shapes as llama.cpp's json.gbnf). `ws` is
 *  bounded: an unbounded `ws*` lets a model spend its whole budget on spaces. */
export const PRELUDE = String.raw`ws ::= | " " | "\n" [ \t]{0,20}
string ::= "\"" ([^"\\\x7F\x00-\x1F] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F]{4}))* "\"" ws
number ::= ("-"? ([0-9] | [1-9] [0-9]{0,15})) ("." [0-9]{1,16})? ([eE] [-+]? [0-9]{1,5})? ws
integer ::= ("-"? ([0-9] | [1-9] [0-9]{0,15})) ws
boolean ::= ("true" | "false") ws
null ::= "null" ws
value ::= object | array | string | number | boolean | null
object ::= "{" ws (string ":" ws value ("," ws string ":" ws value)*)? "}" ws
array ::= "[" ws (value ("," ws value)*)? "]" ws`

/** A GBNF string literal that matches the text `s` exactly. */
const lit = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'
/** A literal matching the JSON encoding of `v` (so keys/enums include quotes). */
const json = (v: unknown) => lit(JSON.stringify(v))
const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'r'

/** Rules for one schema. Rule names are prefixed with `ns` so grammars for
 *  several tools can share one file without colliding. */
function build(schema: unknown, ns: string): { root: string; rules: Map<string, string> } {
  const rules = new Map<string, string>()

  const add = (hint: string, body: string): string => {
    const base = ns + slug(hint)
    let name = base
    for (let i = 1; rules.has(name) && rules.get(name) !== body; i++) name = `${base}-${i}`
    rules.set(name, body)
    return name
  }

  /** A fresh rule name, body filled in later (an object's tails refer to it). */
  const reserve = (hint: string): string => {
    const base = ns + slug(hint)
    let name = base
    for (let i = 1; rules.has(name); i++) name = `${base}-${i}`
    rules.set(name, '')
    return name
  }

  const emit = (s: Schema | undefined, hint: string): string => {
    if (!s || typeof s !== 'object') return 'value'
    if (s.const !== undefined) return add(hint, `${json(s.const)} ws`)
    if (s.enum?.length) return add(hint, `(${s.enum.map(json).join(' | ')}) ws`)

    const alts = s.anyOf ?? s.oneOf
    if (alts?.length) return add(hint, alts.map((a, i) => emit(a, `${hint}-${i}`)).join(' | '))

    const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : []
    if (types.length > 1) return add(hint, types.map((t) => emit({ ...s, type: t }, `${hint}-${t}`)).join(' | '))

    switch (types[0]) {
      // Length limits are NOT put in the grammar: bounded repetition with large
      // limits makes llama.cpp's grammar compiler explode. zod enforces them.
      case 'string':
        return 'string'
      case 'number':
        return 'number'
      case 'integer':
        return 'integer'
      case 'boolean':
        return 'boolean'
      case 'null':
        return 'null'
      case 'array': {
        const item = emit(s.items, `${hint}-item`)
        const more = `("," ws ${item})*`
        return add(`${hint}-arr`, s.minItems && s.minItems > 0 ? `"[" ws ${item} ${more} "]" ws` : `"[" ws (${item} ${more})? "]" ws`)
      }
      default: {
        if (!s.properties) return types[0] === 'object' ? 'object' : 'value'
        const req = new Set(s.required ?? [])
        const kv = (k: string, v: Schema) => `${json(k)} ":" ws ${emit(v, `${hint}-${k}`)}`
        const entries = Object.entries(s.properties)
        const required = entries.filter(([k]) => req.has(k)).map(([k, v]) => kv(k, v))
        const optional = entries.filter(([k]) => !req.has(k)).map(([k, v]) => kv(k, v))

        // tail(i): any subset of optional[i..] in order, each preceded by a comma.
        //   tail_i ::= "," ws O_i tail_{i+1} | tail_{i+1}      (last: … | "")
        const name = reserve(`${hint}-obj`)
        const tail = (i: number): string => {
          if (i >= optional.length) return ''
          const t = `${name}-t${i}`
          const next = tail(i + 1)
          rules.set(t, next ? `"," ws ${optional[i]} ${next} | ${next}` : `"," ws ${optional[i]} | ""`)
          return t
        }
        let inner = ''
        if (required.length) {
          inner = required.join(' "," ws ') + (optional.length ? ' ' + tail(0) : '')
        } else if (optional.length) {
          // No required key: the FIRST emitted key has no leading comma.
          //   (O_0 tail_1 | O_1 tail_2 | … | empty)
          const alts = optional.map((o, i) => (i + 1 < optional.length ? `${o} ${tail(i + 1)}` : o))
          inner = `(${alts.join(' | ')})?`
        }
        rules.set(name, `"{" ws ${inner ? inner + ' ' : ''}"}" ws`)
        return name
      }
    }
  }

  const root = emit(schema as Schema, 'root')
  return { root, rules }
}

/** `root ::= …` for one schema. */
export function schemaToGbnf(schema: unknown): string {
  const { root, rules } = build(schema, '')
  const lines = [`root ::= ${root}`, ...[...rules].map(([n, b]) => `${n} ::= ${b}`)]
  return lines.join('\n') + '\n' + PRELUDE
}

/** Grammar for "call exactly one of these tools":
 *    {"tool": "<name>", "args": { …that tool's schema… }}
 *  What the on-device lane constrains the model to. */
export function toolCallGbnf(specs: readonly { name: string; inputSchema: unknown }[]): string {
  if (!specs.length) throw new Error('toolCallGbnf needs at least one tool')
  const alts: string[] = []
  const lines: string[] = []
  specs.forEach((t, i) => {
    const { root, rules } = build(t.inputSchema, `t${i}-`)
    for (const [n, b] of rules) lines.push(`${n} ::= ${b}`)
    alts.push(`"{" ws ${json('tool')} ":" ws ${json(t.name)} ws "," ws ${json('args')} ":" ws ${root} "}" ws`)
  })
  return [`root ::= ${alts.map((a) => `(${a})`).join(' | ')}`, ...lines, PRELUDE].join('\n')
}

/** Rule names defined and referenced in a grammar — used by tests (and handy
 *  when debugging a grammar llama.cpp rejects). */
export function grammarRules(g: string): { defined: Set<string>; referenced: Set<string> } {
  const defined = new Set<string>()
  const referenced = new Set<string>()
  for (const line of g.split('\n')) {
    const m = /^([a-z][a-z0-9-]*) ::= (.*)$/.exec(line)
    if (!m) continue
    defined.add(m[1])
    // Strip literals and character classes, then read the identifiers left.
    const rhs = m[2].replace(/"(?:[^"\\]|\\.)*"/g, ' ').replace(/\[(?:[^\]\\]|\\.)*\]/g, ' ')
    for (const id of rhs.match(/[a-z][a-z0-9-]*/g) ?? []) referenced.add(id)
  }
  return { defined, referenced }
}
