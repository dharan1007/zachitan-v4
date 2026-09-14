import { normalizeCandles as normalizeBase, marketSessionPolicy, applySessionForecastPolicy } from './market-integrity.mjs';

const INTRADAY = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h']);

function localDateKey(epochSec, { timezone, gmtoffset } = {}) {
  const date = new Date(epochSec * 1000);
  if (timezone) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    } catch {}
  }
  const offset = Number(gmtoffset);
  const shifted = Number.isFinite(offset) ? new Date((epochSec + offset) * 1000) : date;
  return shifted.toISOString().slice(0, 10);
}

function status(diagnostics) {
  const denom = Math.max(1, diagnostics.inputRows);
  const invalidRatio = diagnostics.invalidRowsRemoved / denom;
  const duplicateRatio = diagnostics.duplicatesRemoved / denom;
  const disorderRatio = diagnostics.outOfOrderPairs / Math.max(1, diagnostics.inputRows - 1);
  const gapRatio = diagnostics.largeGapCount / Math.max(1, diagnostics.cleanRows - 1);
  const critical = diagnostics.inputRows >= 20 && (invalidRatio >= 0.20 || duplicateRatio >= 0.25 || gapRatio >= 0.20);
  const degraded = critical || diagnostics.invalidRowsRemoved > 0 || diagnostics.duplicatesRemoved > 0 || diagnostics.outOfOrderPairs > 0 || diagnostics.largeGapCount > 0;
  return {
    status: critical ? 'CRITICAL' : degraded ? 'DEGRADED' : 'CLEAN',
    critical,
    degraded,
    invalidRatio,
    duplicateRatio,
    disorderRatio,
    gapRatio,
    reason: critical
      ? `Market data integrity is critical: ${(invalidRatio * 100).toFixed(1)}% invalid, ${(duplicateRatio * 100).toFixed(1)}% duplicate and ${(gapRatio * 100).toFixed(1)}% unexpected-gap incidence.`
      : degraded
        ? 'Market data required normalization because invalid, duplicate, out-of-order, or unexpected gapped observations were detected.'
        : null,
  };
}

export function normalizeCandles(input = [], context = {}) {
  const base = normalizeBase(input);
  const provider = String(context.provider || '').toLowerCase();
  const interval = String(context.interval || '');
  if (provider !== 'yahoo' || !INTRADAY.has(interval) || !base.diagnostics.medianStepSec) {
    return { ...base, diagnostics: { ...base.diagnostics, expectedClosureGapCount: 0 } };
  }

  const threshold = Math.max(base.diagnostics.medianStepSec * 4, base.diagnostics.medianStepSec + 3600);
  let largeGapCount = 0;
  let expectedClosureGapCount = 0;
  for (let i = 1; i < base.candles.length; i++) {
    const previous = base.candles[i - 1];
    const next = base.candles[i];
    const gap = next.time - previous.time;
    if (gap <= threshold) continue;
    if (localDateKey(previous.time, context) !== localDateKey(next.time, context)) expectedClosureGapCount += 1;
    else largeGapCount += 1;
  }

  const diagnostics = { ...base.diagnostics, largeGapCount, expectedClosureGapCount };
  return { candles: base.candles, diagnostics: { ...diagnostics, ...status(diagnostics) } };
}

export { marketSessionPolicy, applySessionForecastPolicy };
