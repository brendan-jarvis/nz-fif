// M0 stub. The entire server side of nz-fif lives in this file.
// It serves only GET /api/price and returns 404 for everything else.
export default {
  async fetch(): Promise<Response> {
    return new Response('Not found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      },
    });
  },
} satisfies ExportedHandler;
