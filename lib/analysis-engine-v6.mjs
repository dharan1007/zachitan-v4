import { createHash } from 'node:crypto';
import { indicators } from './forecast.mjs';
import { validateEnsemble } from './model-v5.mjs';
import { forecastV6 } from './model-v6.mjs';
import { evaluatePublicationHoldout } from './model-holdout.mjs';
import { auditNextBar } from './next-bar-audit.mjs';

const cache = globalThis.__zachitanV6AnalysisCache || new Map();
globalThis.__zachitanV6AnalysisCache = cache;

function keyFor(provider, symbol, interval, horizon, candles) {
  // Include the entire as-observed OHLCV input, not just first/last closes:
  // late source corrections must invalidate cached model metrics and forecasts.
  const hash = createHash('sha256');
  for (const row of candles) {
    hash.update([row.time, row.open, row.high, row.low, row.close, row.volume].join(':') + ';');
  }
  return `v6:${provider}:${symbol}:${interval}:${horizon}:${hash.digest('hex')}`;
}

export function analyzeV6(provider, symbol, interval, horizon, candles) {
  const key = keyFor(provider, symbol, interval, horizon, candles);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60_000) return { ...hit.value, cacheHit: true };

  const validation = validateEnsemble(candles, horizon, 60);
  const qualification = evaluatePublicationHoldout(candles, horizon, { minimumChecks: 8, trainingChecks: 60 });
  const modelForecast = forecastV6(candles, horizon, validation, qualification);
  const nextBar = provider === 'amfi' || provider === 'ecb'
    ? { available: false, reason: 'This source publishes NAV/reference observations rather than independently observed OHLCV candles.' }
    : auditNextBar(candles, { provenance: provider });
  const value = { validation, qualification, modelForecast, nextBar, indicators: indicators(candles), analysisIdentity: key };
  cache.set(key, { at: Date.now(), value });

  if (cache.size > 72) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, cache.size - 54);
    for (const [k] of oldest) cache.delete(k);
  }
  return { ...value, cacheHit: false };
}
