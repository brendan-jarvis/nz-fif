// bun run verify-deploy <https://site.example> [build-manifest.json]
// Compares every deployed static asset with the tagged build manifest and
// checks the live security headers. Read-only GET requests only.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { report, runHeaderChecks } from './header-checks';

const origin = (process.argv[2] ?? '').replace(/\/$/, '');
if (!/^https:\/\/[a-z0-9.-]+$/.test(origin)) {
  console.error('usage: bun run verify-deploy https://<host> [build-manifest.json]');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(process.argv[3] ?? 'build-manifest.json', 'utf8')) as { commit: string; assets: Record<string, string> };

let mismatches = 0;
for (const [path, expected] of Object.entries(manifest.assets)) {
  if (path === '_headers') continue; // not served; its effect is checked via live headers
  const urlPath = path === 'index.html' ? '/' : `/${path}`;
  const res = await fetch(`${origin}${urlPath}`, { redirect: 'manual' });
  const got = createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex');
  const ok = res.status === 200 && got === expected;
  if (!ok) mismatches++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${urlPath}${ok ? '' : `  status ${res.status} sha ${got.slice(0, 12)} != ${expected.slice(0, 12)}`}`);
}
const headersOk = report(await runHeaderChecks(origin));
console.log(`commit ${manifest.commit}: ${mismatches} asset mismatch(es)`);
process.exit(mismatches === 0 && headersOk ? 0 : 1);
