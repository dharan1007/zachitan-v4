import test from 'node:test';
import assert from 'node:assert/strict';
import { quantile, weightedQuantile, forecast, validate, indicators, microstructure, calibrationScore, candidateForecasts, ensembleForecast } from '../lib/forecast.mjs';

function series(n = 1200, flat = false) {
  const out = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const drift = flat ? 0 : 0.00025 + Math.sin(i / 31) * 0.0012;
    const shock = flat ? 0 : Math.sin(i * 1.7) * 0.002 + Math.cos(i / 7) * 0.001;
    p *= Math.exp(drift + shock);
    const o = flat ? p : p * (1 - Math.sin(i) * 0.0008);
    const c = p;
    const h = flat ? p : Math.max(o, c) * (1.003 + Math.abs(Math.sin(i)) * 0.001);
    const l = flat ? p : Math.min(o, c) * (0.997 - Math.abs(Math.cos(i)) * 0.001);
    out.push({ time: 1700000000 + i * 300, open: o, high: h, low: l, close: c, volume: 1000 + (flat ? 0 : 200 * Math.sin(i / 5) + i % 17) });
  }
  return out;
}

function withTerminalJump(multiplier = 1.45) {
  const out = series();
  const prev = out.at(-2).close;
  const close = prev * multiplier;
  out[out.length - 1] = {
    ...out.at(-1),
    open: prev * 1.01,
    close,
    high: close * 1.01,
    low: prev * 0.995,
    volume: out.at(-2).volume * 9,
  };
  return out;
}

test('quantile interpolates', () => assert.equal(quantile([1, 2, 3, 4], .5), 2.5));
test('weighted quantile honors weight', () => assert.equal(weightedQuantile([1, 10], [.9, .1], .5), 1));

test('candidate forecasts always include the no-change baseline and finite deterministic candidates', () => {
  const c = candidateForecasts(series(), 12);
  assert.equal(c.noChange, 0);
  assert.ok(Number.isFinite(c.momentum));
  assert.ok(Number.isFinite(c.regime));
  assert.ok(Number.isFinite(c.analogue));
});

test('ensemble weights are normalized and expose disagreement', () => {
  const e = ensembleForecast(series(), 12, null);
  assert.equal(e.available, true);
  const weights = Object.values(e.weights);
  assert.ok(Math.abs(weights.reduce((s, x) => s + x, 0) - 1) < 1e-9);
  assert.ok(weights.every(x => x >= 0 && x <= 1));
  assert.ok(Number.isFinite(e.return));
  assert.ok(Number.isFinite(e.disagreement));
});

test('ensemble shrinks the published return toward zero when candidate disagreement is high', () => {
  const out = series();
  for (let i = out.length - 30; i < out.length; i++) {
    const direction = i % 2 ? 1.06 : 0.94;
    const prev = out[i - 1].close;
    const close = prev * direction;
    out[i] = { ...out[i], open: prev, close, high: Math.max(prev, close) * 1.002, low: Math.min(prev, close) * 0.998 };
  }
  const e = ensembleForecast(out, 12, null);
  assert.equal(e.available, true);
  assert.ok(Math.abs(e.return) <= Math.max(...Object.values(e.candidates).map(Math.abs)) + 1e-12);
  assert.ok(e.shrink >= 0 && e.shrink <= 1);
});

test('forecast emits ordered checkpoints and dependence-adjusted evidence', () => {
  const f = forecast(series(), 20);
  assert.equal(f.available, true);
  assert.ok(f.points.length >= 4 && f.points.length <= 5);
  assert.ok(f.effectiveN > 0);
  assert.ok(f.effectiveN <= f.rawEffectiveN + 1e-9);
  for (let i = 1; i < f.points.length; i++) assert.ok(f.points[i].bar > f.points[i - 1].bar);
});

test('forecast exposes ensemble diagnostics while keeping empirical uncertainty', () => {
  const f = forecast(series(), 12);
  assert.equal(f.available, true);
  assert.equal(f.pointModel, 'adaptive-ensemble-v1');
  assert.ok(f.ensemble?.available);
  assert.ok(Number.isFinite(f.ensemble.return));
  assert.ok(f.ranges[50][0] <= f.ranges[50][1]);
});

test('forecast probability and interval bounds are valid', () => {
  const f = forecast(series(), 12);
  assert.ok(f.evidenceScore >= 0 && f.evidenceScore <= 100);
  assert.equal(f.calibrationScore, null);
  assert.ok(f.direction.up >= 0 && f.direction.up <= 1);
  assert.ok(f.direction.down >= 0 && f.direction.down <= 1);
  assert.ok(Math.abs(f.direction.up + f.direction.down - 1) < 1e-9);
  for (const k of [50, 80, 90]) assert.ok(f.ranges[k][0] <= f.ranges[k][1]);
});

test('forecast abstains after an extreme terminal jump instead of publishing a point target', () => {
  const f = forecast(withTerminalJump(), 12);
  assert.equal(f.available, true);
  assert.equal(f.decisionState, 'ABSTAIN');
  assert.equal(f.center, null);
  assert.match(f.abstainReason || '', /jump|regime|out-of-distribution/i);
});

test('forecast abstains when measured point and probability skill are both non-positive', () => {
  const validation = {
    available: true,
    checks: 60,
    skillVsNoChange: -0.08,
    ensembleSkillVsNoChange: -0.08,
    brierSkillVs50: -0.04,
    coverage: { 50: 0.5, 80: 0.8, 90: 0.9 },
  };
  const f = forecast(series(), 12, validation);
  assert.equal(f.available, true);
  assert.equal(f.decisionState, 'ABSTAIN');
  assert.equal(f.center, null);
  assert.match(f.abstainReason || '', /skill|baseline/i);
});

test('validation is non-overlapping and reports ensemble and legacy baseline skill separately', () => {
  const v = validate(series(1600), 10, 60);
  assert.equal(v.available, true);
  assert.ok(v.checks >= 18);
  assert.equal(v.nonOverlapping, true);
  assert.ok(v.originGapMin >= 10);
  assert.ok(Number.isFinite(v.maseNoChange));
  assert.ok(Number.isFinite(v.skillVsNoChange));
  assert.ok(Number.isFinite(v.ensembleSkillVsNoChange));
  assert.ok(Number.isFinite(v.legacyAnalogueSkillVsNoChange));
  assert.ok(Number.isFinite(v.brier));
  assert.ok(Number.isFinite(v.brierSkillVs50));
  assert.ok(v.directionAccuracy >= 0 && v.directionAccuracy <= 1);
  assert.ok(v.ensembleDirectionAccuracy >= 0 && v.ensembleDirectionAccuracy <= 1);
  assert.ok(v.momentumDirectionAccuracy >= 0 && v.momentumDirectionAccuracy <= 1);
  for (const key of ['noChange', 'momentum', 'regime', 'analogue', 'ensemble']) assert.ok(Number.isFinite(v.candidateMae[key]));
});

test('calibration is unavailable without validation and bounded with validation', () => {
  assert.equal(calibrationScore(null), null);
  const v = validate(series(1600), 10, 60);
  const s = calibrationScore(v);
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 100);
});

test('flat market RSI is neutral instead of falsely overbought', () => {
  const x = indicators(series(300, true));
  assert.equal(x.rsi14, 50);
});

test('indicators are finite on ordinary data', () => {
  const x = indicators(series());
  assert.ok(Number.isFinite(x.rsi14));
  assert.ok(Number.isFinite(x.atrPct));
});

test('microstructure computes imbalance', () => {
  const m = microstructure({ bids: [{ price: 99, size: 2 }], asks: [{ price: 101, size: 1 }] }, [{ price: 100, size: 1, makerSide: 'sell' }]);
  assert.ok(m.bookImbalance > 0);
  assert.ok(m.tradeImbalance > 0);
  assert.equal(m.spreadBps, 200);
});
