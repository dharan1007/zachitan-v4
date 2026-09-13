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
  const volume = Number(row?.volume);
  return {
    time: Math.floor(time),
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) && volume >= 0 ? volume : 0,
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
  return {
    candles,
    diagnostics: {
      inputRows: rows.length,
      cleanRows: candles.length,
      invalidRowsRemoved,
      duplicatesRemoved,
      outOfOrderPairs,
      chronological: candles.every((row, index) => index === 0 || row.time > candles[index - 1].time),
      medianStepSec,
      largeGapCount,
    },
  };
}

export function marketSessionPolicy({ provider, meta = {}, interval = '1d' } = {}) {
  const p = String(provider || '').toLowerCase();
  if (p === 'coinbase') {
    return {
      state: 'OPEN',
      forecastAllowed: true,
      autoRefreshMs: null,
      transport: 'websocket-live-price',
      reason: 'Crypto trades continuously; browser price updates use the venue WebSocket.',
    };
  }

  if (p === 'yahoo') {
    const state = String(meta.marketState || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    const regular = state === 'REGULAR';
    const intraday = INTRADAY.has(String(interval));
    return {
      state,
      forecastAllowed: regular,
      autoRefreshMs: regular ? (intraday ? 120_000 : 300_000) : null,
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

export function applySessionForecastPolicy(forecast, policy) {
  if (!forecast?.available || policy?.forecastAllowed !== false) return forecast;
  return {
    ...forecast,
    center: null,
    decisionState: 'ABSTAIN',
    modelStatus: 'market-session-abstain',
    abstainReason: policy?.reason || 'Forecast withheld because the market session is closed or unverified.',
    points: (forecast.points || []).map(point => ({ ...point, price: null, change: null })),
  };
}
