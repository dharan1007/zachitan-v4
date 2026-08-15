import { json, clampNumber, safeText } from '@/lib/http.mjs';
import * as cb from '@/lib/providers/coinbase.mjs';
import * as yf from '@/lib/providers/yahoo.mjs';
import * as amfi from '@/lib/providers/amfi.mjs';
import * as ecb from '@/lib/providers/ecb.mjs';
import { pulse } from '@/lib/providers/world.mjs';
import { news } from '@/lib/providers/news.mjs';
import { filings } from '@/lib/providers/sec.mjs';
import { forecast, validate, indicators, microstructure } from '@/lib/forecast.mjs';
import { verifyProviderContracts } from '@/lib/provider-contracts.mjs';
import { PRESETS, SOURCE_LEDGER } from '@/lib/catalog.mjs';

export const dynamic = 'force-dynamic';
verifyProviderContracts({ coinbase: cb, yahoo: yf, amfi, ecb });

const INTERVAL_SEC = { '1m':60, '2m':120, '5m':300, '15m':900, '30m':1800, '1h':3600, '6h':21600, '1d':86400, '1wk':604800, '1mo':2592000 };
const rateState = globalThis.__zachitanRateState || new Map();
globalThis.__zachitanRateState = rateState;

function clientKey(request) {
  return String(request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous').split(',')[0].trim().slice(0, 80);
}

function rateLimit(request, action) {
  if (action === 'health' || action === 'sources') return null;
  const now = Date.now(), windowMs = 60_000, limit = action === 'market' ? 45 : 90;
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

function marketQuality(candles, meta, provider) {
  const newest = candles.at(-1)?.time || 0;
  const stale = Math.max(0, Date.now() / 1000 - newest);
  const step = inferStep(candles, meta.interval);
  const dailyLike = step >= 20 * 3600 || ['amfi', 'ecb'].includes(provider);
  const grace = dailyLike ? 4 * 86400 : step * 2;
  const horizon = dailyLike ? 8 * 86400 : step * 20;
  const freshness = Math.max(0, 100 - Math.max(0, stale - grace) / Math.max(1, horizon) * 100);
  return {
    rows: candles.length,
    newest: newest ? new Date(newest * 1000).toISOString() : null,
    staleSeconds: Math.round(stale),
    freshnessScore: Math.round(Math.min(100, freshness)),
    timing: meta.marketState || 'source-dependent',
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
  const points = f.points.map(p => {
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

async function searchAll(q) {
  const term = safeText(q, 60);
  const local = PRESETS.filter(x => !term || x.symbol.toLowerCase().includes(term.toLowerCase()) || x.name.toLowerCase().includes(term.toLowerCase())).slice(0, 12);
  if (!term) return local;
  const [a, b, c] = await Promise.allSettled([yf.search(term), cb.searchProducts(term), amfi.search(term)]);
  const out = [
    ...local,
    ...(a.status === 'fulfilled' ? a.value : []),
    ...(b.status === 'fulfilled' ? b.value : []),
    ...(c.status === 'fulfilled' ? c.value : []),
  ];
  const seen = new Set();
  return out.filter(x => {
    const k = `${x.provider}:${x.symbol}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 35);
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

  if (!candles?.length) throw new Error('No clean market rows were returned.');
  const validation = validate(candles, horizon, 60);
  const modelForecast = addForecastTimes(forecast(candles, horizon, validation), candles, meta, provider, meta.interval || interval);
  const ind = indicators(candles);
  const micro = provider === 'coinbase' ? microstructure(book, trades) : null;
  return {
    symbol, provider, meta, quote, candles, forecast: modelForecast, validation, indicators: ind,
    microstructure: micro, quality: marketQuality(candles, meta, provider), provenance: sourceProvenance,
    asOf: new Date().toISOString(),
  };
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
    if (action === 'health') return json({ ok: true, version: '4.1.0-beta.1', time: new Date().toISOString(), truthContract: 'Observed values retain source/timing labels. Forecasts are experimental and expose baseline skill/calibration when sufficient history exists.' }, 200, 'no-store');
    if (action === 'search') return json({ ok: true, results: await searchAll(u.searchParams.get('q') || '') }, 200, 'public, s-maxage=30, stale-while-revalidate=120');
    if (action === 'market') return json({ ok: true, ...await market(u) }, 200, 'public, s-maxage=10, stale-while-revalidate=30');
    if (action === 'options') {
      const symbol = safeText(u.searchParams.get('symbol') || 'AAPL', 20);
      try {
        const d = await yf.options(symbol, u.searchParams.get('expiration'));
        return json({ ok: true, state: 'CONNECTED', ...d, metrics: optionMetrics(d), provenance: { provider: 'Yahoo Finance options feed', synthetic: false, rights: 'Yahoo terms apply; not an OPRA entitlement', cadence: 'market-dependent / may be delayed' } }, 200, 'public, s-maxage=30, stale-while-revalidate=120');
      } catch (e) {
        return json({ ok: true, state: 'DEGRADED', underlying: symbol, calls: [], puts: [], expirationDates: [], message: 'The public options session is unavailable. Zachitan did not substitute fabricated chain data.', error: e.message, provenance: { provider: 'Yahoo Finance options feed', synthetic: false, rights: 'Yahoo terms apply; not an OPRA entitlement' } }, 200, 'no-store');
      }
    }
    if (action === 'world') {
      const lat = clampNumber(u.searchParams.get('lat'), -90, 90, 17.385), lon = clampNumber(u.searchParams.get('lon'), -180, 180, 78.4867);
      const country = safeText(u.searchParams.get('country') || 'IND', 3).toUpperCase();
      return json({ ok: true, ...await pulse({ lat, lon, country }) }, 200, 'public, s-maxage=60, stale-while-revalidate=300');
    }
    if (action === 'news') return json({ ok: true, asOf: new Date().toISOString(), ...await news(u.searchParams.get('q') || 'global markets') }, 200, 'public, s-maxage=60, stale-while-revalidate=180');
    if (action === 'filings') {
      const d = await filings(u.searchParams.get('q') || 'AAPL');
      return json({ ok: true, asOf: new Date().toISOString(), ...d }, 200, d.state === 'GATED' ? 'public, s-maxage=300' : 'public, s-maxage=30, stale-while-revalidate=120');
    }
    if (action === 'sources') return json({ ok: true, sources: SOURCE_LEDGER, presets: PRESETS }, 200, 'public, s-maxage=3600');
    return json({ ok: false, error: 'Unknown action' }, 404);
  } catch (e) {
    return json({ ok: false, error: e?.message || 'Request failed', action, asOf: new Date().toISOString() }, 502, 'no-store');
  }
}
