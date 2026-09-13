const INTRADAY_INTERVALS = new Set(['1m','2m','5m','15m','30m','60m','90m','1h']);
const INTERVAL_SECONDS = {
  '1m': 60,
  '2m': 120,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '60m': 3600,
  '90m': 5400,
  '1h': 3600,
  '1d': 86400,
  '5d': 432000,
  '1wk': 604800,
  '1mo': 2592000,
  '3mo': 7776000,
};

function median(values = []) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2;
}

export function inferObservationStep(candles = [], interval = '1d') {
  const rows = Array.isArray(candles) ? candles : [];
  const gaps = [];
  for (let i = 1; i < rows.length; i++) {
    const gap = Number(rows[i]?.time) - Number(rows[i - 1]?.time);
    if (Number.isFinite(gap) && gap > 0) gaps.push(gap);
  }
  return median(gaps.slice(-120)) || INTERVAL_SECONDS[String(interval)] || 86400;
}

function observationLabel(bar) {
  const n = Math.max(1, Math.floor(Number(bar) || 1));
  return `+${n} market observation${n === 1 ? '' : 's'}`;
}

function nullTimedPoint(point, mode) {
  return {
    ...point,
    time: null,
    timeMode: mode,
    observationLabel: observationLabel(point?.bar),
  };
}

export function addForecastObservationTimes(forecast, candles = [], meta = {}, provider = '', interval = '1d') {
  if (!forecast?.available) return forecast;
  const p = String(provider || '').toLowerCase();
  const int = String(interval || '1d');
  const stepSec = inferObservationStep(candles, int);
  const lastTime = Number(candles?.at(-1)?.time);
  const canProject = Number.isFinite(lastTime) && lastTime > 0 && Number.isFinite(stepSec) && stepSec > 0;

  let timePolicy = 'Future timestamps are withheld unless the next observation time is verifiable.';
  const points = (forecast.points || []).map(point => {
    const bar = Math.max(1, Math.floor(Number(point?.bar) || 1));
    const projected = canProject ? Math.floor(lastTime + bar * stepSec) : null;

    if (p === 'coinbase' && projected != null) {
      timePolicy = '24/7 continuous-market observation timing.';
      return {
        ...point,
        time: projected,
        timeMode: 'continuous-market-estimate',
        observationLabel: observationLabel(bar),
      };
    }

    if (p === 'yahoo') {
      const regular = String(meta?.marketState || '').toUpperCase() === 'REGULAR';
      const end = Number(meta?.regularSessionEnd);
      const intraday = INTRADAY_INTERVALS.has(int);
      if (regular && intraday && projected != null && Number.isFinite(end) && projected <= end) {
        timePolicy = 'Intraday observation times are projected only inside the currently verified regular session; later-session dates require an exchange calendar.';
        return {
          ...point,
          time: projected,
          timeMode: 'regular-session-estimate',
          observationLabel: observationLabel(bar),
        };
      }
      timePolicy = 'Exchange-bound forecast horizons are expressed as observation offsets; exact future dates require an authoritative exchange calendar.';
      return nullTimedPoint(point, 'exchange-calendar-required');
    }

    if (p === 'amfi' || p === 'ecb') {
      timePolicy = 'Reference-series horizons are observation offsets; exact future publication times are not fabricated.';
      return nullTimedPoint(point, 'publication-cadence');
    }

    return nullTimedPoint(point, 'unverified-calendar');
  });

  return { ...forecast, points, timePolicy };
}
