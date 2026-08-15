const memory = globalThis.__zachitanCache || new Map();
const inflight = globalThis.__zachitanInflight || new Map();
globalThis.__zachitanCache = memory;
globalThis.__zachitanInflight = inflight;

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

export function provenance({ provider, family, endpoint = null, rights = '', cadence = '', synthetic = false } = {}) {
  return { provider, family, endpoint, rights, cadence, synthetic };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTextOnce(url, { timeoutMs, headers }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(String(url), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'ZachitanResearchBeta/4.1 (+https://zachitan.vercel.app)',
        Accept: '*/*',
        ...headers,
      },
    });
    if (!response.ok) {
      const error = new Error(`Upstream ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url, {
  timeoutMs = 9000,
  headers = {},
  cacheKey,
  ttlMs = 0,
  retries = 1,
} = {}) {
  const key = cacheKey || String(url);
  const hit = memory.get(key);
  if (ttlMs && hit && Date.now() - hit.at < ttlMs) return hit.value;
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const text = await fetchTextOnce(url, { timeoutMs, headers });
        if (ttlMs) memory.set(key, { at: Date.now(), value: text });
        return text;
      } catch (error) {
        lastError = error;
        const retryable = error?.name === 'AbortError' || error?.status === 429 || error?.status >= 500;
        if (!retryable || attempt === retries) throw error;
        await sleep(150 * (2 ** attempt));
      }
    }
    throw lastError;
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, {
    ...options,
    headers: { Accept: 'application/json,text/plain,*/*', ...(options.headers || {}) },
  });
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Upstream returned invalid JSON');
  }
}

// Backward-compatible aliases for provider adapters. Keeping these aliases in one place
// prevents provider-interface drift from becoming a module-load failure.
export const cachedFetchText = fetchText;
export const cachedFetchJson = fetchJson;

export function settle(name, sourceProvenance, fn) {
  const started = Date.now();
  return Promise.resolve().then(fn).then(data => ({
    ok: true,
    state: 'CONNECTED',
    name,
    latencyMs: Date.now() - started,
    fetchedAt: new Date().toISOString(),
    provenance: sourceProvenance,
    data,
  })).catch(error => ({
    ok: false,
    state: 'DEGRADED',
    name,
    latencyMs: Date.now() - started,
    fetchedAt: new Date().toISOString(),
    provenance: sourceProvenance,
    error: error?.message || 'Source failed',
    data: null,
  }));
}
