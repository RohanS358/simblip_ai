import { NextResponse } from 'next/server'
import { searchCommons, type ImageWant } from '@/lib/ai/image-search'

// GET /api/images?q=gorilla&want=photo|diagram
//
// A thin, rate-limited proxy to Wikimedia Commons. It exists because Wikimedia
// asks API clients to send a descriptive User-Agent (a browser cannot), and so
// the browser never needs to be allowed to talk to Commons directly. The host
// is fixed in lib/ai/image-search.ts — nothing in the request can redirect it.

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20
const hits = new Map<string, { n: number; reset: number }>()

function limited(ip: string): boolean {
  const now = Date.now()
  const r = hits.get(ip)
  if (!r || now > r.reset) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS })
    if (hits.size > 2000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k)
    return false
  }
  return ++r.n > MAX_PER_WINDOW
}

export async function GET(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
  if (limited(ip)) return NextResponse.json({ error: 'Too many image searches. Try again in a minute.' }, { status: 429 })

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 2 || q.length > 80) return NextResponse.json({ error: 'Give a short search phrase.' }, { status: 400 })
  const want: ImageWant = url.searchParams.get('want') === 'diagram' ? 'diagram' : 'photo'

  try {
    const images = await searchCommons(q, want, req.signal)
    // Results for a phrase do not change by the minute; let the CDN keep them.
    return NextResponse.json({ images }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })
  } catch {
    return NextResponse.json({ error: 'Image search is unavailable right now.' }, { status: 502 })
  }
}
