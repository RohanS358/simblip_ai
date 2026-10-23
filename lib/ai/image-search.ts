// Real pictures for "show me a gorilla": Wikimedia Commons.
//
// Why Commons and not Google Images: Google has no public image-search API for
// this and scraping it breaks its terms; results also carry no licence, so a
// student could not know whether a picture is safe to put in coursework.
// Commons is an open, keyless API where EVERY file has a licence and an author,
// which is shown under the picture.
//
// Pure parsing + one fetch function. Runs on the server (the /api/images route
// and the hosted /api/ai lane): Wikimedia asks API clients to identify
// themselves with a User-Agent, which a browser cannot set.

export interface ImageHit {
  /** A 1000 px rendition of a high-resolution original. */
  src: string
  alt: string
  /** The file's page on Commons (licence text, full resolution, history). */
  href: string
  /** "Author · CC BY-SA 4.0" */
  credit: string
  /** width / height of the thumbnail, when Commons reported it. */
  ratio?: number
}

/** How many pictures a request shows. Always four: a 2×2 grid. */
export const IMAGES_SHOWN = 4

/** "High resolution" means the ORIGINAL file, not the thumbnail we show:
 *  the longer side is at least 1200 px and the shorter at least 700 px, so
 *  it stays sharp when placed on a page or a slide. Vector drawings (SVG)
 *  have no pixel size and are sharp at any scale, so they always qualify. */
export const MIN_LONG_SIDE = 1200
export const MIN_SHORT_SIDE = 700

export function isHighRes(width?: number, height?: number, mime?: string): boolean {
  if (mime === 'image/svg+xml') return true
  if (!width || !height) return false
  return Math.max(width, height) >= MIN_LONG_SIDE && Math.min(width, height) >= MIN_SHORT_SIDE
}

export type ImageWant = 'photo' | 'diagram'

const API = 'https://commons.wikimedia.org/w/api.php'
/** Only these hosts are ever shown or fetched — a response cannot point the
 *  panel at an arbitrary server. */
const ALLOWED_HOSTS = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org'])

export const commonsUrl = (query: string, want: ImageWant, limit = 40): string => {
  // bitmap = photographs; drawing = SVG diagrams and illustrations.
  const type = want === 'diagram' ? 'drawing' : 'bitmap'
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${query} filetype:${type}`,
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime|size',
    iiurlwidth: '1000',
    iiextmetadatafilter: 'LicenseShortName|Artist',
  })
  return `${API}?${p}`
}

const text = (html: unknown): string =>
  String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Commons titles look like "File:Mountain gorilla (…) yawn.jpg". */
const titleToAlt = (t: string): string => t.replace(/^File:/i, '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').trim().slice(0, 140)

interface CommonsPage {
  title?: string
  index?: number
  imageinfo?: { thumburl?: string; thumbwidth?: number; thumbheight?: number; width?: number; height?: number; descriptionurl?: string; mime?: string; extmetadata?: Record<string, { value?: unknown }> }[]
}

/** Turn a Commons API response into safe, ordered hits. Never throws. */
export function parseCommons(json: unknown, max = 30): ImageHit[] {
  const pages = (json as { query?: { pages?: Record<string, CommonsPage> } })?.query?.pages
  if (!pages || typeof pages !== 'object') return []
  const out: ImageHit[] = []
  for (const p of Object.values(pages).sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0))) {
    const i = p && typeof p === 'object' ? p.imageinfo?.[0] : undefined
    if (!i?.thumburl || !i.descriptionurl) continue
    // Low-resolution originals are dropped here, so nothing downstream can show one.
    if (!isHighRes(i.width, i.height, i.mime)) continue
    let host = ''
    try {
      const u = new URL(i.thumburl)
      if (u.protocol !== 'https:') continue
      host = u.hostname
    } catch {
      continue
    }
    if (!ALLOWED_HOSTS.has(host)) continue
    if (!/^https:\/\/commons\.wikimedia\.org\//.test(i.descriptionurl)) continue
    const artist = text(i.extmetadata?.Artist?.value)
    const licence = text(i.extmetadata?.LicenseShortName?.value)
    out.push({
      src: i.thumburl,
      alt: titleToAlt(p?.title ?? 'image'),
      href: i.descriptionurl,
      credit: [artist.slice(0, 60), licence].filter(Boolean).join(' · ') || 'Wikimedia Commons',
      ...(i.thumbwidth && i.thumbheight ? { ratio: +(i.thumbwidth / i.thumbheight).toFixed(2) } : {}),
    })
    if (out.length >= max) break
  }
  return out
}

/** Search Commons. Rejects on network failure so callers can fall back. */
export async function searchCommons(query: string, want: ImageWant, signal?: AbortSignal): Promise<ImageHit[]> {
  const q = query.trim().slice(0, 80)
  if (q.length < 2) return []
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 6000)
  const onAbort = () => ctl.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const res = await fetch(commonsUrl(q, want), {
      headers: { 'User-Agent': 'SIMBLIP/1.0 (educational engineering notebook)', Accept: 'application/json' },
      signal: ctl.signal,
    })
    if (!res.ok) throw new Error(`image search ${res.status}`)
    return parseCommons(await res.json())
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

// ── Which four ──────────────────────────────────────────────────────────────

/** "Mountain gorilla female 2" and "Mountain gorilla female 3" are one photo
 *  shoot: two of them in a grid look like a mistake. */
const stem = (alt: string) =>
  alt
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[^a-z ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(' ')

const author = (credit: string) => credit.split(' · ')[0].toLowerCase()

/** Pick the best four from relevance-ordered, already high-resolution
 *  candidates, preferring variety:
 *  - the top result always leads (Commons already ranked it);
 *  - first pass: well-shaped pictures only (no banners or tall strips, which
 *    crop badly), no two shots of one shoot, and no author filling the grid;
 *  - later passes relax shape, then variety, so four are shown whenever four
 *    exist. Fewer than four are returned only when fewer exist — never padded
 *    with low-resolution pictures. */
export function selectImages<T extends ImageHit>(hits: readonly T[], count = IMAGES_SHOWN): T[] {
  const shapely = (h: T) => h.ratio === undefined || (h.ratio >= 0.6 && h.ratio <= 2.0)
  const chosen: T[] = []
  const stems = new Set<string>()
  const byAuthor = new Map<string, number>()
  const take = (h: T) => {
    chosen.push(h)
    stems.add(stem(h.alt))
    byAuthor.set(author(h.credit), (byAuthor.get(author(h.credit)) ?? 0) + 1)
  }

  for (const h of hits) {
    if (chosen.length >= count) break
    if (shapely(h) && !stems.has(stem(h.alt)) && (byAuthor.get(author(h.credit)) ?? 0) < 2) take(h)
  }
  for (const h of hits) {
    if (chosen.length >= count) break
    if (!chosen.includes(h) && shapely(h)) take(h)
  }
  for (const h of hits) {
    if (chosen.length >= count) break
    if (!chosen.includes(h)) take(h)
  }
  return chosen
}
