import { fetchText } from '../http.mjs';

const ECB_HIST = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.csv';
const CURRENCIES = new Set(['USD','INR','GBP','JPY','CHF','CAD','AUD','CNY','HKD','SGD','NZD','ZAR','SEK','NOK','DKK','PLN','CZK','HUF','RON','BGN','TRY','BRL','MXN','IDR','ILS','KRW','MYR','PHP','THB']);

export const provenance = {
  provider: 'European Central Bank',
  family: 'FX reference rates',
  cadence: 'TARGET business-day reference rate',
  synthetic: false,
  rights: 'Official ECB reference-rate publication; ECB reuse terms apply',
};

function parseCsv(text) {
  const lines = String(text || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(x => x.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(','), row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cols[i]?.trim();
    return row;
  });
}

function pairValue(row, base, quote) {
  if (base === quote) return 1;
  const eurBase = base === 'EUR' ? 1 : Number(row[base]);
  const eurQuote = quote === 'EUR' ? 1 : Number(row[quote]);
  if (!Number.isFinite(eurBase) || !Number.isFinite(eurQuote) || eurBase <= 0 || eurQuote <= 0) return null;
  return eurQuote / eurBase;
}

export async function ecbPair(symbol, { days = 3650 } = {}) {
  const raw = decodeURIComponent(symbol || '').toUpperCase().replace('ECB:', '').replace('-', '/');
  const [base, quote] = raw.split('/');
  if (!base || !quote || base.length !== 3 || quote.length !== 3) throw new Error('ECB pair must look like EUR/USD or EUR/INR');
  if (base !== 'EUR' && !CURRENCIES.has(base)) throw new Error(`ECB does not publish ${base} in this reference table`);
  if (quote !== 'EUR' && !CURRENCIES.has(quote)) throw new Error(`ECB does not publish ${quote} in this reference table`);

  const text = await fetchText(ECB_HIST, { ttlMs: 6 * 60 * 60_000, timeoutMs: 10000 });
  const rows = parseCsv(text), cutoff = Date.now() - Math.max(180, days) * 86400_000;
  const candles = rows.map(row => {
    const time = Math.floor(Date.parse(`${row.Date}T00:00:00Z`) / 1000), close = pairValue(row, base, quote);
    return { time, open: close, high: close, low: close, close, volume: 0 };
  }).filter(x => Number.isFinite(x.time) && x.time * 1000 >= cutoff && Number.isFinite(x.close) && x.close > 0)
    .sort((a, b) => a.time - b.time);
  if (candles.length < 30) throw new Error(`ECB returned too little history for ${base}/${quote}`);
  const last = candles.at(-1);
  return {
    symbol: `ECB:${base}/${quote}`,
    name: `${base}/${quote} — ECB reference rate`,
    assetClass: 'forex',
    currency: quote,
    exchange: 'ECB',
    current: last.close,
    candles,
    sourceTiming: 'ECB reference rate, published once per TARGET business day; not an executable FX quote',
    provenance,
  };
}

export async function fx(base, quote, days = 3650) {
  const d = await ecbPair(`${base}/${quote}`, { days });
  return {
    candles: d.candles,
    meta: {
      name: d.name,
      assetClass: 'forex',
      currency: d.currency,
      exchange: d.exchange,
      price: d.current,
      previousClose: d.candles.at(-2)?.close ?? null,
      marketState: 'official reference rate',
      timezone: 'Europe/Frankfurt',
      dataGranularity: '1d',
      interval: '1d',
      range: `${days}d requested`,
      sourceTiming: d.sourceTiming,
    },
    provenance: d.provenance,
  };
}
