import { handleGet as handleV5 } from './market-api-v5.mjs';
import { json, clampNumber, safeText } from './http.mjs';
import { buildMarketDataV6 } from './market-data-v6.mjs';
import { RELEASE_VERSION } from './release.mjs';

const COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'unknown';
const rateState = globalThis.__zachitanV6RateState || new Map();
globalThis.__zachitanV6RateState = rateState;

function retryAfter(request) {
  const now = Date.now(), windowMs = 60_000, limit = 30;
  const ip = String(request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous').split(',')[0].trim().slice(0, 80);
  const key = `${ip}:market-v6`;
  const old = rateState.get(key);
  const state = !old || now - old.started >= windowMs ? { started: now, count: 0 } : old;
  state.count += 1;
  rateState.set(key, state);
  return state.count <= limit ? null : Math.max(1, Math.ceil((windowMs - (now - state.started)) / 1000));
}

function cacheControl(data) {
  if (data?.provider === 'coinbase') return 'public, s-maxage=60, stale-while-revalidate=300';
  if (data?.session?.state === 'REGULAR') return 'public, s-maxage=90, stale-while-revalidate=300';
  return 'public, s-maxage=300, stale-while-revalidate=900';
}

export async function handleGet(request) {
  const u = new URL(request.url);
  const action = safeText(u.searchParams.get('action') || 'health', 30);
  if (action === 'health') return json({
    ok: true,
    version: RELEASE_VERSION,
    commitSha: COMMIT_SHA,
    releaseState: 'beta',
    time: new Date().toISOString(),
    truthContract: 'Numeric V6 targets require chronological validation plus a frozen untouched holdout, recent-skill drift checks, verified session state, clean-enough source integrity and regime safety gates.',
  }, 200, 'no-store');
  if (action !== 'market') return handleV5(request);

  const wait = retryAfter(request);
  if (wait) return Response.json({ ok: false, error: 'Rate limit exceeded', retryAfterSeconds: wait }, { status: 429, headers: { 'Retry-After': String(wait), 'Cache-Control': 'no-store' } });
  try {
    const data = await buildMarketDataV6({
      provider: safeText(u.searchParams.get('provider') || 'coinbase', 20),
      symbol: safeText(u.searchParams.get('symbol') || 'BTC-USD', 60),
      interval: safeText(u.searchParams.get('interval') || '5m', 8),
      range: safeText(u.searchParams.get('range') || '1mo', 8),
      horizon: Math.round(clampNumber(u.searchParams.get('horizon'), 1, 80, 12)),
    });
    return json({ ok: true, ...data }, 200, cacheControl(data));
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Request failed', action, asOf: new Date().toISOString() }, 502, 'no-store');
  }
}
