import { mean } from './forecast.mjs';

const EPS = 1e-12;

function quantile(values, q) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const p = Math.max(0, Math.min(1, q)) * (xs.length - 1);
  const lo = Math.floor(p), hi = Math.ceil(p), f = p - lo;
  return xs[lo] * (1 - f) + xs[hi] * f;
}

function metrics(rows) {
  if (!rows.length) return { pointSkillVsNoChange: null, brierSkillVs50: null, directionAccuracy: null, modelMae: null, naiveMae: null, brier: null };
  const modelMae = mean(rows.map(r => r.absLogError));
  const naiveMae = mean(rows.map(r => r.naiveAbsLogError));
  const brier = mean(rows.map(r => (r.pUp - r.outcomeUp) ** 2));
  return {
    pointSkillVsNoChange: naiveMae > EPS ? 1 - modelMae / naiveMae : null,
    brierSkillVs50: Number.isFinite(brier) ? 1 - brier / 0.25 : null,
    directionAccuracy: mean(rows.map(r => r.directionCorrect ? 1 : 0)),
    modelMae,
    naiveMae,
    brier,
  };
}

function rng(seed) {
  let state = seed >>> 0;
  return () => ((state = (1664525 * state + 1013904223) >>> 0) / 0x100000000);
}

function interval(rows, key, seed) {
  const actual = metrics(rows)[key];
  if (rows.length < 2) return [actual, actual];
  const random = rng(seed + rows.length * 97), values = [];
  for (let b = 0; b < 240; b++) {
    const sample = [];
    for (let i = 0; i < rows.length; i++) sample.push(rows[Math.floor(random() * rows.length)]);
    values.push(metrics(sample)[key]);
  }
  const lo = quantile(values, 0.05), hi = quantile(values, 0.95);
  return [Math.min(actual, lo ?? actual), Math.max(actual, hi ?? actual)];
}

function cleanRows(rows) {
  return (rows || []).filter(r => Number.isFinite(r?.absLogError) && Number.isFinite(r?.naiveAbsLogError) && r.naiveAbsLogError >= 0 && Number.isFinite(r?.pUp) && r.pUp >= 0 && r.pUp <= 1 && (r.outcomeUp === 0 || r.outcomeUp === 1));
}

export function assessHoldoutRows(inputRows = [], { minimumChecks = 8 } = {}) {
  const rows = cleanRows(inputRows);
  if (rows.length < minimumChecks) return {
    available: false,
    qualified: false,
    state: 'INSUFFICIENT',
    checks: rows.length,
    minimumChecks,
    reason: `Need at least ${minimumChecks} untouched non-overlapping holdout checks; only ${rows.length} were available.`,
    drift: { detected: false, recentChecks: 0, reason: 'Insufficient holdout history for drift assessment.' },
    confidence: { pointSkill90: [null, null], brierSkill90: [null, null] },
  };

  const all = metrics(rows);
  const recentCount = Math.max(4, Math.min(8, Math.floor(rows.length / 3)));
  const recent = metrics(rows.slice(-recentCount));
  const reference = metrics(rows.slice(0, -recentCount));
  const pointDrop = Number.isFinite(reference.pointSkillVsNoChange) && Number.isFinite(recent.pointSkillVsNoChange) ? reference.pointSkillVsNoChange - recent.pointSkillVsNoChange : null;
  const brierDrop = Number.isFinite(reference.brierSkillVs50) && Number.isFinite(recent.brierSkillVs50) ? reference.brierSkillVs50 - recent.brierSkillVs50 : null;
  const driftDetected = (recent.pointSkillVsNoChange ?? -Infinity) < 0 || (recent.brierSkillVs50 ?? -Infinity) < 0 || (Number.isFinite(pointDrop) && pointDrop > 0.10) || (Number.isFinite(brierDrop) && brierDrop > 0.10);
  const pointSkill90 = interval(rows, 'pointSkillVsNoChange', 0x9411);
  const brierSkill90 = interval(rows, 'brierSkillVs50', 0x3481);
  const positive = (all.pointSkillVsNoChange ?? -Infinity) > 0 && (all.brierSkillVs50 ?? -Infinity) > 0;
  const confidenceTolerant = (pointSkill90[0] ?? -Infinity) > -0.05 && (brierSkill90[0] ?? -Infinity) > -0.05;
  const qualified = positive && confidenceTolerant && !driftDetected;
  const reason = qualified ? null : driftDetected ? 'Recent untouched holdout skill deteriorated; publication is withheld until the drift clears.' : !positive ? 'Untouched holdout did not beat both unchanged-price and 50/50 probability baselines.' : 'Untouched holdout uncertainty is too wide to qualify numeric publication.';
  return {
    available: true, qualified, state: qualified ? 'QUALIFIED' : 'UNQUALIFIED', checks: rows.length, minimumChecks,
    ...all,
    confidence: { pointSkill90, brierSkill90 },
    drift: { detected: driftDetected, recentChecks: recentCount, recentPointSkill: recent.pointSkillVsNoChange, recentBrierSkill: recent.brierSkillVs50, referencePointSkill: reference.pointSkillVsNoChange, referenceBrierSkill: reference.brierSkillVs50, pointSkillDrop: pointDrop, brierSkillDrop: brierDrop, reason: driftDetected ? 'Recent holdout performance is below baseline or materially weaker than the earlier holdout window.' : null },
    reason,
  };
}
