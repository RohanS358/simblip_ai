// Watch the verifier work on a deliberately wrong "model output", with no model and no GPU:
//
//   npm run show:verifier
//
// The script below contains the real mistakes small models make: wrong property names (.voltage), a made-up component
// kind, a variable named after a keyword, and a connect() with no terminal. The autofix pass repairs the ones that have
// exactly one legal answer; the linter turns the rest into REPAIR INSTRUCTIONS, which is what the model is shown on its retry.
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const dir = mkdtempSync(join(tmpdir(), 'show-verifier-'))
const build = (name) => {
  const out = join(dir, `${name}.mjs`)
  execFileSync('npx', ['esbuild', join(root, `lib/ai/${name}.ts`), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, `--alias:@=${root}`], { stdio: 'pipe', cwd: root })
  return import(out)
}
const { autofixSimScript } = await build('simscript-fix')
const { lintSimScript } = await build('simscript-lint')

const modelOutput = `var battery = create("battery", { V: 9 });
var r1 = create("resistor", { R: 100 });
var cap = create("cap", { C: 0.001 });
var wow = create("flux-capacitor", {});
connect(battery.positive, r1.a);
connect(r1.b, cap);
graph.plot(r1.voltage);`

const show = (title, lines) => console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 70 - title.length))}\n${lines}`)
show('1. what the model wrote', modelOutput)

const before = lintSimScript(modelOutput)
show(`2. linter on the raw output: ${before.errors.length} error(s)`, before.errors.map((e) => '  • ' + e).join('\n'))

const fixed = autofixSimScript(modelOutput)
show(`3. after the deterministic autofix (${fixed.notes.length} mechanical fix(es), zero model rounds)`, fixed.code)

const after = lintSimScript(fixed.code)
show(`4. linter on the repaired script: ${after.errors.length} error(s) left, shown to the model as repair instructions`, after.errors.map((e) => '  • ' + e).join('\n'))
console.log('\nOnly a script with no errors reaches the interpreter. This whole loop costs microseconds; each model repair round costs ~2 s of GPU.\n')
