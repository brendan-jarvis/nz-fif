import { defineConfig, devices } from '@playwright/test';

// E2E privacy tests run against `wrangler dev` (local workerd, no login), so
// the real _headers CSP is enforced. /api/price is intercepted in the browser
// with recorded fixtures; nothing ever reaches Yahoo.
const PORT = 8788;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `SITE_ORIGIN=http://localhost:${PORT} bun run build && WRANGLER_SEND_METRICS=false bunx wrangler dev --local --port ${PORT} --ip 127.0.0.1 --show-interactive-dev-session=false`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
