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
  assert.ok(['CLEAN', 'DEGRADED', 'CRITICAL'].includes(out.diagnostics.status));
});

test('integrity diagnostics mark heavily corrupted input critical', () => {
  const raw = [];
  for (let i = 1; i <= 20; i++) raw.push({ time: i * 60, open: 100, high: 101, low: 99, close: 100, volume: 10 });
  for (let i = 21; i <= 28; i++) raw.push({ time: i * 60, open: 100, high: 98, low: 99, close: 100, volume: 10 });
  const out = normalizeCandles(raw);
  assert.equal(out.diagnostics.critical, true);
  assert.equal(out.diagnostics.status, 'CRITICAL');
  assert.match(out.diagnostics.reason || '', /invalid|integrity|corrupt/i);
});

test('Yahoo intraday overnight closures are not misclassified as missing-data gaps', () => {
  const base = Math.floor(Date.parse('2026-09-10T19:50:00Z') / 1000);
  const raw = [
    { time: base, open: 100, high: 101, low: 99, close: 100, volume: 10 },
    { time: base + 300, open: 100, high: 101, low: 99, close: 100.2, volume: 11 },
    { time: base + 600, open: 100.2, high: 101, low: 99, close: 100.3, volume: 12 },
    { time: Math.floor(Date.parse('2026-09-11T13:30:00Z') / 1000), open: 101, high: 102, low: 100, close: 101.2, volume: 13 },
    { time: Math.floor(Date.parse('2026-09-11T13:35:00Z') / 1000), open: 101.2, high: 102, low: 100, close: 101.4, volume: 14 },
  ];
  const out = normalizeCandles(raw, { provider: 'yahoo', interval: '5m', timezone: 'America/New_York' });
  assert.equal(out.diagnostics.largeGapCount, 0);
  assert.equal(out.diagnostics.expectedClosureGapCount, 1);
  assert.equal(out.diagnostics.status, 'CLEAN');
});

test('Yahoo intraday same-session outages still count as real large gaps', () => {
  const start = Math.floor(Date.parse('2026-09-11T14:00:00Z') / 1000);
  const raw = [0, 300, 600, 4200, 4500].map((offset, i) => ({
    time: start + offset,
    open: 100 + i * 0.1,
    high: 101 + i * 0.1,
    low: 99 + i * 0.1,
    close: 100.2 + i * 0.1,
    volume: 10 + i,
  }));
  const out = normalizeCandles(raw, { provider: 'yahoo', interval: '5m', timezone: 'America/New_York' });
  assert.equal(out.diagnostics.expectedClosureGapCount, 0);
  assert.equal(out.diagnostics.largeGapCount, 1);
  assert.equal(out.diagnostics.status, 'DEGRADED');
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

test('reference sources are explicit publication-cadence data and never background-polled', () => {
  for (const provider of ['amfi', 'ecb']) {
    const policy = marketSessionPolicy({ provider, meta: {}, interval: '1d' });
    assert.equal(policy.state, 'REFERENCE');
    assert.equal(policy.autoRefreshMs, null);
    assert.equal(policy.transport, 'scheduled-reference-publication');
  }
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

test('critical data integrity overrides an otherwise publishable session', () => {
  const forecast = {
    available: true,
    current: 100,
    center: 103,
    decisionState: 'PUBLISHABLE',
    points: [{ bar: 1, price: 101, change: 0.01 }],
  };
  const policy = marketSessionPolicy({ provider: 'coinbase', meta: {}, interval: '5m' });
  const gated = applySessionForecastPolicy(forecast, policy, { critical: true, reason: 'Market data integrity is critical.' });
  assert.equal(gated.decisionState, 'ABSTAIN');
  assert.equal(gated.center, null);
  assert.equal(gated.points[0].price, null);
  assert.equal(gated.modelStatus, 'data-integrity-abstain');
  assert.match(gated.abstainReason, /integrity/i);
});
