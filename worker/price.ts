// Entry point of the entire server side of nz-fif: GET /api/price?symbol=X&date=YYYY-MM-DD.
// Only the default export is allowed here (the Workers runtime rejects other
// named exports); the logic and its tests live in worker/lib.ts.
import { handle, type Env } from './lib';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, env, { fetch: (i, init) => fetch(i, init), cache: (caches as unknown as { default: Cache }).default, now: () => new Date() });
  },
};
