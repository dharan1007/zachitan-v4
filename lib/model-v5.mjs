import {
  forecast as legacyForecast,
  regimeDiagnostics,
  calibrationScore as scoreCalibration,
  clamp,
  mean,
  median,
  stdev,
} from './forecast.mjs';

const EPS = 1e-12;
const CANDIDATE_NAMES = ['noChange', 'momentum', 'regime', 'analogue'];

function closeSeries(candles) {
  return (candles || []).map(x => +x.close);
}

function logReturn(close, end, lookback) {
  const start = end - lookback;
  return start >= 0 && close[start] > 0 && close[end] > 0
    ? Math.log(close[end] / close[start])
    : 0;
}

function avg(values, end, window) {
  const start = end - window + 1;
  if (start < 0) return NaN;
  let total = 0;
  for (let i = start; i <= end; i++) total += values[i];
  return total / window;
}

function realizedVol(close, end, window = 30) {
  const rows = [];
  for (let i = Math.max(1, end - window + 1); i <= end; i++) {
    if (close[i - 1] > 0 && close[i] > 0) rows.push(Math.log(close[i] / close[i - 1]));
  }
  return rows.length >= 5 ? stdev(rows) : 0;
}

function finiteOrZero(x) {
  return Number.isFinite(x) ? x : 0;
}

function normalizeWeights(raw) {
  const clean = CANDIDATE_NAMES.map(name => Math.max(0, finiteOrZero(raw?.[name])));
  let total = clean.reduce((s, x) => s + x, 0);
  if (!(total > EPS)) {
    const equal = 1 / CANDIDATE_NAMES.length;
    return Object.fromEntries(CANDIDATE_NAMES.map(name => [name, equal]));
  }
  let weights = Object.fromEntries(CANDIDATE_NAMES.map((name, i) => [name, clean[i] / total]));

  // The no-change model always retains a floor weight. A more complex model
  // must earn the right to move the published center away from the baseline.
  const floor = 0.10;
  if (weights.noChange < floor) {
    const remaining = 1 - floor;
    const otherTotal = 1 - weights.noChange;
    weights = Object.fromEntries(CANDIDATE_NAMES.map(name => [
      name,
      name === 'noChange' ? floor : otherTotal > EPS ? weights[name] / otherTotal * remaining : remaining / 3,
    ]));
  }
  total = Object.values(weights).reduce((s, x) => s + x, 0);
  return Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v / total]));
}

export function weightsFromCandidateMae(candidateMae = null) {
  if (!candidateMae || !CANDIDATE_NAMES.every(name => Number.isFinite(candidateMae[name]))) {
    return normalizeWeights({ noChange: 1, momentum: 1, regime: 1, analogue: 1 });
  }
  const errors = CANDIDATE_NAMES.map(name => Math.max(EPS, candidateMae[name]));
  const scale = median(errors) || mean(errors) || 0.01;
  const raw = {};
  for (const name of CANDIDATE_NAMES) {
    raw[name] = Math.exp(-2.5 * candidateMae[name] / Math.max(EPS, scale));
  }
  return normalizeWeights(raw);
}

function combineCandidates(candidates, weights, candles, horizon) {
  const values = CANDIDATE_NAMES.map(name => finiteOrZero(candidates[name]));
  const weighted = CANDIDATE_NAMES.reduce((s, name) => s + weights[name] * finiteOrZero(candidates[name]), 0);
  const disagreement = Math.sqrt(CANDIDATE_NAMES.reduce((s, name) => {
    const d = finiteOrZero(candidates[name]) - weighted;
    return s + weights[name] * d * d;
  }, 0));
  const close = closeSeries(candles);
  const vol = realizedVol(close, close.length - 1, 30);
  const expectedScale = Math.max(0.002, vol * Math.sqrt(Math.max(1, horizon)));
  const disagreementRatio = disagreement / expectedScale;
  const shrink = clamp(1 / (1 + 1.75 * disagreementRatio), 0.20, 1);
  return {
    return: weighted * shrink,
    rawReturn: weighted,
    disagreement,
    disagreementRatio,
    shrink,
    candidateRange: [Math.min(...values), Math.max(...values)],
  };
}

function legacyAnalogueReturn(candles, horizon, legacy = null) {
  const current = candles?.at(-1)?.close;
  const f = legacy || legacyForecast(candles, horizon, null);
  if (!(current > 0) || !f?.available) return 0;
  const target = Number.isFinite(f.center) ? f.center : null;
  return target > 0 ? Math.log(target / current) : 0;
}

export function candidateForecasts(candles, horizon = 12, legacy = null) {
  if (!Array.isArray(candles) || candles.length < 70 || horizon < 1) {
    return { noChange: 0, momentum: 0, regime: 0, analogue: 0 };
  }
  const close = closeSeries(candles);
  const i = close.length - 1;
  const shortLook = Math.max(3, Math.min(12, horizon));
  const longLook = Math.max(shortLook + 1, Math.min(50, horizon * 2));
  const rShort = logReturn(close, i, shortLook);
  const rLong = logReturn(close, i, longLook);
  const momentum = 0.55 * rShort * Math.sqrt(Math.max(1, horizon) / shortLook);

  const sma20 = avg(close, i, 20);
  const sma50 = avg(close, i, 50);
  const displacement = sma20 > 0 && close[i] > 0 ? Math.log(close[i] / sma20) : 0;
  const trend = sma20 > 0 && sma50 > 0 ? Math.log(sma20 / sma50) : 0;
  const vol = Math.max(realizedVol(close, i, 30), 0.0005);
  const trendStrength = Math.abs(trend) / vol;
  const horizonScale = Math.sqrt(Math.max(1, horizon) / 12);
  const regime = trendStrength >= 1.25
    ? clamp(0.40 * rLong * horizonScale, -6 * vol * Math.sqrt(horizon), 6 * vol * Math.sqrt(horizon))
    : clamp(-0.35 * displacement * horizonScale + 0.15 * rShort, -4 * vol * Math.sqrt(horizon), 4 * vol * Math.sqrt(horizon));

  return {
    noChange: 0,
    momentum: finiteOrZero(momentum),
    regime: finiteOrZero(regime),
    analogue: finiteOrZero(legacyAnalogueReturn(candles, horizon, legacy)),
  };
}

export function ensembleForecast(candles, horizon = 12, validation = null, legacy = null) {
  const current = candles?.at(-1)?.close;
  if (!(current > 0)) return { available: false, reason: 'No valid current price' };
  const candidates = candidateForecasts(candles, horizon, legacy);
  const weights = weightsFromCandidateMae(validation?.candidateMae);
  const combined = combineCandidates(candidates, weights, candles, horizon);
  return {
    available: true,
    current,
    candidates,
    weights,
    ...combined,
  };
}

export function calibrateProbabilityAlpha(history = []) {
  const rows = (history || []).filter(row => Number.isFinite(row?.rawPUp) && (row?.outcomeUp === 0 || row?.outcomeUp === 1));
  if (rows.length < 4) return 0;
  let numerator = 0;
  let denominator = 0;
  for (const row of rows) {
    const signal = clamp(row.rawPUp, 0, 1) - 0.5;
    const outcome = row.outcomeUp - 0.5;
    numerator += signal * outcome;
    denominator += signal * signal;
  }
  if (!(denominator > EPS)) return 0;
  return clamp(numerator / denominator, 0, 1);
}

export function calibratedProbability(rawPUp, alpha = 0) {
  const raw = clamp(Number.isFinite(rawPUp) ? rawPUp : 0.5, 1e-6, 1 - 1e-6);
  const a = clamp(Number.isFinite(alpha) ? alpha : 0, 0, 1);
  return clamp(0.5 + a * (raw - 0.5), 1e-6, 1 - 1e-6);
}

function probabilityMetrics(pUp, outcomeUp) {
  const p = clamp(pUp, 1e-6, 1 - 1e-6);
  return {
    brier: (p - outcomeUp) ** 2,
    logLoss: -(outcomeUp * Math.log(p) + (1 - outcomeUp) * Math.log(1 - p)),
    confidence: Math.max(p, 1 - p),
  };
}

function errorMean(rows, key) {
  const values = rows.map(r => r[key]).filter(Number.isFinite);
  return values.length ? mean(values) : null;
}

function candidateWeightsFromHistory(history) {
  const candidateMae = {};
  for (const name of CANDIDATE_NAMES) {
    candidateMae[name] = history[name]?.length ? mean(history[name]) : NaN;
  }
  return weightsFromCandidateMae(candidateMae);
}

export function validateEnsemble(candles, horizon = 12, maxChecks = 80) {
  if (!Array.isArray(candles) || candles.length < 300 + horizon) {
    return { available: false, checks: 0, reason: 'Need more chronological history.' };
  }
  const lastOrigin = candles.length - horizon - 1;
  const earliest = Math.max(210, Math.floor(candles.length * 0.30));
  if (lastOrigin <= earliest) return { available: false, checks: 0, reason: 'Too little validation span.' };
  const rawStep = Math.floor((lastOrigin - earliest) / Math.max(1, maxChecks - 1));
  const step = Math.max(horizon, rawStep, 1);
  const origins = [];
  for (let i = earliest; i <= lastOrigin; i += step) origins.push(i);
  if (origins.at(-1) !== lastOrigin && lastOrigin - (origins.at(-1) || earliest) >= horizon) origins.push(lastOrigin);

  const history = Object.fromEntries(CANDIDATE_NAMES.map(name => [name, []]));
  const probabilityHistory = [];
  const rec = [];
  for (const i of origins.slice(-maxChecks)) {
    const prefix = candles.slice(0, i + 1);
    const legacy = legacyForecast(prefix, horizon, null);
    if (!legacy?.available || !Number.isFinite(legacy.current)) continue;
    const actual = candles[i + horizon]?.close;
    const now = candles[i]?.close;
    if (!(actual > 0 && now > 0)) continue;
    const actualReturn = Math.log(actual / now);
    const candidates = candidateForecasts(prefix, horizon, legacy);
    const weights = candidateWeightsFromHistory(history);
    const combined = combineCandidates(candidates, weights, prefix, horizon);
    const legacyReturn = candidates.analogue;
    const ensembleReturn = combined.return;
    const rawPUp = clamp(legacy.direction?.up ?? 0.5, 1e-6, 1 - 1e-6);
    const probabilityAlpha = calibrateProbabilityAlpha(probabilityHistory);
    const pUp = calibratedProbability(rawPUp, probabilityAlpha);
    const outcomeUp = actualReturn > 0 ? 1 : 0;
    const prob = probabilityMetrics(pUp, outcomeUp);
    const row = {
      origin: i,
      actualReturn,
      ensembleReturn,
      legacyReturn,
      absLogError: Math.abs(actualReturn - ensembleReturn),
      legacyAbsLogError: Math.abs(actualReturn - legacyReturn),
      naiveAbsLogError: Math.abs(actualReturn),
      directionCorrect: Math.sign(ensembleReturn) !== 0 && Math.sign(ensembleReturn) === Math.sign(actualReturn),
      legacyDirectionCorrect: Math.sign(legacyReturn) !== 0 && Math.sign(legacyReturn) === Math.sign(actualReturn),
      momentumDirectionCorrect: Math.sign(candidates.momentum) !== 0 && Math.sign(candidates.momentum) === Math.sign(actualReturn),
      rawPUp,
      probabilityAlpha,
      pUp,
      outcomeUp,
      ...prob,
      ranges: legacy.ranges,
      current: now,
      actual,
      candidateErrors: {},
    };
    for (const name of CANDIDATE_NAMES) {
      const error = Math.abs(actualReturn - candidates[name]);
      row.candidateErrors[name] = error;
      history[name].push(error);
    }
    probabilityHistory.push({ rawPUp, outcomeUp });
    rec.push(row);
  }

  if (rec.length < 18) return { available: false, checks: rec.length, reason: 'Too few clean non-overlapping walk-forward checks.' };

  const candidateMae = {};
  for (const name of CANDIDATE_NAMES) candidateMae[name] = mean(rec.map(r => r.candidateErrors[name]));
  candidateMae.ensemble = mean(rec.map(r => r.absLogError));

  const ensembleMae = candidateMae.ensemble;
  const legacyMae = mean(rec.map(r => r.legacyAbsLogError));
  const naiveMae = mean(rec.map(r => r.naiveAbsLogError));
  const ensembleSkillVsNoChange = naiveMae > EPS ? 1 - ensembleMae / naiveMae : null;
  const legacyAnalogueSkillVsNoChange = naiveMae > EPS ? 1 - legacyMae / naiveMae : null;
  const coverage = {}, intervalMeanWidthPct = {};
  for (const c of [50, 80, 90]) {
    const rows = rec.filter(r => r.ranges?.[c]);
    coverage[c] = rows.length ? mean(rows.map(r => r.actual >= r.ranges[c][0] && r.actual <= r.ranges[c][1] ? 1 : 0)) : null;
    intervalMeanWidthPct[c] = rows.length ? mean(rows.map(r => (r.ranges[c][1] - r.ranges[c][0]) / r.current)) : null;
  }
  const brier = mean(rec.map(r => r.brier));
  const high = rec.filter(r => r.confidence >= 0.62);
  const gaps = rec.slice(1).map((r, i) => r.origin - rec[i].origin);
  const ensembleDirectionAccuracy = mean(rec.map(r => r.directionCorrect ? 1 : 0));
  const probabilityCalibrationAlpha = calibrateProbabilityAlpha(probabilityHistory);

  return {
    available: true,
    checks: rec.length,
    nonOverlapping: gaps.every(g => g >= horizon),
    originGapMin: gaps.length ? Math.min(...gaps) : null,
    meanAbsLogError: ensembleMae,
    medianAbsPctError: Math.expm1(median(rec.map(r => r.absLogError))),
    naiveMeanAbsLogError: naiveMae,
    maseNoChange: naiveMae > EPS ? ensembleMae / naiveMae : null,
    skillVsNoChange: ensembleSkillVsNoChange,
    ensembleSkillVsNoChange,
    legacyAnalogueSkillVsNoChange,
    directionAccuracy: ensembleDirectionAccuracy,
    ensembleDirectionAccuracy,
    legacyDirectionAccuracy: mean(rec.map(r => r.legacyDirectionCorrect ? 1 : 0)),
    momentumDirectionAccuracy: mean(rec.map(r => r.momentumDirectionCorrect ? 1 : 0)),
    candidateMae,
    finalWeights: weightsFromCandidateMae(candidateMae),
    probabilityCalibrationAlpha,
    probabilityModel: 'analogue-shrunk-to-50-v1',
    brier,
    brierSkillVs50: 1 - brier / 0.25,
    logLoss: errorMean(rec, 'logLoss'),
    selectiveAccuracy: high.length >= 5 ? mean(high.map(r => r.directionCorrect ? 1 : 0)) : null,
    selectiveCoverage: high.length / rec.length,
    coverage,
    intervalMeanWidthPct,
  };
}

function shiftedPoints(legacy, ensembleReturn, current, horizon, publishable, probabilityAlpha) {
  const legacyTerminal = Number.isFinite(legacy?.center) && legacy.center > 0
    ? Math.log(legacy.center / current)
    : 0;
  return (legacy?.points || []).map(point => {
    const fraction = clamp((point.bar || 0) / Math.max(1, horizon), 0, 1);
    const legacyPointReturn = Number.isFinite(point.price) && point.price > 0
      ? Math.log(point.price / current)
      : legacyTerminal * fraction;
    const adjustedReturn = legacyPointReturn + (ensembleReturn - legacyTerminal) * fraction;
    return {
      ...point,
      price: publishable ? current * Math.exp(adjustedReturn) : null,
      change: publishable ? Math.expm1(adjustedReturn) : null,
      pUp: calibratedProbability(point.pUp, probabilityAlpha),
    };
  });
}

export function forecastV5(candles, horizon = 12, validation = null) {
  const current = candles?.at(-1)?.close;
  if (!(current > 0)) return { available: false, reason: 'No valid current price' };
  const legacy = legacyForecast(candles, horizon, null);
  if (!legacy?.available) return legacy;
  const regime = regimeDiagnostics(candles);
  const ensemble = ensembleForecast(candles, horizon, validation, legacy);
  const probabilityCalibrationAlpha = clamp(validation?.probabilityCalibrationAlpha ?? 0, 0, 1);
  const pUp = calibratedProbability(legacy.direction?.up ?? 0.5, probabilityCalibrationAlpha);
  const pointSkill = validation?.ensembleSkillVsNoChange ?? validation?.skillVsNoChange;
  const positiveSkill = validation?.available && pointSkill > 0 && validation.brierSkillVs50 > 0;
  const negativeMeasuredSkill = validation?.available && !positiveSkill;
  const decisionState = regime.severe || negativeMeasuredSkill
    ? 'ABSTAIN'
    : positiveSkill
      ? 'PUBLISHABLE'
      : 'RESEARCH_ONLY';
  const abstainReason = regime.severe
    ? regime.reason
    : negativeMeasuredSkill
      ? 'Walk-forward ensemble validation did not beat both unchanged-price and 50/50 probability baselines.'
      : null;
  const publishable = decisionState === 'PUBLISHABLE';
  const center = publishable ? current * Math.exp(ensemble.return) : null;
  return {
    ...legacy,
    current,
    center,
    calibrationScore: scoreCalibration(validation),
    decisionState,
    abstainReason,
    pointModel: 'adaptive-ensemble-v1',
    probabilityModel: 'analogue-shrunk-to-50-v1',
    probabilityCalibrationAlpha,
    direction: { up: pUp, down: 1 - pUp },
    ensemble,
    regime,
    modelStatus: regime.severe
      ? 'regime-break-abstain'
      : !validation?.available
        ? 'insufficient-validation'
        : positiveSkill
          ? 'validated-positive-skill'
          : 'validated-no-positive-skill',
    points: shiftedPoints(legacy, ensemble.return, current, horizon, publishable, probabilityCalibrationAlpha),
  };
}

export const candidateNames = [...CANDIDATE_NAMES];