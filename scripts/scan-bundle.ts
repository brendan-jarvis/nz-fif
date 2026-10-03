// Bundle scan (PLAN §3.9): every network, storage or eval capability that
// appears anywhere in dist/ must be justified in audit/bundle-allowlist.json.
// Any unexplained hit fails the build.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const PATTERNS: Record<string, RegExp> = {
  fetch: /\bfetch\s*\(/g,
  xhr: /XMLHttpRequest/g,
  websocket: /WebSocket/g,
  eventSource: /EventSource/g,
  sendBeacon: /sendBeacon/g,
  rtc: /RTCPeerConnection/g,
  localStorage: /localStorage/g,
  sessionStorage: /sessionStorage/g,
  indexedDB: /indexedDB/gi,
  cookie: /document\.cookie|cookieStore/g,
  serviceWorker: /serviceWorker/g,
  importScripts: /importScripts/g,
  cacheStorage: /\bcaches\./g,
  eval: /\beval\s*\(|new Function\s*\(/g,
  externalUrl: /\b(?:https?|wss?):\/\/[A-Za-z0-9.-]+/g,
};

interface Rule {
  pattern: string;
  file: string;
  match?: string;
  maxCount: number;
  why: string;
}

export interface Hit {
  file: string;
  pattern: string;
  text: string;
}

function globToRe(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${esc}$`);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function scan(distDir: string): Hit[] {
  const hits: Hit[] = [];
  for (const path of walk(distDir)) {
    if (!/\.(m?js|html|css|json|txt|svg)$/.test(path) && !path.endsWith('_headers')) continue;
    const file = relative(distDir, path).split('\\').join('/');
    if (file === '_headers' || file === 'build-manifest.json') continue;
    const text = readFileSync(path, 'utf8');
    for (const [pattern, re] of Object.entries(PATTERNS)) {
      for (const m of text.matchAll(re)) hits.push({ file, pattern, text: m[0] });
    }
  }
  return hits;
}

export function check(hits: Hit[], rules: Rule[]): { failures: string[]; unused: Rule[] } {
  const counts = new Map<Rule, number>();
  const failures: string[] = [];
  for (const h of hits) {
    const rule = rules.find(
      (r) => r.pattern === h.pattern && globToRe(r.file).test(h.file) && (!r.match || h.text.includes(r.match)),
    );
    if (!rule) {
      failures.push(`${h.file}: unexplained ${h.pattern} -> ${h.text}`);
      continue;
    }
    counts.set(rule, (counts.get(rule) ?? 0) + 1);
  }
  for (const [rule, n] of counts) {
    if (n > rule.maxCount) failures.push(`${rule.file}: ${rule.pattern}${rule.match ? ` (${rule.match})` : ''} seen ${n}x, allowlist max ${rule.maxCount}`);
  }
  const unused = rules.filter((r) => !counts.has(r));
  return { failures, unused };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '');
if (isMain) {
  const rules = (JSON.parse(readFileSync('audit/bundle-allowlist.json', 'utf8')) as { rules: Rule[] }).rules;
  const hits = scan('dist');
  const { failures, unused } = check(hits, rules);
  for (const r of unused) console.warn(`note: allowlist entry not needed any more: ${r.pattern} in ${r.file}`);
  if (failures.length) {
    console.error(`Bundle scan FAILED (${failures.length}):\n` + failures.join('\n'));
    process.exit(1);
  }
  console.log(`Bundle scan passed: ${hits.length} hits, all justified by audit/bundle-allowlist.json.`);
}
