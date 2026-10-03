// M0 "prove the headers" without deploying: build for a localhost origin,
// start `wrangler dev` (local workerd, no Cloudflare login), and assert the
// live response headers. Usage: pnpm headers:local
import { spawn, execSync } from 'node:child_process';
import { report, runHeaderChecks } from './header-checks';

const port = Number(process.env.PORT ?? 8799);
const origin = `http://localhost:${port}`;

execSync('pnpm build', { stdio: 'inherit', env: { ...process.env, SITE_ORIGIN: origin } });
const child = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(port), '--ip', '127.0.0.1', '--show-interactive-dev-session=false'], {
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));

async function waitReady(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${origin}/`);
      if (r.status === 200) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler dev did not start:\n${log}`);
}

let ok = false;
try {
  await waitReady();
  ok = report(await runHeaderChecks(origin));
} finally {
  child.kill('SIGTERM');
}
process.exit(ok ? 0 : 1);
