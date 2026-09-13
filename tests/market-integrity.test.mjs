import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCandles, marketSessionPolicy, applySessionForecastPolicy } from '../lib/market-integrity.mjs';

test('candle normalization sorts, de-duplicates, and rejects structurally invalid rows', () => {
  const raw = [
    { time: 300, open: 102, high: 104, low: 101, close: 103, volume: 12 },
    { time: 100, open: 100, high: 101, low: 99, close: 100.5, volume: 10 },
    { time: 200, open: 101, high: 103, low: 100, close: 102, volume: 11 },
    { time: 200, open: 101.5, high: 103.5, low: 101, close: 102.5, volume: 13 },
    { time: 400, open: 104, high: 103, low: 102, close: 104, volume: 10 },
  ];
  const out = normalizeCandles(raw);
  assert.deepEqual(out.candles.map(x => x.time), [100, 200, 300]);
  assert.equal(out.candles[1].close, 102.5);
  assert.equal(out.diagnostics.duplicatesRemoved, 1);
  assert.equal(out.diagnostics.invalidRowsRemoved, 1);
  assert.equal(out.diagnostics.chronological, true);
});

test('Yahoo non-regular sessions stop forecasts and background polling', () => {
  const closed = marketSessionPolicy({ provider: 'yahoo', meta: { marketState: 'POST' }, interval: '5m' });
  assert.equal(closed.forecastAllowed, false);
  assert.equal(closed.autoRefreshMs, null);
  assert.equal(closed.state, 'POST');

  const open = marketSessionPolicy({ provider: 'yahoo', meta: { marketState: 'REGULAR' }, interval: '5m' });
  assert.equal(open.forecastAllowed, true);
  assert.ok(open.autoRefreshMs >= 60_000);
});

test('Coinbase remains forecastable but does not require server polling when websocket streaming is available', () => {
  const policy = marketSessionPolicy({ provider: 'coinbase', meta: { marketState: '24/7 live' }, interval: '5m' });
  assert.equal(policy.forecastAllowed, true);
  assert.equal(policy.state, 'OPEN');
  assert.equal(policy.autoRefreshMs, null);
  assert.equal(policy.transport, 'websocket-live-price');
});

test('session gate withholds numeric target while retaining uncertainty evidence', () => {
  const forecast = {
    available: true,
    current: 100,
    center: 104,
    decisionState: 'PUBLISHABLE',
    points: [{ bar: 1, price: 101, change: 0.01, ranges: { 80: [95, 107] } }],
    ranges: { 80: [90, 110] },
  };
  const policy = marketSessionPolicy({ provider: 'yahoo', meta: { marketState: 'CLOSED' }, interval: '5m' });
  const gated = applySessionForecastPolicy(forecast, policy);
  assert.equal(gated.decisionState, 'ABSTAIN');
  assert.equal(gated.center, null);
  assert.equal(gated.points[0].price, null);
  assert.deepEqual(gated.ranges[80], [90, 110]);
  assert.match(gated.abstainReason, /closed|session/i);
});
