// Reading the words in a photo, on this device.
//
// One tesseract worker is created on first use and REUSED: starting one costs a
// ~4 MB WebAssembly core plus the language data, and a student who attaches
// three photos should pay that once, not three times. It is shut down after a
// minute idle so a finished session does not keep ~100 MB resident.
//
// Everything is served from our own origin (scripts/copy-tesseract.mjs puts it
// under /vendor/tesseract): the CDN defaults are blocked by the app's
// Content-Security-Policy, which is what made "attach a photo" fail with
// "Failed to fetch". Nothing about a photo leaves the device.

const IDLE_MS = 60_000
/** Longer sides are scaled down first. Recognition cost grows with pixels, and
 *  text in a phone photo is legible at 2000 px; a 12 MP original only makes
 *  the wait longer (and the page heavier). */
export const MAX_SIDE = 2000

/** The size to scale (w, h) to so the longer side is at most `max`; never up. */
export function fitWithin(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h, 1))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

/** What the student reads when a photo cannot be read. Technical detail goes to
 *  the console; the message says what happened and what to do next. */
export const PHOTO_UNREADABLE =
  'I couldn’t read the words in this photo just now. You can still send it — tell me what it shows in your question and I’ll help from there.'
export const PHOTO_NO_TEXT =
  'There are no words I can read in this photo. I only read text in pictures, so tell me what it shows in your question and I’ll help from there.'

interface OcrWorker {
  recognize(image: Blob | File): Promise<{ data: { text?: string } }>
  terminate(): Promise<unknown>
}

let worker: Promise<OcrWorker> | null = null
let idle: ReturnType<typeof setTimeout> | undefined
/** The logger is fixed when a worker is created, so progress for the CURRENT
 *  photo is routed through this. */
let onStatus: ((status: string, progress: number) => void) | undefined

async function start(): Promise<OcrWorker> {
  const mod = (await import('tesseract.js')) as unknown as {
    createWorker?: (...a: unknown[]) => Promise<OcrWorker>
    default?: { createWorker?: (...a: unknown[]) => Promise<OcrWorker> }
  }
  const createWorker = mod.createWorker ?? mod.default?.createWorker
  if (!createWorker) throw new Error('the OCR library failed to load')
  // A blob: worker cannot resolve relative URLs, so these must be absolute.
  const base = `${location.origin}/vendor/tesseract`
  return createWorker('eng', 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    langPath: `${base}/lang`,
    gzip: true,
    // Local files are already HTTP-cached; do not store a second copy in IndexedDB.
    cacheMethod: 'none',
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status) onStatus?.(m.status, m.progress ?? 0)
    },
    // Without a handler tesseract THROWS inside its worker's onmessage when a
    // job fails, which escapes every try/catch and pops the framework's
    // full-screen error overlay. The failure still rejects the awaited call.
    errorHandler: (e: unknown) => console.warn('[ocr]', e),
  })
}

function shutdown() {
  const w = worker
  worker = null
  clearTimeout(idle)
  void w?.then((x) => x.terminate()).catch(() => {})
}

async function downscale(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
  let bmp: ImageBitmap | undefined
  try {
    bmp = await createImageBitmap(file)
    const { w, h } = fitWithin(bmp.width, bmp.height)
    if (w === bmp.width && h === bmp.height) return file
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bmp, 0, 0, w, h)
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/png'))
  } catch {
    return file
  } finally {
    bmp?.close()
  }
}

/** A real browser page: it has an origin that can serve /vendor/tesseract and a canvas. */
const inBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined' && typeof location !== 'undefined'

type Recognize = (
  image: File | string,
  langs: string,
  options: { logger: (m: { status?: string; progress?: number }) => void }
) => Promise<{ data: { text?: string } }>

/** The library's own defaults (CDN assets, one-shot worker). Used only where the
 *  self-hosted path cannot run — see readPhoto. */
async function readPhotoDefault(file: File, progress?: (status: string, p: number) => void): Promise<string> {
  // tesseract.js is CommonJS: depending on the bundler's interop the named export can
  // come back undefined and only `default` carries the API.
  const mod = (await import('tesseract.js')) as unknown as { recognize?: Recognize; default?: { recognize?: Recognize } }
  const recognize = mod.recognize ?? mod.default?.recognize
  if (!recognize) throw new Error('the OCR library failed to load')
  const { data } = await recognize(file, 'eng', { logger: (m) => m.status && progress?.(m.status, m.progress ?? 0) })
  return (data.text ?? '').replace(/\s+\n/g, '\n').trim()
}

/** Read the text in a photo. Throws on failure; the caller words it for the
 *  student. `progress` reports tesseract's own phases ("loading language
 *  traineddata", "recognizing text"). */
export async function readPhoto(file: File, progress?: (status: string, p: number) => void): Promise<string> {
  // Outside a browser (Node tests, scripts, a server) there is no origin serving our
  // copy of the reader's files and no canvas: use tesseract.js's own defaults.
  if (!inBrowser()) return readPhotoDefault(file, progress)
  clearTimeout(idle)
  onStatus = progress
  try {
    worker ??= start()
    const w = await worker
    const { data } = await w.recognize(await downscale(file))
    return (data.text ?? '').replace(/\s+\n/g, '\n').trim()
  } catch (e) {
    // A worker that failed to start or died must not be reused.
    shutdown()
    throw e
  } finally {
    onStatus = undefined
    if (worker) idle = setTimeout(shutdown, IDLE_MS)
  }
}

/** Create a small preview for the attachment chip: ≤ 96 px, JPEG. A few KB, so
 *  keeping it in the saved thread is cheap. Returns undefined when it cannot be
 *  made — the chip simply has no picture. */
export async function makeThumb(file: File, side = 96): Promise<string | undefined> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return undefined
  let bmp: ImageBitmap | undefined
  try {
    bmp = await createImageBitmap(file)
    const { w, h } = fitWithin(bmp.width, bmp.height, side)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.6)
  } catch {
    return undefined
  } finally {
    bmp?.close()
  }
}
