const INTRADAY = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h']);

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeRow(row) {
  const time = Number(row?.time);
  const open = finitePositive(row?.open);
  const high = finitePositive(row?.high);
  const low = finitePositive(row?.low);
  const close = finitePositive(row?.close);
  if (!Number.isFinite(time) || time <= 0 || open == null || high == null || low == null || close == null) return null;
  if (low > Math.min(open, close) || high < Math.max(open, close) || high < low) return null;
  // Zero traded volume is materially different from an unavailable value.
  const volume = row?.volume == null ? null : Number(row.volume);
  return {
    time: Math.floor(time),
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) && volume >= 0 ? volume : null,
  };
}

function integrityStatus({ inputRows, cleanRows, invalidRowsRemoved, duplicatesRemoved, outOfOrderPairs, largeGapCount }) {
  const denom = Math.max(1, inputRows);
  const invalidRatio = invalidRowsRemoved / denom;
  const duplicateRatio = duplicatesRemoved / denom;
  const disorderRatio = outOfOrderPairs / Math.max(1, inputRows - 1);
  const gapRatio = largeGapCount / Math.max(1, cleanRows - 1);
  const enoughForRatioGate = inputRows >= 20;
  const critical = enoughForRatioGate && (
    invalidRatio >= 0.20 ||
    duplicateRatio >= 0.25 ||
    gapRatio >= 0.20
  );
  const degraded = critical || invalidRowsRemoved > 0 || duplicatesRemoved > 0 || outOfOrderPairs > 0 || largeGapCount > 0;
  const reason = critical
    ? `Market data integrity is critical: ${(invalidRatio * 100).toFixed(1)}% invalid, ${(duplicateRatio * 100).toFixed(1)}% duplicate and ${(gapRatio * 100).toFixed(1)}% large-gap incidence.`
    : degraded
      ? 'Market data required normalization because invalid, duplicate, out-of-order, or gapped observations were detected.'
      : null;
  return {
    status: critical ? 'CRITICAL' : degraded ? 'DEGRADED' : 'CLEAN',
    critical,
    degraded,
    invalidRatio,
    duplicateRatio,
    disorderRatio,
    gapRatio,
    reason,
  };
}

export function normalizeCandles(input = []) {
  const rows = Array.isArray(input) ? input : [];
  const byTime = new Map();
  let invalidRowsRemoved = 0;
  let duplicatesRemoved = 0;
  let outOfOrderPairs = 0;
  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i]?.time) < Number(rows[i - 1]?.time)) outOfOrderPairs += 1;
  }
  for (const row of rows) {
    const clean = normalizeRow(row);
    if (!clean) {
      invalidRowsRemoved += 1;
      continue;
    }
    if (byTime.has(clean.time)) duplicatesRemoved += 1;
    byTime.set(clean.time, clean);
  }
  const candles = [...byTime.values()].sort((a, b) => a.time - b.time);
  const gaps = [];
  for (let i = 1; i < candles.length; i++) {
    const gap = candles[i].time - candles[i - 1].time;
    if (gap > 0) gaps.push(gap);
  }
  const sortedGaps = gaps.slice().sort((a, b) => a - b);
  const medianStepSec = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : null;
  const largeGapCount = medianStepSec
    ? gaps.filter(gap => gap > Math.max(medianStepSec * 4, medianStepSec + 3600)).length
    : 0;
  const base = {
    inputRows: rows.length,
    cleanRows: candles.length,
    invalidRowsRemoved,
    duplicatesRemoved,
    outOfOrderPairs,
    chronological: candles.every((row, index) => index === 0 || row.time > candles[index - 1].time),
    medianStepSec,
    largeGapCount,
  };
  return {
    candles,
    diagnostics: { ...base, ...integrityStatus(base) },
  };
}

export function marketSessionPolicy({ provider, meta = {}, interval = '1d' } = {}) {
  const nativeMs=({'1m':60000,'2m':120000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'60m':3600000,'6h':21600000,'1d':86400000,'1wk':604800000})[interval]||300000;
  const p = String(provider || '').toLowerCase();
  if (p === 'coinbase') {
    return {
      state: 'OPEN',
      forecastAllowed: true,
      // In-browser refresh only: no cron, no background Edge Function and no
      // server-side polling while the user is away. A bounded snapshot cadence
      // refreshes the forecast without treating every WebSocket tick as a job.
      // No hundreds of redundant history requests between 6h or daily bars.
      // Minute bars remain explicitly budget-limited to 5-minute refreshes.
      autoRefreshMs: Math.max(300_000,nativeMs),
      transport: 'websocket-live-price-plus-bounded-http-snapshot',
      reason: 'Venue WebSocket updates visible prices; a bounded visible-page snapshot refresh updates completed-candle forecasts.',
    };
  }

  if (p === 'yahoo') {
    const state = String(meta.marketState || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    const regular = state === 'REGULAR';
    const intraday = INTRADAY.has(String(interval));
    return {
      state,
      forecastAllowed: regular,
      autoRefreshMs: regular ? (intraday ? Math.max(300_000,nativeMs) : 1_800_000) : null,
      transport: 'cached-http-snapshot',
      reason: regular
        ? 'Regular trading session reported by the market-data source.'
        : `Forecast withheld because the reported market session is ${state}.`,
    };
  }

  if (p === 'amfi' || p === 'ecb') {
    return {
      state: 'REFERENCE',
      forecastAllowed: true,
      autoRefreshMs: null,
      transport: 'scheduled-reference-publication',
      reason: 'This provider publishes daily/reference observations rather than a live exchange session.',
    };
  }

  return {
    state: String(meta.marketState || 'UNKNOWN').toUpperCase(),
    forecastAllowed: false,
    autoRefreshMs: null,
    transport: 'unknown',
    reason: 'Session state could not be verified, so a current forecast is withheld.',
  };
}

function withholdForecast(forecast, { modelStatus, reason }) {
  return {
    ...forecast,
    center: null,
    ranges: Object.fromEntries(Object.keys(forecast.ranges || {}).map(k => [k, null])),
    decisionState: 'ABSTAIN',
    modelStatus,
    abstainReason: reason,
    points: (forecast.points || []).map(point => ({ ...point, price: null, change: null,
      ranges: Object.fromEntries(Object.keys(point.ranges || {}).map(k => [k, null])) })),
  };
}

export function applySessionForecastPolicy(forecast, policy, integrity = null) {
  if (!forecast?.available) return forecast;
  if (integrity?.critical) {
    return withholdForecast(forecast, {
      modelStatus: 'data-integrity-abstain',
      reason: integrity.reason || 'Forecast withheld because market-data integrity checks failed.',
    });
  }
  if (policy?.forecastAllowed !== false) return forecast;
  return withholdForecast(forecast, {
    modelStatus: 'market-session-abstain',
    reason: policy?.reason || 'Forecast withheld because the market session is closed or unverified.',
  });
}
