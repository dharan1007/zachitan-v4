import test from 'node:test';
import assert from 'node:assert/strict';
import { auditNextBar } from '../lib/next-bar-audit.mjs';

function completedCandles(count = 235, { missingVolume = false } = {}) {
  // Deterministic, generated TEST FIXTURE only; never displayed as market data.
  const out = [];
  let previous = 100;
  for (let i = 0; i < count; i++) {
    const open = previous;
    const close = open * Math.exp(0.0002 + 0.006 * Math.sin(i * 0.31) + 0.001 * Math.cos(i * 0.51));
    const high = Math.max(open, close) * 1.004;
    const low = Math.min(open, close) * 0.996;
    out.push({
      time: 1_700_000_000 + i * 300, open, high, low, close,
      volume: missingVolume ? 0 : 100 + 20 * Math.sin(i * 0.27),
    });
    previous = close;
  }
  return out;
}

test('no history cannot be presented as a measured forecast', () => {
  const result = auditNextBar(completedCandles(110));
  assert.equal(result.available, false);
  assert.equal(result.checks, 0);
});

test('separate OHLCV outputs preserve candle inequalities and measured sample counts', () => {
  const result = auditNextBar(completedCandles());
  assert.equal(result.available, true);
  for (const field of ['open', 'high', 'low', 'close', 'volume']) {
    assert.ok(result.forecast[field] > 0, field);
    assert.ok(result.accuracy[field].samples > 0, field);
    assert.ok(Number.isFinite(result.accuracy[field].maePct), field);
  }
  assert.ok(result.forecast.high >= Math.max(result.forecast.open, result.forecast.close));
  assert.ok(result.forecast.low <= Math.min(result.forecast.open, result.forecast.close));
  assert.equal(result.asIssuedLiveRecord, false);
  assert.equal(result.type, 'historical-prequential-reconstruction');
});

test('no reported volume means no invented volume forecast or zero-valued MAE', () => {
  const result = auditNextBar(completedCandles(235, { missingVolume: true }));
  assert.equal(result.available, true);
  assert.equal(result.forecast.volume, null);
  assert.equal(result.accuracy.volume.samples, 0);
  assert.equal(result.accuracy.volume.maePct, null);
  assert.equal(result.empirical80.volume, null);
});

test('forward reconstruction is exactly consistent with preceding issued forecast', () => {
  const rows = completedCandles(245);
  const before = auditNextBar(rows.slice(0, -1));
  const after = auditNextBar(rows);
  assert.equal(before.available, true);
  assert.equal(after.available, true);
  const latestMatured = after.history.at(-1);
  assert.equal(latestMatured.originTime, undefined);
  assert.equal(latestMatured.issuedAt, rows.at(-2).time);
  assert.equal(latestMatured.observedAt, rows.at(-1).time);
  for (const field of ['open', 'high', 'low', 'close', 'volume']) {
    assert.equal(before.forecast[field], latestMatured.predicted[field], field);
  }
});

test('future changes cannot alter a historical forecast', () => {
  const rows = completedCandles(245);
  const earlier = auditNextBar(rows.slice(0, -1));
  const contaminated = [...rows.slice(0, -1), {
    ...rows.at(-1), open: 500, high: 990, low: 20, close: 700, volume: 50_000,
  }];
  const replay = auditNextBar(contaminated);
  assert.equal(replay.available, true);
  const latestMatured = replay.history.at(-1);
  for (const field of ['open', 'high', 'low', 'close', 'volume']) {
    assert.equal(earlier.forecast[field], latestMatured.predicted[field], field);
  }
});

test('empirical 80 percent coverage is scored exclusively after observation', () => {
  const audit = auditNextBar(completedCandles(235));
  for (const field of ['open', 'high', 'low', 'close', 'volume']) {
    const coverage = audit.intervalCoverage[field];
    assert.equal(coverage.nominal, 0.8);
    assert.ok(coverage.observed === null || (coverage.observed >= 0 && coverage.observed <= 1));
    if (coverage.observed != null) assert.ok(coverage.checks > 0);
  }
});

test('inspection and accuracy computation have a bounded evaluation window', () => {
  const audit = auditNextBar(completedCandles(270), { maxChecks: 5000 });
  assert.equal(audit.available, true);
  assert.ok(audit.checks <= 88); // Up to 56 evaluation origins plus 32 burn-in origins.
  assert.ok(audit.evaluationChecks <= 24);
  assert.ok(audit.history.length <= 24);
});
