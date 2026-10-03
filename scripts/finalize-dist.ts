// Post-build step: put the real origin into dist/_headers and fail on
// anything that should never ship (source maps, inline scripts).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLACEHOLDER_ORIGIN, siteOrigin } from './site';

const dist = 'dist';
const origin = siteOrigin();
const headersPath = join(dist, '_headers');
const headers = readFileSync(headersPath, 'utf8');
if (!headers.includes(PLACEHOLDER_ORIGIN)) throw new Error('dist/_headers lost its origin placeholder');
writeFileSync(headersPath, headers.replaceAll(PLACEHOLDER_ORIGIN, origin));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
for (const f of walk(dist)) {
  if (f.endsWith('.map')) throw new Error(`Source map must not ship: ${f}`);
  if (f.endsWith('.html')) {
    const html = readFileSync(f, 'utf8');
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) throw new Error(`Inline <script> in ${f}`);
    if (/\sstyle=/i.test(html) || /<style/i.test(html)) throw new Error(`Inline style in ${f}`);
  }
}
console.log(`dist finalised for ${origin}`);
