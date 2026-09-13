import test from 'node:test';
import assert from 'node:assert/strict';
import * as cb from '../lib/providers/coinbase.mjs';
import * as yf from '../lib/providers/yahoo.mjs';
import * as amfi from '../lib/providers/amfi.mjs';
import * as ecb from '../lib/providers/ecb.mjs';
import { verifyProviderContracts } from '../lib/provider-contracts.mjs';
import { cachedFetchJson, cachedFetchText, provenance } from '../lib/http.mjs';

test('all market providers satisfy the dispatcher contract at module load', () => {
  assert.equal(verifyProviderContracts({ coinbase: cb, yahoo: yf, amfi, ecb }), true);
});

test('HTTP compatibility exports exist so adapters cannot break module loading', () => {
  assert.equal(typeof cachedFetchJson, 'function');
  assert.equal(typeof cachedFetchText, 'function');
  assert.deepEqual(provenance({ provider: 'x', family: 'y' }), { provider: 'x', family: 'y', endpoint: null, rights: '', cadence: '', synthetic: false });
});

test('Yahoo chart metadata prefers the true previous session close over the chart range anchor', () => {
  assert.equal(typeof yf.deriveChartMeta, 'function');
  const candles = [
    { time: 10, close: 320 },
    { time: 20, close: 326.57 },
    { time: 30, close: 332.27 },
  ];
  const meta = yf.deriveChartMeta({
    longName: 'Apple Inc.',
    instrumentType: 'EQUITY',
    currency: 'USD',
    fullExchangeName: 'NasdaqGS',
    regularMarketPrice: 332.27,
    previousClose: 326.57,
    chartPreviousClose: 230.03,
    exchangeTimezoneName: 'America/New_York',
    currentTradingPeriod: { regular: { start: 2_000, end: 3_000 } },
  }, candles, { interval: '1d', range: '1y', nowSec: 1_000 });
  assert.equal(meta.previousClose, 326.57);
  assert.notEqual(meta.previousClose, 230.03);
  assert.equal(meta.marketState, 'CLOSED');
  assert.equal(meta.sessionSource, 'trading-period');
});

test('Yahoo daily metadata falls back to the preceding clean observation rather than chartPreviousClose', () => {
  assert.equal(typeof yf.deriveChartMeta, 'function');
  const candles = [
    { time: 10, close: 301 },
    { time: 20, close: 305 },
    { time: 30, close: 309 },
  ];
  const meta = yf.deriveChartMeta({
    regularMarketPrice: 309,
    chartPreviousClose: 210,
  }, candles, { interval: '1d', range: '1y', nowSec: 1_000 });
  assert.equal(meta.previousClose, 305);
  assert.equal(meta.marketState, 'UNKNOWN');
});
