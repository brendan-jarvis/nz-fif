// Writes build-manifest.json: SHA-256 of every static asset plus the bundled
// Worker script, with commit and tag. CI attaches it to the release and
// scripts/verify-deploy.ts compares a live site against it.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { build } from 'esbuild';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const git = (cmd: string) => {
  try { return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; }
};

const assets: Record<string, string> = {};
for (const f of walk('dist').sort()) {
  const rel = relative('dist', f).split('\\').join('/');
  if (rel === 'build-manifest.json') continue;
  assets[rel] = sha(readFileSync(f));
}

// Bundle the Worker the same way for hashing (esbuild, ESM). Wrangler's
// deploy bundle is produced in CI; see DECISIONS.md (2026-10-04, manifest).
await build({
  entryPoints: ['worker/price.ts'], bundle: true, format: 'esm', platform: 'neutral',
  target: 'es2022', outfile: 'dist-worker/price.js', legalComments: 'none', logLevel: 'silent',
});
const workerHash = sha(readFileSync('dist-worker/price.js'));

const commit = git('rev-parse HEAD');
const manifest = {
  name: 'nz-fif',
  commit,
  tag: git('describe --tags --exact-match'),
  dirty: (git('status --porcelain') ?? '') !== '',
  sourceDateEpoch: process.env.SOURCE_DATE_EPOCH ?? git('log -1 --format=%ct'),
  worker: { entry: 'worker/price.ts', bundle: 'dist-worker/price.js', sha256: workerHash },
  assets,
};
writeFileSync('build-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
copyFileSync('build-manifest.json', 'dist/build-manifest.json');
console.log(`build-manifest.json: ${Object.keys(assets).length} assets, worker ${workerHash.slice(0, 12)}…, commit ${commit?.slice(0, 7)}`);
