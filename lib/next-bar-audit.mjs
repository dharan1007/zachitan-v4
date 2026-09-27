// Causal, source-data-only one-observation OHLCV forecasts and prequential audit.
// No network, artificial candles, or mutable global model state.
const FIELDS = ['open', 'high', 'low', 'close', 'volume'];
const PRICE_FIELDS = ['open', 'high', 'low', 'close'];
const AUDIT_FIELDS = [...FIELDS, 'range', 'body'];
function candleSize(c) {
  return { range: c?.high >= c?.low ? c.high - c.low : null,
    body: c?.close >= 0 && c?.open >= 0 ? Math.abs(c.close - c.open) : null };
}
const withSize = c => ({ ...c, ...candleSize(c) });
const EPS = 1e-12;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mean = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
function quantile(xs, p) {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const q = clamp(p, 0, 1) * (a.length - 1), i = Math.floor(q), r = q - i;
  return a[i] * (1 - r) + a[Math.min(a.length - 1, i + 1)] * r;
}
const safeLog = n => n > 0 && Number.isFinite(n) ? Math.log(n) : null;
function features(rows, i) {
  if (i < 24) return null;
  const c = rows[i], prev = rows[i - 1], five = rows[i - 5];
  if (!(c?.close > 0 && prev?.close > 0 && five?.close > 0 && c?.open > 0 && c?.low > 0)) return null;
  const volumes = rows.slice(i - 10, i).map(x => x.volume).filter(x => x > 0);
  const avgVolume = mean(volumes);
  return [
    Math.log(c.close / prev.close),
    Math.log(c.close / five.close) / Math.sqrt(5),
    Math.log(c.high / c.low),
    Math.log(c.close / c.open),
    c.volume > 0 && avgVolume > 0 ? Math.log(c.volume / avgVolume) : 0,
  ];
}
function baseline(c) {
  const close = c.close;
  // A no-change BODY is the previously observed body size, not zero.
  // A no-change price-open is previous close; these are different baselines.
  return { open: close, close, high: Math.max(c.high, close), low: Math.min(c.low, close),
    volume: c.volume > 0 ? c.volume : null,
    range: c.high - c.low, body: Math.abs(c.close - c.open) };
}
function rawNext(rows) {
  const i = rows.length - 1, current = rows[i];
  if (i < 90 || !(current?.close > 0)) return null;
  const x = features(rows, i);
  if (!x) return null;
  const recentReturns = [];
  for (let j = Math.max(1, i - 48); j <= i; j++) {
    if (rows[j - 1].close > 0 && rows[j].close > 0) recentReturns.push(Math.log(rows[j].close / rows[j - 1].close));
  }
  const retMed = quantile(recentReturns, 0.5) || 0;
  const volatility = Math.max(0.001, 1.4826 * (quantile(recentReturns.map(r => Math.abs(r - retMed)), 0.5) || 0));
  const scales = [volatility, volatility, volatility * 2, volatility, 1.3];
  const candidates = [];
  // Every neighbour's next candle must already have completed before the origin.
  for (let j = 25; j < i; j++) {
    const f = features(rows, j), next = rows[j + 1], prev = rows[j];
    if (!f || !(next.open > 0 && next.close > 0 && next.low > 0 && next.high > 0)) continue;
    const delta = x.reduce((s, v, k) => s + Math.min(16, ((v - f[k]) / scales[k]) ** 2), 0);
    const score = delta + 0.7 * (i - j) / Math.max(100, i);
    candidates.push({ score, j, previous: prev, next });
  }
  candidates.sort((a, b) => a.score - b.score);
  const nearest = candidates.slice(0, 56);
  if (nearest.length < 30) return null;
  const weights = nearest.map(({ score }) => Math.exp(-0.5 * Math.min(score, 40)));
  const weightedMedian = fn => {
    const values = nearest.map((r, k) => ({ v: fn(r), w: weights[k] })).filter(r => Number.isFinite(r.v) && r.w > 0).sort((a, b) => a.v - b.v);
    const total = values.reduce((s, v) => s + v.w, 0);
    if (total <= EPS) return null;
    let cumulative = 0;
    for (const v of values) { cumulative += v.w; if (cumulative >= total * 0.5) return v.v; }
    return values.at(-1).v;
  };
  const gap = weightedMedian(r => Math.log(r.next.open / r.previous.close));
  const terminal = weightedMedian(r => Math.log(r.next.close / r.previous.close));
  const upper = weightedMedian(r => Math.log(r.next.high / Math.max(r.next.open, r.next.close)));
  const lower = weightedMedian(r => Math.log(Math.min(r.next.open, r.next.close) / r.next.low));
  const vr = current.volume > 0 ? weightedMedian(r => r.previous.volume > 0 && r.next.volume > 0 ? Math.log(r.next.volume / r.previous.volume) : null) : null;
  if (![gap, terminal, upper, lower].every(Number.isFinite)) return null;
  const open = current.close * Math.exp(gap), close = current.close * Math.exp(terminal);
  return {
    open, close,
    high: Math.max(open, close) * Math.exp(Math.max(0, upper)),
    low: Math.min(open, close) * Math.exp(-Math.max(0, lower)),
    volume: vr == null ? null : current.volume * Math.exp(clamp(vr, -4, 4)),
    neighborCount: nearest.length,
  };
}
function logError(actual, predicted, field) {
  if (!(actual > 0 && predicted > 0)) return null;
  return Math.log(actual / predicted);
}
function scoreRows(rows, field, pred = 'adaptive') {
  const values = rows.map(r => {
    const actual = r.actual[field], forecast = r[pred][field], naive = r.baseline[field];
    const err = logError(actual, forecast, field), baselineErr = logError(actual, naive, field);
    return err == null || baselineErr == null ? null : { err, baselineErr };
  }).filter(Boolean);
  if (!values.length) return { samples: 0, maePct: null, baselineMaePct: null, skill: null, medianBiasPct: null };
  const err = mean(values.map(x => Math.abs(x.err))), naive = mean(values.map(x => Math.abs(x.baselineErr)));
  return {
    samples: values.length,
    maePct: 100 * Math.expm1(err),
    baselineMaePct: 100 * Math.expm1(naive),
    skill: naive > EPS ? 1 - err / naive : null,
    medianBiasPct: 100 * Math.expm1(quantile(values.map(x => x.err), 0.5) || 0),
  };
}
function adapt(raw, naive, history) {
  const out = {}, parameters = {};
  for (const field of FIELDS) {
    if (!(raw[field] > 0 && naive[field] > 0)) { out[field] = null; parameters[field] = { weight: 0, reason: 'Missing publisher volume or insufficient samples' }; continue; }
    const recent = history.slice(-20).filter(r => r.raw[field] > 0 && r.baseline[field] > 0 && r.actual[field] > 0);
    if (recent.length < 12) {
      out[field] = raw[field];
      parameters[field] = { weight: 1, reason: 'Uncalibrated: insufficient matured errors' };
      continue;
    }
    const modelLoss = mean(recent.map(r => Math.abs(logError(r.actual[field], r.raw[field], field))));
    const baselineLoss = mean(recent.map(r => Math.abs(logError(r.actual[field], r.baseline[field], field))));
    // If the analogue underperforms, fall back to the observable naive baseline.
    const weight = baselineLoss > EPS ? clamp(2 * (1 - modelLoss / baselineLoss), 0, 1) : 0;
    const rawBias = quantile(recent.map(r => logError(r.actual[field], r.raw[field], field)), 0.5) || 0;
    const adjustment = clamp(rawBias * 0.35 * weight, -0.025, 0.025);
    out[field] = naive[field] * Math.exp(weight * Math.log(raw[field] / naive[field]) + adjustment);
    parameters[field] = { weight, recentChecks: recent.length, reason: weight === 0 ? 'Baseline selected on matured errors' : 'Chronologically adapted on matured errors' };
  }
  if ([out.open, out.close, out.high, out.low].every(v => v > 0)) {
    out.high = Math.max(out.high, out.open, out.close);
    out.low = Math.min(out.low, out.open, out.close);
  }
  return { values: out, parameters };
}
function ranges(prediction, history, fields = FIELDS) {
  const result = {};
  for (const field of fields) {
    const valid = history.slice(-32).map(r => logError(r.actual[field], r.adaptive[field], field)).filter(Number.isFinite);
    const estimate = prediction[field];
    // Empirical quantiles, NOT coverage guarantees or parametric confidence intervals.
    result[field] = valid.length >= 20 && estimate > 0
      ? [0.1, 0.9].map(p => estimate * Math.exp(quantile(valid, p)))
      : null;
  }
  return result;
}
export function auditNextBar(candles, { maxChecks = 38, provenance = null } = {}) {
  const rows = Array.isArray(candles) ? candles : [];
  const n = rows.length;
  if (n < 120) return { available: false, reason: 'At least 120 completed, valid source candles are required.', checks: 0 };
  const history = [];
  // A 32-origin pre-evaluation burn-in makes consecutive replays use the same
  // mature calibration and residual window, independent of the query date.
  const start = Math.max(95, n - clamp(Math.round(maxChecks), 24, 56) - 33);
  for (let origin = start; origin < n - 1; origin++) {
    const prefix = rows.slice(0, origin + 1);
    const raw = rawNext(prefix);
    if (!raw) continue;
    const base = baseline(rows[origin]);
    const adjusted = adapt(raw, base, history);
    const sizedPrediction = withSize(adjusted.values);
    const predictedIntervals = { ...ranges(sizedPrediction, history), ...ranges(sizedPrediction, history, ['range', 'body']) };
    const actual = rows[origin + 1];
    const evalRow = { originTime: rows[origin].time, actualTime: actual.time, raw: withSize(raw), baseline: base, adaptive: sizedPrediction, actual: withSize(actual), intervals: predictedIntervals };
    history.push(evalRow);
  }
  const raw = rawNext(rows);
  if (!raw) return { available: false, reason: 'No valid historical analogues for the next completed observation.', checks: history.length };
  const base = baseline(rows.at(-1));
  const adjustment = adapt(raw, base, history);
  const prediction = withSize(adjustment.values);
  const currentIntervals = { ...ranges(prediction, history), ...ranges(prediction, history, ['range', 'body']) };
  const evaluation = history.slice(-Math.min(history.length, 24));
  const stats = Object.fromEntries(AUDIT_FIELDS.map(field => [field, { ...scoreRows(evaluation, field), raw: scoreRows(evaluation, field, 'raw') }]));
  const directionRows = evaluation.filter(r => r.actual.close > 0 && r.baseline.close > 0 && r.adaptive.close > 0 && r.actual.close !== r.baseline.close && r.adaptive.close !== r.baseline.close);
  const closeDirectionAccuracy = directionRows.length >= 20 ? mean(directionRows.map(r => Math.sign(r.adaptive.close - r.baseline.close) === Math.sign(r.actual.close - r.baseline.close) ? 1 : 0)) : null;
  const intervalCoverage = Object.fromEntries(AUDIT_FIELDS.map(field => {
    const valid = evaluation.filter(r => r.intervals[field] && r.actual[field] > 0);
    return [field, { checks: valid.length, nominal: 0.8, observed: valid.length ? mean(valid.map(r => +(r.actual[field] >= r.intervals[field][0] && r.actual[field] <= r.intervals[field][1]))) : null }];
  }));
  const actualHistory = history.slice(-24).map(r => ({
    issuedAt: r.originTime, observedAt: r.actualTime,
    predicted: Object.fromEntries(AUDIT_FIELDS.map(k => [k, r.adaptive[k] ?? null])),
    observed: Object.fromEntries(AUDIT_FIELDS.map(k => [k, r.actual[k] ?? null])),
    baseline: Object.fromEntries(AUDIT_FIELDS.map(k => [k, r.baseline[k] ?? null])),
    absErrorPct: Object.fromEntries(AUDIT_FIELDS.map(k => [k, r.adaptive[k] > 0 && r.actual[k] > 0 ? 100 * Math.abs(r.adaptive[k] / r.actual[k] - 1) : null])),
  }));
  return {
    available: true,
    type: 'historical-prequential-reconstruction',
    asIssuedLiveRecord: false,
    automatic: true,
    latestCompletedTime: rows.at(-1).time,
    firstCheckTime: history.at(0)?.originTime ?? null,
    lastCheckTime: history.at(-1)?.actualTime ?? null,
    checks: history.length,
    evaluationChecks: evaluation.length,
    provenance,
    horizonObservations: 1,
    forecast: prediction,
    baseline: base,
    empirical80: currentIntervals,
    parameters: { ...adjustment.parameters, range: { weight: null, reason: 'Derived from the coherent projected high and low' }, body: { weight: null, reason: 'Derived from the coherent projected open and close' } },
    accuracy: stats,
    closeDirectionAccuracy,
    directionChecks: directionRows.length,
    intervalCoverage,
    history: actualHistory,
    methodology: 'Expanding past-only analogue search; each origin predicted before its next completed bar. Per-field adaptation uses strictly earlier matured errors, with baseline fallback. The last 24 origins report point errors; 80% bands use earlier errors only. Historical evaluations are reconstructed, not archived as-issued live predictions.',
  };
}
export { PRICE_FIELDS, FIELDS };
