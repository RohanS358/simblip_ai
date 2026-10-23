// The API routes under app/api/ai are written for Next.js (the host app). This
// repo does not install the framework; it only needs the one call they make.
declare module 'next/server' {
  export const NextResponse: {
    json(body: unknown, init?: { status?: number; headers?: HeadersInit }): Response
  }
}
