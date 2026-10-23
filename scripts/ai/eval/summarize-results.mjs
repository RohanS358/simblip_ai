// Recompute the headline numbers from the committed score files, so nothing in the README has to be taken on trust.
//
//   npm run results
//
// "pass-all" is the gate used everywhere in this repo (same as score-jsonl.mjs): the script lints and runs
// (valid), the simulation is stable (function >= 0.9), it looks right (>= 0.8) and it teaches (>= 0.7).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const rows = []
for (const dir of ['results/novel-prompts', 'results/heldout']) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.scored.json'))) {
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    const n = r.length
    const valid = r.filter((x) => x.valid === 1).length
    const all = r.filter((x) => x.valid === 1 && x.f >= 0.9 && x.looks >= 0.8 && x.teaches >= 0.7).length
    const mean = r.reduce((a, x) => a + x.total, 0) / n
    rows.push({ file: join(dir, f), n, valid, all, mean })
  }
}
const pct = (a, n) => `${Math.round((100 * a) / n)}%`
console.log('file'.padEnd(66), 'n'.padStart(3), 'valid'.padStart(12), 'pass-all'.padStart(12), 'mean')
for (const r of rows)
  console.log(r.file.padEnd(66), String(r.n).padStart(3), `${r.valid} (${pct(r.valid, r.n)})`.padStart(12), `${r.all} (${pct(r.all, r.n)})`.padStart(12), r.mean.toFixed(1))

const t = JSON.parse(readFileSync('results/heldout/tool-choice-v4.json', 'utf8'))
console.log(`\ntool calling (${t.n} held-out prompts): schema-valid ${pct(t.schema_valid * t.n, t.n)}, correct tool ${pct(t.tool_correct * t.n, t.n)}, correct arguments ${pct(t.args_correct * t.n, t.n)}`)
