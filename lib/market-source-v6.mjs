import * as cb from './providers/coinbase.mjs';
import * as yf from './providers/yahoo.mjs';
import * as amfi from './providers/amfi.mjs';
import * as ecb from './providers/ecb.mjs';
import { modelHistoryPlan } from './model-history.mjs';

function granularity(interval) {
  return ({ '1m':60, '5m':300, '15m':900, '1h':3600, '6h':21600, '1d':86400 })[interval] || 300;
}

function rangeDays(range) {
  return ({ '1d':1, '5d':5, '1mo':31, '3mo':93, '6mo':186, '1y':365, '2y':730, '5y':1825, '10y':3650, 'max':3650 })[range] || 365;
}

function rangeBars(range, g) {
  return Math.min(1200, Math.max(180, Math.ceil(rangeDays(range) * 86400 / g)));
}

export function buildYahooMeta(upstreamMeta = {}, { requestedRange, effectiveInterval, effectiveModelRange, historyLimited = false } = {}) {
  const effectiveDisplayRange = historyLimited ? effectiveModelRange : requestedRange;
  return {
    ...upstreamMeta,
    interval: effectiveInterval,
    requestedRange,
    range: effectiveDisplayRange,
    modelRange: effectiveModelRange,
    rangeAdjusted: effectiveDisplayRange !== requestedRange,
  };
}

export async function loadMarketSource({ provider, symbol, interval, range, horizon }) {
  const g = granularity(interval);
  const displayBars = provider === 'coinbase' ? rangeBars(range, g) : null;
  let plan = modelHistoryPlan({ provider, interval, range, horizon, displayBars });
  let modelCandles, meta, quote = null, book = null, trades = null, provenance;

  if (provider === 'coinbase') {
    modelCandles = await cb.candles(symbol, g, plan.modelBars);
    quote = await cb.ticker(symbol);
    meta = {
      name: symbol,
      assetClass: 'crypto',
      currency: quote.currency,
      exchange: quote.exchange,
      price: quote.price,
      previousClose: null,
      marketState: '24/7 live',
      timezone: 'UTC',
      dataGranularity: interval,
      interval,
      range: `${range} · display up to ${plan.displayBars} bars · model up to ${plan.modelBars} bars`,
    };
    provenance = cb.provenance;
    try { [book, trades] = await Promise.all([cb.book(symbol), cb.trades(symbol)]); } catch {}
  } else if (provider === 'amfi') {
    const d = await amfi.history(symbol, plan.modelDays);
    modelCandles = d.candles;
    meta = { ...d.meta, range, modelDays: plan.modelDays };
    provenance = d.provenance;
  } else if (provider === 'ecb') {
    const [base, quoteCurrency] = symbol.replace(/^ECB:/i, '').split('/');
    if (!base || !quoteCurrency) throw new Error('ECB symbol must be a currency pair such as EUR/INR');
    const d = await ecb.fx(base, quoteCurrency, plan.modelDays);
    modelCandles = d.candles;
    meta = { ...d.meta, range, modelDays: plan.modelDays };
    provenance = d.provenance;
  } else if (provider === 'yahoo') {
    const effective = yf.normalizeYahooIntervalRange(interval, plan.modelRange);
    const historyLimited = plan.modelRange !== effective.range;
    plan = { ...plan, modelRange: effective.range, historyLimited };
    const d = await yf.chart(symbol, effective.interval, effective.range);
    modelCandles = d.candles;
    meta = buildYahooMeta(d.meta, {
      requestedRange: range,
      effectiveInterval: effective.interval,
      effectiveModelRange: effective.range,
      historyLimited,
    });
    provenance = yf.provenance;
    quote = {
      symbol,
      price: meta.price,
      previousClose: meta.previousClose,
      time: modelCandles.at(-1)?.time ? new Date(modelCandles.at(-1).time * 1000).toISOString() : null,
      currency: meta.currency,
      exchange: meta.exchange,
      marketState: meta.marketState,
    };
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  return { plan, modelCandles, meta, quote, book, trades, provenance };
}
