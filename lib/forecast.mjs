const EPS = 1e-12;

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const sum = a => a.reduce((s, x) => s + x, 0);
export const mean = a => a.length ? sum(a) / a.length : NaN;

export function quantile(v, q) {
  const a = v.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const p = clamp(q, 0, 1) * (a.length - 1);
  const lo = Math.floor(p), hi = Math.ceil(p);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (p - lo);
}

export const median = a => quantile(a, 0.5);

export function stdev(a) {
  if (!a.length) return NaN;
  const m = mean(a);
  return Math.sqrt(mean(a.map(x => (x - m) ** 2)));
}

export function mad(a) {
  const m = median(a);
  return median(a.map(x => Math.abs(x - m)));
}

export function robustZ(x, a) {
  const m = median(a), d = mad(a);
  return Number.isFinite(m) && Number.isFinite(d) && d > EPS ? (x - m) / (1.4826 * d + EPS) : 0;
}

export function weightedQuantile(values, weights, q) {
  const a = values.map((v, i) => ({ v, w: Math.max(0, weights[i] || 0) }))
    .filter(x => Number.isFinite(x.v) && x.w > 0)
    .sort((x, y) => x.v - y.v);
  if (!a.length) return NaN;
  const t = sum(a.map(x => x.w)) * clamp(q, 0, 1);
  let c = 0;
  for (const x of a) {
    c += x.w;
    if (c >= t) return x.v;
  }
  return a.at(-1).v;
}

function normalize(w) {
  const s = sum(w);
  return s > EPS ? w.map(x => x / s) : w.map(() => 1 / Math.max(1, w.length));
}

function ess(w) {
  const n = normalize(w);
  return 1 / Math.max(EPS, sum(n.map(x => x * x)));
}

function clusteredEss(samples, weights, blockSize) {
  const grouped = new Map();
  for (let i = 0; i < samples.length; i++) {
    const key = Math.floor(samples[i].i / Math.max(1, blockSize));
    grouped.set(key, (grouped.get(key) || 0) + weights[i]);
  }
  return ess([...grouped.values()]);
}

function logret(c, i, k) {
  return i >= k && c[i - k] > 0 && c[i] > 0 ? Math.log(c[i] / c[i - k]) : NaN;
}

function rsiAt(c, i, p = 14) {
  if (i < p) return NaN;
  let g = 0, l = 0;
  for (let j = i - p + 1; j <= i; j++) {
    const d = c[j] - c[j - 1];
    if (d > 0) g += d;
    else if (d < 0) l -= d;
  }
  if (g < EPS && l < EPS) return 50;
  if (l < EPS) return 100;
  if (g < EPS) return 0;
  return 100 - 100 / (1 + (g / p) / (l / p));
}

function atrAt(cs, i, p = 14) {
  if (i < p) return NaN;
  let s = 0;
  for (let j = i - p + 1; j <= i; j++) {
    const prev = cs[j - 1]?.close ?? cs[j].close;
    s += Math.max(
      cs[j].high - cs[j].low,
      Math.abs(cs[j].high - prev),
      Math.abs(cs[j].low - prev)
    );
  }
  return s / p;
}

function volAt(c, i, p) {
  const a = [];
  for (let j = Math.max(1, i - p + 1); j <= i; j++) {
    if (c[j - 1] > 0 && c[j] > 0) a.push(Math.log(c[j] / c[j - 1]));
  }
  return a.length >= 5 ? stdev(a) : 0;
}

function avgAt(c, i, p) {
  if (i < p - 1) return NaN;
  let s = 0;
  for (let j = i - p + 1; j <= i; j++) s += c[j];
  return s / p;
}

function prepare(candles) {
  const close = candles.map(x => +x.close);
  const volume = candles.map(x => Number.isFinite(+x.volume) ? +x.volume : 0);
  return { close, volume };
}

function feature(candles, prepared, i) {
  if (i < 65) return null;
  const { close: c, volume: v } = prepared;
  const now = c[i];
  if (!(now > 0)) return null;
  const recent40 = candles.slice(i - 39, i + 1);
  const hi = Math.max(...recent40.map(x => +x.high));
  const lo = Math.min(...recent40.map(x => +x.low));
  const a20 = avgAt(c, i, 20), a50 = avgAt(c, i, 50), atr = atrAt(candles, i, 14);
  const vz = robustZ(v[i], v.slice(Math.max(0, i - 40), i));
  const f = [
    logret(c, i, 3),
    logret(c, i, 10),
    logret(c, i, 25),
    volAt(c, i, 10),
    volAt(c, i, 30),
    (rsiAt(c, i, 14) - 50) / 50,
    Math.log(now / a20),
    Math.log(now / a50),
    atr / now,
    vz,
    (now - lo) / (hi - lo + EPS) - 0.5,
  ];
  return f.every(Number.isFinite) ? f : null;
}

function robustScale(rows, current) {
  const d = current.length, med = [], scale = [];
  for (let j = 0; j < d; j++) {
    const x = rows.map(r => r.features[j]);
    med[j] = median(x);
    scale[j] = 1.4826 * mad(x) || stdev(x) || 1;
  }
  const z = f => f.map((x, j) => (x - med[j]) / (scale[j] + EPS));
  return { rows: rows.map(r => ({ ...r, z: z(r.features) })), current: z(current) };
}

const featureWeights = [1.15, 1.05, 0.9, 1.1, 1.0, 0.8, 0.9, 0.75, 0.85, 0.6, 0.75];

function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += featureWeights[i] * (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

function capWeights(weights, cap = 0.055) {
  let w = normalize(weights);
  for (let iter = 0; iter < 8; iter++) {
    let excess = 0;
    w = w.map(x => {
      if (x > cap) {
        excess += x - cap;
        return cap;
      }
      return x;
    });
    const free = sum(w.map(x => x < cap ? x : 0));
    if (excess < EPS || free < EPS) break;
    w = w.map(x => x < cap ? x + excess * (x / free) : x);
  }
  return normalize(w);
}

function diversifyByTime(rows, minGap, target) {
  const chosen = [];
  for (const row of rows) {
    if (chosen.every(x => Math.abs(x.i - row.i) >= minGap)) chosen.push(row);
    if (chosen.length >= target) break;
  }
  return chosen;
}

export function buildSamples(candles, horizon) {
  if (!Array.isArray(candles) || candles.length < 190 || horizon < 1) {
    return { samples: [], effectiveN: 0, rawEffectiveN: 0, dependenceAdjustedN: 0 };
  }
  const last = candles.length - 1;
  const prepared = prepare(candles);
  const cur = feature(candles, prepared, last);
  if (!cur) return { samples: [], effectiveN: 0, rawEffectiveN: 0, dependenceAdjustedN: 0 };

  const rows = [];
  for (let i = 70; i + horizon < last; i++) {
    const f = feature(candles, prepared, i);
    if (!f) continue;
    const base = candles[i].close;
    if (!(base > 0)) continue;
    const path = [];
    let ok = true;
    for (let k = 1; k <= horizon; k++) {
      const px = candles[i + k].close;
      if (!(px > 0)) { ok = false; break; }
      path.push(Math.log(px / base));
    }
    if (ok) rows.push({ i, features: f, path, terminal: path.at(-1) });
  }
  if (rows.length < 70) return { samples: [], effectiveN: 0, rawEffectiveN: 0, dependenceAdjustedN: 0 };

  const s = robustScale(rows, cur);
  const ranked = s.rows.map(r => ({ ...r, d: distance(r.z, s.current) })).sort((a, b) => a.d - b.d);
  const target = Math.min(220, Math.max(80, Math.floor(s.rows.length * 0.32)));
  const minGap = Math.max(2, Math.ceil(horizon / 2));
  let near = diversifyByTime(ranked, minGap, target);
  if (near.length < 60) near = ranked.slice(0, Math.min(target, ranked.length));

  const ds = median(near.map(x => x.d)) || 1;
  const raw = near.map(r => {
    const kernel = Math.exp(-0.5 * (r.d / (ds + EPS)) ** 2);
    const age = last - r.i;
    const recency = Math.pow(0.5, age / Math.max(300, candles.length * 0.6));
    return kernel * (0.65 + 0.35 * recency);
  });
  const w = capWeights(raw);
  const samples = near.map((r, i) => ({ ...r, weight: w[i] }));
  const rawEffectiveN = ess(w);
  const dependenceAdjustedN = clusteredEss(samples, w, Math.max(horizon, minGap));
  const effectiveN = Math.min(rawEffectiveN, dependenceAdjustedN);
  return { samples, effectiveN, rawEffectiveN, dependenceAdjustedN, minGap };
}

function prob(samples, predicate) {
  return sum(samples.filter(predicate).map(x => x.weight));
}

function smoothedProb(samples, predicate, effectiveN) {
  const p = prob(samples, predicate);
  const n = Math.max(1, effectiveN);
  return (p * n + 1) / (n + 2);
}

function rangeFor(values, weights, coverage, effectiveN) {
  const alpha = 1 - coverage;
  const minimumN = Math.ceil(2 / Math.max(alpha, 0.005));
  if (effectiveN < minimumN) return null;
  return [
    weightedQuantile(values, weights, alpha / 2),
    weightedQuantile(values, weights, 1 - alpha / 2),
  ];
}

function checkpointBars(h) {
  const xs = [];
  for (let i = 1; i <= 5; i++) xs.push(Math.max(1, Math.round(h * i / 5)));
  return [...new Set(xs)];
}

function safeLogLoss(p, y) {
  const q = clamp(p, 1e-6, 1 - 1e-6);
  return -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
}

export function calibrationScore(v) {
  if (!v?.available) return null;
  const errorSkill = clamp((v.skillVsNoChange || 0) / 0.25, 0, 1);
  const brierSkill = clamp((v.brierSkillVs50 || 0) / 0.25, 0, 1);
  const targets = [50, 80, 90].filter(k => Number.isFinite(v.coverage?.[k]));
  const coverageQuality = targets.length
    ? mean(targets.map(k => Math.exp(-Math.abs(v.coverage[k] - k / 100) * 8)))
    : 0;
  const sampleQuality = clamp((v.checks - 18) / 62, 0, 1);
  return Math.round(100 * (0.30 * errorSkill + 0.25 * brierSkill + 0.30 * coverageQuality + 0.15 * sampleQuality));
}

export function forecast(candles, horizon = 12, validation = null) {
  const current = candles?.at(-1)?.close;
  if (!(current > 0)) return { available: false, reason: 'No valid current price' };
  const { samples, effectiveN, rawEffectiveN, dependenceAdjustedN } = buildSamples(candles, horizon);
  if (!samples.length) {
    return { available: false, reason: 'Not enough clean history for this timeframe.', effectiveN: 0 };
  }

  const w = samples.map(x => x.weight), terminal = samples.map(x => x.terminal);
  const rawMedian = weightedQuantile(terminal, w, 0.5);
  const evidenceBase = clamp((effectiveN - 12) / 70, 0, 1);
  const shrink = 0.30 + 0.70 * evidenceBase;
  const center = current * Math.exp(rawMedian * shrink);
  const ranges = {};
  for (const c of [50, 80, 90, 95, 99]) {
    const r = rangeFor(terminal, w, c / 100, effectiveN);
    ranges[c] = r ? r.map(x => current * Math.exp(x)) : null;
  }

  const points = checkpointBars(horizon).map(bar => {
    const vals = samples.map(x => x.path[Math.min(bar, x.path.length) - 1]);
    const med = weightedQuantile(vals, w, 0.5) * shrink;
    const r50 = rangeFor(vals, w, 0.50, effectiveN);
    const r80 = rangeFor(vals, w, 0.80, effectiveN);
    const r90 = rangeFor(vals, w, 0.90, effectiveN);
    return {
      bar,
      price: current * Math.exp(med),
      change: Math.expm1(med),
      pUp: smoothedProb(samples, x => x.path[Math.min(bar, x.path.length) - 1] > 0, effectiveN),
      ranges: {
        50: r50?.map(x => current * Math.exp(x)) || null,
        80: r80?.map(x => current * Math.exp(x)) || null,
        90: r90?.map(x => current * Math.exp(x)) || null,
      },
    };
  });

  const look = candles.slice(Math.max(0, candles.length - 61), -1);
  const resistance = Math.max(...look.map(x => x.high));
  const support = Math.min(...look.map(x => x.low));
  const upR = Math.max(0, Math.log(resistance / current));
  const dnR = Math.min(0, Math.log(support / current));
  const pBreakUp = smoothedProb(samples, x => x.path.some(r => r >= upR), effectiveN);
  const pBreakDown = smoothedProb(samples, x => x.path.some(r => r <= dnR), effectiveN);
  const maxWeight = Math.max(...w);
  const neighborQuality = clamp(1 - maxWeight / 0.055, 0, 1);
  const cal = calibrationScore(validation);
  const validationQuality = cal == null ? 0 : cal / 100;
  const evidenceScore = Math.round(100 * clamp(0.65 * evidenceBase + 0.20 * neighborQuality + 0.15 * validationQuality, 0, 1));

  const pUp = smoothedProb(samples, x => x.terminal > 0, effectiveN);
  const pDown = smoothedProb(samples, x => x.terminal < 0, effectiveN);
  const normalized = pUp + pDown;
  const modelStatus = !validation?.available
    ? 'insufficient-validation'
    : validation.skillVsNoChange > 0 && validation.brierSkillVs50 > 0
      ? 'validated-positive-skill'
      : 'validated-no-positive-skill';

  return {
    available: true,
    current,
    center,
    effectiveN,
    rawEffectiveN,
    dependenceAdjustedN,
    sampleCount: samples.length,
    evidenceScore,
    calibrationScore: cal,
    modelStatus,
    direction: { up: pUp / normalized, down: pDown / normalized },
    ranges,
    points,
    breakout: {
      resistance,
      support,
      up: pBreakUp,
      down: pBreakDown,
      definition: '60-observation rolling extrema; descriptive, not a causal level model',
    },
    risk: {
      dispersion: Math.expm1(stdev(terminal) || 0),
      tailDown: current * Math.exp(weightedQuantile(terminal, w, 0.05)),
      tailUp: current * Math.exp(weightedQuantile(terminal, w, 0.95)),
    },
  };
}

function momentumPrediction(candles, i, horizon) {
  if (i < horizon) return 0;
  const a = candles[i - horizon]?.close, b = candles[i]?.close;
  return a > 0 && b > 0 ? Math.log(b / a) : 0;
}

export function validate(candles, horizon = 12, maxChecks = 80) {
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

  const rec = [];
  for (const i of origins.slice(-maxChecks)) {
    const prefix = candles.slice(0, i + 1);
    const f = forecast(prefix, horizon, null);
    if (!f.available) continue;
    const actual = candles[i + horizon].close, now = candles[i].close, pred = f.center;
    if (!(actual > 0 && now > 0 && pred > 0)) continue;
    const predictedReturn = Math.log(pred / now);
    const actualReturn = Math.log(actual / now);
    const outcomeUp = actualReturn > 0 ? 1 : 0;
    const pUp = clamp(f.direction.up, 1e-6, 1 - 1e-6);
    const momentum = momentumPrediction(candles, i, horizon);
    rec.push({
      origin: i,
      absLogError: Math.abs(Math.log(actual / pred)),
      naiveAbsLogError: Math.abs(actualReturn),
      directionCorrect: Math.sign(predictedReturn) !== 0 && Math.sign(predictedReturn) === Math.sign(actualReturn),
      momentumDirectionCorrect: Math.sign(momentum) !== 0 && Math.sign(momentum) === Math.sign(actualReturn),
      pUp,
      outcomeUp,
      brier: (pUp - outcomeUp) ** 2,
      logLoss: safeLogLoss(pUp, outcomeUp),
      confidence: Math.max(pUp, 1 - pUp),
      ranges: f.ranges,
      current: now,
      actual,
    });
  }

  if (rec.length < 18) return { available: false, checks: rec.length, reason: 'Too few clean non-overlapping walk-forward checks.' };

  const coverage = {}, intervalMeanWidthPct = {};
  for (const c of [50, 80, 90]) {
    const rows = rec.filter(r => r.ranges[c]);
    coverage[c] = rows.length ? mean(rows.map(r => r.actual >= r.ranges[c][0] && r.actual <= r.ranges[c][1] ? 1 : 0)) : null;
    intervalMeanWidthPct[c] = rows.length ? mean(rows.map(r => (r.ranges[c][1] - r.ranges[c][0]) / r.current)) : null;
  }

  const high = rec.filter(r => r.confidence >= 0.62);
  const mae = mean(rec.map(r => r.absLogError));
  const naiveMae = mean(rec.map(r => r.naiveAbsLogError));
  const maseNoChange = naiveMae > EPS ? mae / naiveMae : null;
  const skillVsNoChange = maseNoChange == null ? null : 1 - maseNoChange;
  const brier = mean(rec.map(r => r.brier));
  const brierSkillVs50 = 1 - brier / 0.25;
  const gaps = rec.slice(1).map((r, i) => r.origin - rec[i].origin);

  return {
    available: true,
    checks: rec.length,
    nonOverlapping: gaps.every(g => g >= horizon),
    originGapMin: gaps.length ? Math.min(...gaps) : null,
    meanAbsLogError: mae,
    medianAbsPctError: Math.expm1(median(rec.map(r => r.absLogError))),
    naiveMeanAbsLogError: naiveMae,
    maseNoChange,
    skillVsNoChange,
    directionAccuracy: mean(rec.map(r => r.directionCorrect ? 1 : 0)),
    momentumDirectionAccuracy: mean(rec.map(r => r.momentumDirectionCorrect ? 1 : 0)),
    brier,
    brierSkillVs50,
    logLoss: mean(rec.map(r => r.logLoss)),
    selectiveAccuracy: high.length >= 5 ? mean(high.map(r => r.directionCorrect ? 1 : 0)) : null,
    selectiveCoverage: high.length / rec.length,
    coverage,
    intervalMeanWidthPct,
  };
}

export function indicators(candles) {
  const i = candles.length - 1;
  const c = candles.map(x => x.close), vol = candles.map(x => x.volume || 0);
  const r14 = rsiAt(c, i, 14), atr = atrAt(candles, i, 14);
  const ret1 = logret(c, i, 1), ret5 = logret(c, i, 5), rv20 = volAt(c, i, 20);
  const sma20 = avgAt(c, i, 20), sma50 = avgAt(c, i, 50);
  const high52 = Math.max(...candles.slice(Math.max(0, i - 252), i + 1).map(x => x.high));
  const low52 = Math.min(...candles.slice(Math.max(0, i - 252), i + 1).map(x => x.low));
  return {
    rsi14: r14,
    atr14: atr,
    atrPct: atr / c[i],
    return1: ret1,
    return5: ret5,
    realizedVol20: rv20,
    sma20,
    sma50,
    distanceSma20: c[i] / sma20 - 1,
    distanceSma50: c[i] / sma50 - 1,
    volumeZ: robustZ(vol[i], vol.slice(Math.max(0, i - 40), i)),
    high52,
    low52,
    position52: (c[i] - low52) / (high52 - low52 + EPS),
  };
}

export function microstructure(book, trades) {
  const bs = sum((book?.bids || []).map(x => x.size));
  const as = sum((book?.asks || []).map(x => x.size));
  const imb = (bs - as) / (bs + as + EPS);
  const bid = book?.bids?.[0]?.price, ask = book?.asks?.[0]?.price;
  const mid = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : NaN;
  const spread = Number.isFinite(mid) ? (ask - bid) / mid * 10000 : NaN;
  let buy = 0, sell = 0;
  for (const t of trades || []) {
    const n = (t.price || 0) * (t.size || 0);
    if (t.makerSide === 'sell') buy += n;
    else if (t.makerSide === 'buy') sell += n;
  }
  return {
    bookImbalance: imb,
    tradeImbalance: (buy - sell) / (buy + sell + EPS),
    bestBid: bid,
    bestAsk: ask,
    spreadBps: spread,
    aggressiveBuy: buy,
    aggressiveSell: sell,
  };
}
