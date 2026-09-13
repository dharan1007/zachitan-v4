import { json, clampNumber, safeText } from '@/lib/http.mjs';
import * as cb from '@/lib/providers/coinbase.mjs';
import * as yf from '@/lib/providers/yahoo.mjs';
import * as amfi from '@/lib/providers/amfi.mjs';
import * as ecb from '@/lib/providers/ecb.mjs';
import { pulse } from '@/lib/providers/world.mjs';
import { news } from '@/lib/providers/news.mjs';
import { filings } from '@/lib/providers/sec.mjs';
import { indicators, microstructure } from '@/lib/forecast.mjs';
import { forecastV5, validateEnsemble } from '@/lib/model-v5.mjs';
import { normalizeCandles, marketSessionPolicy, applySessionForecastPolicy } from '@/lib/market-integrity.mjs';
import { verifyProviderContracts } from '@/lib/provider-contracts.mjs';
import { PRESETS, SOURCE_LEDGER } from '@/lib/catalog.mjs';

verifyProviderContracts({ coinbase: cb, yahoo: yf, amfi, ecb });

const RELEASE_VERSION = '5.0.0-beta.1';
const COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'unknown';
const INTERVAL_SEC = { '1m':60, '2m':120, '5m':300, '15m':900, '30m':1800, '1h':3600, '6h':21600, '1d':86400, '1wk':604800, '1mo':2592000 };
const rateState = globalThis.__zachitanRateState || new Map();
const analysisCache = globalThis.__zachitanAnalysisCache || new Map();
globalThis.__zachitanRateState = rateState;
globalThis.__zachitanAnalysisCache = analysisCache;

function clientKey(request) {
  return String(request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous').split(',')[0].trim().slice(0, 80);
}

function rateLimit(request, action) {
  if (action === 'health' || action === 'sources') return null;
  const now = Date.now(), windowMs = 60_000, limit = action === 'market' ? 30 : action === 'search' ? 45 : 60;
  const key = `${clientKey(request)}:${action}`;
  const prev = rateState.get(key);
  const state = !prev || now - prev.started >= windowMs ? { started: now, count: 0 } : prev;
  state.count += 1;
  rateState.set(key, state);
  if (state.count <= limit) return null;
  return Math.max(1, Math.ceil((windowMs - (now - state.started)) / 1000));
}

function granularity(interval) {
  return ({ '1m':60, '5m':300, '15m':900, '1h':3600, '6h':21600, '1d':86400 })[interval] || 300;
}

function rangeDays(range) {
  return ({ '1d':1, '5d':5, '1mo':31, '3mo':93, '6mo':186, '1y':365, '2y':730, '5y':1825, '10y':3650, 'max':3650 })[range] || 365;
}

function rangeBars(range, g) {
  return Math.min(1200, Math.max(180, Math.ceil(rangeDays(range) * 86400 / g)));
}

function inferStep(candles, interval) {
  if (candles.length > 2) {
    const d = candles.slice(-80).map((x, i, a) => i ? x.time - a[i - 1].time : null)
      .filter(x => x > 0 && Number.isFinite(x)).sort((a, b) => a - b);
    if (d.length) return d[Math.floor(d.length / 2)];
  }
  return INTERVAL_SEC[interval] || 86400;
}

function marketQuality(candles, meta, provider, session, integrity) {
  const newest = candles.at(-1)?.time || 0;
  const stale = Math.max(0, Date.now() / 1000 - newest);
  const step = inferStep(candles, meta.interval);
  const dailyLike = step >= 20 * 3600 || ['amfi', 'ecb'].includes(provider);
  const sourceClosed = provider === 'yahoo' && session?.state !== 'REGULAR';
  const grace = dailyLike ? 4 * 86400 : step * 2;
  const horizon = dailyLike ? 8 * 86400 : step * 20;
  const freshness = sourceClosed
    ? null
    : Math.max(0, 100 - Math.max(0, stale - grace) / Math.max(1, horizon) * 100);
  return {
    rows: candles.length,
    newest: newest ? new Date(newest * 1000).toISOString() : null,
    staleSeconds: Math.round(stale),
    freshnessScore: freshness == null ? null : Math.round(Math.min(100, freshness)),
    freshnessStatus: sourceClosed ? 'market-closed-last-observation' : dailyLike ? 'reference-cadence' : 'live-cadence-check',
    timing: meta.marketState || 'source-dependent',
    integrity,
  };
}

function nextBusinessDay(sec, days) {
  const d = new Date(sec * 1000);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return Math.floor(d.getTime() / 1000);
}

function addForecastTimes(f, candles, meta, provider, interval) {
  if (!f?.available) return f;
  const step = inferStep(candles, interval), last = candles.at(-1).time;
  const continuous = provider === 'coinbase';
  const dailyLike = step >= 20 * 3600 || ['amfi', 'ecb'].includes(provider) || interval === '1d';
  const points = (f.points || []).map(p => {
    let time = null, timeMode = 'observation-index';
    if (continuous) {
      time = last + p.bar * step;
      timeMode = 'continuous-market-estimate';
    } else if (dailyLike) {
      time = nextBusinessDay(last, p.bar);
      timeMode = 'business-day-estimate';
    }
    return { ...p, time, timeMode, observationLabel: `+${p.bar} market observation${p.bar === 1 ? '' : 's'}` };
  });
  return { ...f, points, timePolicy: continuous ? '24/7 market time' : dailyLike ? 'weekday business-day estimate; exchange holidays may differ' : 'observation-index only to avoid false overnight/session timestamps' };
}

function searchScore(x, term) {
  const q = term.toLowerCase();
  const symbol = String(x.symbol || '').toLowerCase();
  const name = String(x.name || '').toLowerCase();
  if (symbol === q) return 1000;
  if (symbol.startsWith(q)) return 700 - Math.min(100, symbol.length - q.length);
  if (name.startsWith(q)) return 500;
  if (symbol.includes(q)) return 350;
  if (name.includes(q)) return 250;
  return 0;
}

async function searchAll(q) {
  const term = safeText(q, 60);
  const local = PRESETS.filter(x => !term || x.symbol.toLowerCase().includes(term.toLowerCase()) || x.name.toLowerCase().includes(term.toLowerCase())).slice(0, 16);
  if (!term) return local;
  const upstream = term.length >= 2
    ? await Promise.allSettled([yf.search(term), cb.searchProducts(term), amfi.search(term)])
    : [];
  const out = [
    ...local,
    ...(upstream[0]?.status === 'fulfilled' ? upstream[0].value : []),
    ...(upstream[1]?.status === 'fulfilled' ? upstream[1].value : []),
    ...(upstream[2]?.status === 'fulfilled' ? upstream[2].value : []),
  ];
  const seen = new Set();
  return out.filter(x => {
    const k = `${x.provider}:${x.symbol}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => searchScore(b, term) - searchScore(a, term) || String(a.symbol).localeCompare(String(b.symbol))).slice(0, 30);
}

function analysisKey(provider, symbol, interval, range, horizon, candles) {
  const last = candles.at(-1);
  return `${provider}:${symbol}:${interval}:${range}:${horizon}:${last?.time || 0}:${last?.close || 0}:${candles.length}`;
}

function rememberAnalysis(key, value) {
  analysisCache.set(key, { at: Date.now(), value });
  if (analysisCache.size > 96) {
    const oldest = [...analysisCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, analysisCache.size - 72);
    for (const [k] of oldest) analysisCache.delete(k);
  }
  return value;
}

function analyzeMarket(provider, symbol, interval, range, horizon, candles) {
  const key = analysisKey(provider, symbol, interval, range, horizon, candles);
  const cached = analysisCache.get(key);
  if (cached && Date.now() - cached.at < 15 * 60_000) return { ...cached.value, cacheHit: true };
  const validation = validateEnsemble(candles, horizon, 36);
  const modelForecast = forecastV5(candles, horizon, validation);
  const result = { validation, modelForecast, indicators: indicators(candles), cacheHit: false, analysisIdentity: key };
  return rememberAnalysis(key, result);
}

async function market(u) {
  const provider = safeText(u.searchParams.get('provider') || 'coinbase', 20);
  const symbol = safeText(u.searchParams.get('symbol') || 'BTC-USD', 60);
  const interval = safeText(u.searchParams.get('interval') || '5m', 8);
  const range = safeText(u.searchParams.get('range') || '1mo', 8);
  const horizon = Math.round(clampNumber(u.searchParams.get('horizon'), 1, 80, 12));
  let candles, meta, quote = null, book = null, trades = null, sourceProvenance;

  if (provider === 'coinbase') {
    candles = await cb.candles(symbol, granularity(interval), rangeBars(range, granularity(interval)));
    quote = await cb.ticker(symbol);
    meta = {
      name: symbol, assetClass: 'crypto', currency: quote.currency, exchange: quote.exchange,
      price: quote.price, previousClose: candles.at(-2)?.close || null, marketState: '24/7 live',
      timezone: 'UTC', dataGranularity: interval, interval, range: `${range} · up to 1200 exchange bars`,
    };
    sourceProvenance = cb.provenance;
    try { [book, trades] = await Promise.all([cb.book(symbol), cb.trades(symbol)]); } catch {}
  } else if (provider === 'amfi') {
    const d = await amfi.history(symbol, Math.max(180, rangeDays(range)));
    candles = d.candles; meta = d.meta; sourceProvenance = d.provenance;
  } else if (provider === 'ecb') {
    const raw = symbol.replace(/^ECB:/i, '');
    const [base, quoteCurrency] = raw.split('/');
    if (!base || !quoteCurrency) throw new Error('ECB symbol must be a currency pair such as EUR/INR');
    const d = await ecb.fx(base, quoteCurrency, Math.max(180, rangeDays(range)));
    candles = d.candles; meta = d.meta; sourceProvenance = d.provenance;
  } else if (provider === 'yahoo') {
    const d = await yf.chart(symbol, interval, range);
    candles = d.candles; meta = d.meta; sourceProvenance = yf.provenance;
    quote = {
      symbol, price: meta.price, previousClose: meta.previousClose,
      time: candles.at(-1)?.time ? new Date(candles.at(-1).time * 1000).toISOString() : null,
      currency: meta.currency, exchange: meta.exchange, marketState: meta.marketState,
    };
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const normalized = normalizeCandles(candles);
  candles = normalized.candles;
  if (!candles.length) throw new Error('No clean market rows were returned.');

  const session = marketSessionPolicy({ provider, meta, interval: meta.interval || interval });
  const analysis = analyzeMarket(provider, symbol, interval, range, horizon, candles);
  const timedForecast = addForecastTimes(analysis.modelForecast, candles, meta, provider, meta.interval || interval);
  const modelForecast = applySessionForecastPolicy(timedForecast, session, normalized.diagnostics);
  const micro = provider === 'coinbase' ? microstructure(book, trades) : null;
  return {
    symbol,
    provider,
    meta,
    quote,
    candles,
    forecast: modelForecast,
    validation: analysis.validation,
    indicators: analysis.indicators,
    microstructure: micro,
    session,
    publication: {
      state: modelForecast?.decisionState || 'UNAVAILABLE',
      modelStatus: modelForecast?.modelStatus || null,
      reason: modelForecast?.abstainReason || null,
      pointModel: modelForecast?.pointModel || null,
    },
    analysisIdentity: analysis.analysisIdentity,
    quality: marketQuality(candles, meta, provider, session, normalized.diagnostics),
    provenance: sourceProvenance,
    compute: { validationOriginsMax: 36, warmAnalysisCacheHit: analysis.cacheHit },
    asOf: new Date().toISOString(),
  };
}

function marketCacheControl(data) {
  if (data?.provider === 'coinbase') return 'public, s-maxage=60, stale-while-revalidate=300';
  if (data?.session?.state === 'REGULAR') return 'public, s-maxage=90, stale-while-revalidate=300';
  return 'public, s-maxage=300, stale-while-revalidate=900';
}

function optionMetrics(d) {
  const callV = d.calls.reduce((s, x) => s + (x.volume || 0), 0), putV = d.puts.reduce((s, x) => s + (x.volume || 0), 0);
  const callOI = d.calls.reduce((s, x) => s + (x.openInterest || 0), 0), putOI = d.puts.reduce((s, x) => s + (x.openInterest || 0), 0);
  const spot = +d.quote.regularMarketPrice || +d.quote.postMarketPrice || 0;
  const all = [...d.calls, ...d.puts].filter(x => x.strike > 0 && x.impliedVolatility > 0).sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot));
  return { putCallVolume: callV ? putV / callV : null, putCallOpenInterest: callOI ? putOI / callOI : null, nearestAtmIv: all[0]?.impliedVolatility || null, spot };
}

export async function GET(request) {
  const u = new URL(request.url), action = safeText(u.searchParams.get('action') || 'health', 30);
  const retryAfter = rateLimit(request, action);
  if (retryAfter) return Response.json({ ok: false, error: 'Rate limit exceeded', retryAfterSeconds: retryAfter }, { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } });

  try {
    if (action === 'health') return json({
      ok: true,
      version: RELEASE_VERSION,
      commitSha: COMMIT_SHA,
      releaseState: 'beta',
      time: new Date().toISOString(),
      truthContract: 'Observed values retain source/timing labels. V5 point forecasts use a past-only adaptive ensemble and abstain on closed/unverified sessions, critical data-integrity failures, regime breaks, and measured negative baseline skill.',
    }, 200, 'no-store');
    if (action === 'search') return json({ ok: true, results: await searchAll(u.searchParams.get('q') || '') }, 200, 'public, s-maxage=300, stale-while-revalidate=900');
    if (action === 'market') {
      const data = await market(u);
      return json({ ok: true, ...data }, 200, marketCacheControl(data));
    }
    if (action === 'options') {
      const symbol = safeText(u.searchParams.get('symbol') || 'AAPL', 20);
      try {
        const d = await yf.options(symbol, u.searchParams.get('expiration'));
        return json({ ok: true, state: 'CONNECTED', ...d, metrics: optionMetrics(d), provenance: { provider: 'Yahoo Finance options feed', synthetic: false, rights: 'Yahoo terms apply; not an OPRA entitlement', cadence: 'market-dependent / may be delayed' } }, 200, 'public, s-maxage=60, stale-while-revalidate=300');
      } catch (e) {
        return json({ ok: true, state: 'DEGRADED', underlying: symbol, calls: [], puts: [], expirationDates: [], message: 'The public options session is unavailable. Zachitan did not substitute fabricated chain data.', error: e.message, provenance: { provider: 'Yahoo Finance options feed', synthetic: false, rights: 'Yahoo terms apply; not an OPRA entitlement' } }, 200, 'no-store');
      }
    }
    if (action === 'world') {
      const lat = clampNumber(u.searchParams.get('lat'), -90, 90, 17.385), lon = clampNumber(u.searchParams.get('lon'), -180, 180, 78.4867);
      const country = safeText(u.searchParams.get('country') || 'IND', 3).toUpperCase();
      return json({ ok: true, ...await pulse({ lat, lon, country }) }, 200, 'public, s-maxage=300, stale-while-revalidate=900');
    }
    if (action === 'news') return json({ ok: true, asOf: new Date().toISOString(), ...await news(u.searchParams.get('q') || 'global markets') }, 200, 'public, s-maxage=180, stale-while-revalidate=600');
    if (action === 'filings') {
      const d = await filings(u.searchParams.get('q') || 'AAPL');
      return json({ ok: true, asOf: new Date().toISOString(), ...d }, 200, d.state === 'GATED' ? 'public, s-maxage=600' : 'public, s-maxage=120, stale-while-revalidate=600');
    }
    if (action === 'sources') return json({ ok: true, sources: SOURCE_LEDGER, presets: PRESETS }, 200, 'public, s-maxage=3600');
    return json({ ok: false, error: 'Unknown action' }, 404);
  } catch (e) {
    return json({ ok: false, error: e?.message || 'Request failed', action, asOf: new Date().toISOString() }, 502, 'no-store');
  }
}
