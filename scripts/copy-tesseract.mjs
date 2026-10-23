// The photo reader (tesseract.js) needs three kinds of file at runtime: its
// worker script, a WebAssembly core, and the English language data. By default
// it downloads all three from a CDN on the first photo — which the app's
// Content-Security-Policy (connect-src, proxy.ts) rightly does not allow, so
// attaching a photo failed with "Failed to fetch". Serving them from our own
// origin fixes that, and also means the reader works offline and nothing about
// a student's photo ever touches a third party.
//
// Copied rather than committed: ~13 MB of binary the lockfile already pins.
// Only the LSTM cores are copied (the default engine); tesseract picks the
// fastest one the browser supports.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
]
const out = 'public/vendor/tesseract'

const missing = files.filter(([src]) => !existsSync(src))
if (missing.length) {
  console.warn(`copy-tesseract: not installed (${missing[0][0]}) — skipping; photo reading will say it is unavailable`)
  process.exit(0)
}
for (const [src, dest] of files) {
  const to = join(out, dest)
  mkdirSync(join(to, '..'), { recursive: true })
  copyFileSync(src, to)
}
console.log(`copy-tesseract: ${files.length} files -> ${out}`)
