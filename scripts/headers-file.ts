// Parser for the Cloudflare _headers format (subset used by nz-fif).
export function parseHeadersFile(text: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  let current: Record<string, string> | null = null;
  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = {};
      out.set(raw.trim(), current);
      continue;
    }
    const idx = raw.indexOf(':');
    if (!current || idx < 0) throw new Error(`bad _headers line: ${raw}`);
    current[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
  }
  return out;
}
