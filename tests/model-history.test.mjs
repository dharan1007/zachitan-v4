import test from 'node:test';
import assert from 'node:assert/strict';
import {
  targetValidationRows,
  modelHistoryPlan,
  sliceDisplayCandles,
} from '../lib/model-history.mjs';

function candles(count, step = 86400) {
  const start = 1_700_000_000;
  return Array.from({ length: count }, (_, i) => ({ time: start + i * step, close: 100 + i }));
}

test('validation history target grows with forecast horizon instead of chart zoom', () => {
  assert.ok(targetValidationRows(12) >= 840);
  assert.ok(targetValidationRows(20) > targetValidationRows(12));
  assert.ok(targetValidationRows(50) > 1200);
});

test('Yahoo daily qualification extends a one-year display to enough v6 model history', () => {
  const short = modelHistoryPlan({ provider: 'yahoo', interval: '1d', range: '1y', horizon: 12 });
  const long = modelHistoryPlan({ provider: 'yahoo', interval: '1d', range: '1y', horizon: 50 });
  assert.equal(short.modelRange, '5y');
  assert.equal(long.modelRange, '10y');
  assert.equal(short.displayRange, '1y');
});

test('Yahoo intraday model history stays inside conservative provider limits', () => {
  const p = modelHistoryPlan({ provider: 'yahoo', interval: '5m', range: '1d', horizon: 12 });
  assert.equal(p.modelRange, '1mo');
  assert.equal(p.displayRange, '1d');
});

test('Coinbase fetches enough bars for v6 qualification without changing displayed bars', () => {
  const p = modelHistoryPlan({ provider: 'coinbase', interval: '5m', range: '1d', horizon: 12, displayBars: 288 });
  assert.equal(p.displayBars, 288);
  assert.ok(p.modelBars >= 840);
  assert.ok(p.modelBars <= 1200);
  const out = sliceDisplayCandles(candles(p.modelBars, 300), p);
  assert.equal(out.length, 288);
});

test('Coinbase reports when the venue history cap cannot satisfy a very long horizon', () => {
  const p = modelHistoryPlan({ provider: 'coinbase', interval: '5m', range: '1d', horizon: 80, displayBars: 288 });
  assert.equal(p.modelBars, 1200);
  assert.equal(p.historyLimited, true);
});

test('Yahoo display slicing preserves the requested visual window after a longer model fetch', () => {
  const all = candles(800, 86400);
  const p = modelHistoryPlan({ provider: 'yahoo', interval: '1d', range: '1y', horizon: 12 });
  const out = sliceDisplayCandles(all, p);
  assert.ok(out.length >= 365 && out.length <= 367);
  assert.equal(out.at(-1).time, all.at(-1).time);
  assert.ok(out.length < all.length);
});
