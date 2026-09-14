import { indicators } from './forecast.mjs';
import { validateEnsemble } from './model-v5.mjs';
import { forecastV6 } from './model-v6.mjs';
import { evaluatePublicationHoldout } from './model-holdout.mjs';

const cache = globalThis.__zachitanV6AnalysisCache || new Map();
globalThis.__zachitanV6AnalysisCache = cache;

function keyFor(provider, symbol, interval, horizon, candles) {
  const first = candles.at(0), last = candles.at(-1);
  return `v6:${provider}:${symbol}:${interval}:${horizon}:${first?.time || 0}:${last?.time || 0}:${last?.close || 0}:${candles.length}`;
}

export function analyzeV6(provider, symbol, interval, horizon, candles) {
  const key = keyFor(provider, symbol, interval, horizon, candles);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60_000) return { ...hit.value, cacheHit: true };

  const validation = validateEnsemble(candles, horizon, 60);
  const qualification = evaluatePublicationHoldout(candles, horizon, { minimumChecks: 8, trainingChecks: 60 });
  const modelForecast = forecastV6(candles, horizon, validation, qualification);
  const value = { validation, qualification, modelForecast, indicators: indicators(candles), analysisIdentity: key };
  cache.set(key, { at: Date.now(), value });

  if (cache.size > 72) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, cache.size - 54);
    for (const [k] of oldest) cache.delete(k);
  }
  return { ...value, cacheHit: false };
}
