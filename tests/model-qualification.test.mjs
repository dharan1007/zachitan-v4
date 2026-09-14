import test from 'node:test';
import assert from 'node:assert/strict';
import { assessHoldoutRows } from '../lib/model-qualification.mjs';
import { forecastV6 as forecast } from '../lib/model-v6.mjs';

function series(n = 1200) {
  const out = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const drift = 0.0003 + Math.sin(i / 31) * 0.0011;
    const shock = Math.sin(i * 1.7) * 0.0018 + Math.cos(i / 7) * 0.0009;
    p *= Math.exp(drift + shock);
    const open = p * (1 - Math.sin(i) * 0.0007);
    out.push({
      time: 1700000000 + i * 300,
      open,
      high: Math.max(open, p) * 1.003,
      low: Math.min(open, p) * 0.997,
      close: p,
      volume: 1000 + 150 * Math.sin(i / 5) + (i % 17),
    });
  }
  return out;
}

const positiveValidation = {
  available: true,
  checks: 40,
  ensembleSkillVsNoChange: 0.04,
  skillVsNoChange: 0.04,
  brierSkillVs50: 0.03,
  probabilityCalibrationAlpha: 0.25,
  candidateMae: { noChange: 0.02, momentum: 0.021, regime: 0.022, analogue: 0.02, ensemble: 0.019 },
  coverage: { 50: 0.5, 80: 0.8, 90: 0.9 },
};

test('frozen holdout assessment qualifies only sustained positive point and probability skill', () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({
    origin: i * 12,
    absLogError: 0.010,
    naiveAbsLogError: 0.020,
    pUp: i % 2 ? 0.30 : 0.70,
    outcomeUp: i % 2 ? 0 : 1,
    directionCorrect: true,
  }));
  const q = assessHoldoutRows(rows, { minimumChecks: 8 });
  assert.equal(q.available, true);
  assert.equal(q.qualified, true);
  assert.equal(q.state, 'QUALIFIED');
  assert.ok(q.pointSkillVsNoChange > 0);
  assert.ok(q.brierSkillVs50 > 0);
  assert.equal(q.drift.detected, false);
  assert.ok(q.confidence.pointSkill90[0] <= q.pointSkillVsNoChange && q.confidence.pointSkill90[1] >= q.pointSkillVsNoChange);
  assert.ok(q.confidence.brierSkill90[0] <= q.brierSkillVs50 && q.confidence.brierSkill90[1] >= q.brierSkillVs50);
});

test('recent holdout deterioration is a drift fail-closed signal', () => {
  const good = Array.from({ length: 12 }, (_, i) => ({
    origin: i * 12,
    absLogError: 0.008,
    naiveAbsLogError: 0.020,
    pUp: 0.72,
    outcomeUp: 1,
    directionCorrect: true,
  }));
  const bad = Array.from({ length: 6 }, (_, i) => ({
    origin: (12 + i) * 12,
    absLogError: 0.032,
    naiveAbsLogError: 0.020,
    pUp: 0.72,
    outcomeUp: 0,
    directionCorrect: false,
  }));
  const q = assessHoldoutRows([...good, ...bad], { minimumChecks: 8 });
  assert.equal(q.available, true);
  assert.equal(q.qualified, false);
  assert.equal(q.state, 'UNQUALIFIED');
  assert.equal(q.drift.detected, true);
  assert.ok(q.drift.recentPointSkill < 0);
  assert.ok(q.drift.recentBrierSkill < 0);
});

test('too few untouched holdout checks remain research-only', () => {
  const q = assessHoldoutRows(Array.from({ length: 4 }, (_, i) => ({
    origin: i * 12,
    absLogError: 0.005,
    naiveAbsLogError: 0.020,
    pUp: 0.8,
    outcomeUp: 1,
    directionCorrect: true,
  })), { minimumChecks: 8 });
  assert.equal(q.available, false);
  assert.equal(q.qualified, false);
  assert.equal(q.state, 'INSUFFICIENT');
});

test('positive walk-forward validation cannot publish without untouched holdout qualification', () => {
  const f = forecast(series(), 12, positiveValidation, null);
  assert.equal(f.decisionState, 'RESEARCH_ONLY');
  assert.equal(f.center, null);
  assert.ok(f.points.every(point => point.price === null && point.change === null));
  assert.match(f.modelStatus, /holdout|qualification/i);
});

test('qualified untouched holdout can unlock a validated forecast', () => {
  const qualification = {
    available: true,
    qualified: true,
    state: 'QUALIFIED',
    pointSkillVsNoChange: 0.05,
    brierSkillVs50: 0.02,
    drift: { detected: false },
  };
  const f = forecast(series(), 12, positiveValidation, qualification);
  assert.equal(f.decisionState, 'PUBLISHABLE');
  assert.ok(Number.isFinite(f.center));
  assert.ok(f.points.some(point => Number.isFinite(point.price)));
});

test('failed untouched holdout forces abstention despite positive walk-forward validation', () => {
  const qualification = {
    available: true,
    qualified: false,
    state: 'UNQUALIFIED',
    pointSkillVsNoChange: -0.02,
    brierSkillVs50: 0.01,
    drift: { detected: true },
    reason: 'Recent holdout skill deteriorated.',
  };
  const f = forecast(series(), 12, positiveValidation, qualification);
  assert.equal(f.decisionState, 'ABSTAIN');
  assert.equal(f.center, null);
  assert.match(f.abstainReason || '', /holdout|deteriorated|drift/i);
});
