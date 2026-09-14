const RANGE_ORDER = ['1d','5d','1mo','3mo','6mo','1y','2y','5y','10y','max'];
const RANGE_DAYS = { '1d':1, '5d':5, '1mo':31, '3mo':93, '6mo':186, '1y':365, '2y':730, '5y':1825, '10y':3650 };

function clampHorizon(horizon) {
  const n = Math.round(Number(horizon) || 12);
  return Math.min(80, Math.max(1, n));
}

function widerRange(requested, minimum) {
  if (requested === 'max') return 'max';
  const r = RANGE_ORDER.indexOf(requested);
  const m = RANGE_ORDER.indexOf(minimum);
  if (r < 0) return minimum;
  if (m < 0) return requested;
  return RANGE_ORDER[Math.max(r, m)];
}

export function targetValidationRows(horizon = 12) {
  const h = clampHorizon(horizon);
  // V6 keeps a pre-holdout training segment plus at least eight untouched,
  // non-overlapping qualification origins. This is intentionally larger than
  // the V5 walk-forward-only target so display zoom never determines evidence.
  return Math.max(840, Math.ceil(48 * h + 80));
}

function yahooMinimumRange(interval, targetRows) {
  const i = String(interval || '1d');
  if (i === '1m') return '5d';
  if (['2m','5m','15m','30m','90m'].includes(i)) return '1mo';
  if (['60m','1h'].includes(i)) return '1y';
  if (i === '1d') {
    if (targetRows <= 520) return '2y';
    if (targetRows <= 1300) return '5y';
    return '10y';
  }
  if (i === '5d') return targetRows <= 520 ? '10y' : 'max';
  if (i === '1wk') return targetRows <= 520 ? '10y' : 'max';
  return 'max';
}

export function modelHistoryPlan({ provider = '', interval = '1d', range = '1y', horizon = 12, displayBars = null } = {}) {
  const p = String(provider || '').toLowerCase();
  const displayRange = RANGE_ORDER.includes(range) ? range : '1y';
  const targetRows = targetValidationRows(horizon);

  if (p === 'coinbase') {
    const shown = Math.max(1, Math.round(Number(displayBars) || 1));
    const modelBars = Math.min(1200, Math.max(shown, targetRows));
    return {
      provider: p,
      interval,
      displayRange,
      displayBars: shown,
      modelBars,
      targetRows,
      historyLimited: modelBars < targetRows,
    };
  }

  if (p === 'yahoo') {
    const minimum = yahooMinimumRange(interval, targetRows);
    const modelRange = widerRange(displayRange, minimum);
    return {
      provider: p,
      interval,
      displayRange,
      modelRange,
      targetRows,
      historyLimited: false,
    };
  }

  if (p === 'amfi' || p === 'ecb') {
    const displayDays = RANGE_DAYS[displayRange] || 365;
    const modelDays = Math.max(displayDays, Math.ceil(targetRows * 1.6), 730);
    return {
      provider: p,
      interval,
      displayRange,
      displayDays,
      modelDays,
      targetRows,
      historyLimited: false,
    };
  }

  return { provider: p, interval, displayRange, targetRows, historyLimited: true };
}

function rangeCutoff(lastTime, range) {
  if (!Number.isFinite(lastTime) || lastTime <= 0 || range === 'max') return null;
  if (range === 'ytd') {
    const d = new Date(lastTime * 1000);
    return Date.UTC(d.getUTCFullYear(), 0, 1) / 1000;
  }
  const days = RANGE_DAYS[range];
  return Number.isFinite(days) ? lastTime - days * 86400 : null;
}

export function sliceDisplayCandles(candles = [], plan = {}) {
  const rows = Array.isArray(candles) ? candles : [];
  if (!rows.length) return [];
  if (plan.provider === 'coinbase' && Number.isFinite(plan.displayBars)) {
    return rows.slice(-Math.max(1, Math.round(plan.displayBars)));
  }
  const cutoff = rangeCutoff(Number(rows.at(-1)?.time), plan.displayRange);
  if (cutoff == null) return rows;
  const sliced = rows.filter(row => Number(row?.time) >= cutoff);
  return sliced.length ? sliced : rows.slice(-1);
}
