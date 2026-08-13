const memory = globalThis.__zachitanCache || new Map();
globalThis.__zachitanCache = memory;

export function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
export function safeText(value, max = 80) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
export function json(body, status = 200, cache = 'no-store') {
  return Response.json(body, { status, headers: { 'Cache-Control': cache } });
}
export async function fetchText(url, { timeoutMs = 9000, headers = {}, cacheKey, ttlMs = 0 } = {}) {
  const key = cacheKey || url;
  const hit = memory.get(key);
  if (ttlMs && hit && Date.now() - hit.at < ttlMs) return hit.value;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'ZachitanResearchBeta/4.0 (+https://zachitan.vercel.app)',
        'Accept': '*/*',
        ...headers
      }
    });
    if (!response.ok) throw new Error(`Upstream ${response.status}`);
    const text = await response.text();
    if (ttlMs) memory.set(key, { at: Date.now(), value: text });
    return text;
  } finally { clearTimeout(timer); }
}
export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, { ...options, headers: { Accept: 'application/json,text/plain,*/*', ...(options.headers || {}) } });
  try { return JSON.parse(text); } catch { throw new Error('Upstream returned invalid JSON'); }
}
export function settle(name, provenance, fn) {
  const started = Date.now();
  return Promise.resolve().then(fn).then((data) => ({
    ok: true, state: 'CONNECTED', name, latencyMs: Date.now() - started, fetchedAt: new Date().toISOString(), provenance, data
  })).catch((error) => ({
    ok: false, state: 'DEGRADED', name, latencyMs: Date.now() - started, fetchedAt: new Date().toISOString(), provenance,
    error: error?.message || 'Source failed', data: null
  }));
}
