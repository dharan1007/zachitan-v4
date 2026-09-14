import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCandles } from '../lib/market-integrity-v6.mjs';

test('Yahoo intraday overnight closures are not missing-data gaps', () => {
  const a = Math.floor(Date.parse('2026-09-10T19:50:00Z') / 1000);
  const b = Math.floor(Date.parse('2026-09-11T13:30:00Z') / 1000);
  const rows = [a, a + 300, a + 600, b, b + 300].map((time, i) => ({ time, open: 100 + i * 0.1, high: 101 + i * 0.1, low: 99 + i * 0.1, close: 100.2 + i * 0.1, volume: 10 + i }));
  const out = normalizeCandles(rows, { provider: 'yahoo', interval: '5m', timezone: 'America/New_York' });
  assert.equal(out.diagnostics.largeGapCount, 0);
  assert.equal(out.diagnostics.expectedClosureGapCount, 1);
  assert.equal(out.diagnostics.status, 'CLEAN');
});

test('Yahoo intraday same-session outages remain real large gaps', () => {
  const start = Math.floor(Date.parse('2026-09-11T14:00:00Z') / 1000);
  const rows = [0, 300, 600, 4800, 5100].map((offset, i) => ({ time: start + offset, open: 100 + i * 0.1, high: 101 + i * 0.1, low: 99 + i * 0.1, close: 100.2 + i * 0.1, volume: 10 + i }));
  const out = normalizeCandles(rows, { provider: 'yahoo', interval: '5m', timezone: 'America/New_York' });
  assert.equal(out.diagnostics.expectedClosureGapCount, 0);
  assert.equal(out.diagnostics.largeGapCount, 1);
  assert.equal(out.diagnostics.status, 'DEGRADED');
});
