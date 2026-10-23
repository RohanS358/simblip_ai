// Runtime stand-in for `next/server`. The /api/ai routes make exactly one call into the framework,
// NextResponse.json(); this repository does not install Next.js (see types/next-server.d.ts for the
// matching type shim), so tests that bundle the routes alias `next/server` to this file.
export const NextResponse = {
  json(body, init = {}) {
    const headers = new Headers(init.headers)
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    return new Response(JSON.stringify(body), { ...init, headers })
  },
}
