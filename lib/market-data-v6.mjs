import { loadMarketSource } from './market-source-v6.mjs';
import { analyzeV6 } from './analysis-engine-v6.mjs';
import { normalizeCandles, marketSessionPolicy, applySessionForecastPolicy } from './market-integrity-v6.mjs';
import { addForecastObservationTimes } from './market-time.mjs';
import { sliceDisplayCandles } from './model-history.mjs';

export async function buildMarketDataV6({ provider, symbol, interval, range, horizon }) {
  const source = await loadMarketSource({ provider, symbol, interval, range, horizon });
  let { plan, modelCandles, meta, quote, provenance } = source;
  const normalized = normalizeCandles(modelCandles, {
    provider,
    interval: meta.interval || interval,
    timezone: meta.timezone,
    gmtoffset: meta.gmtoffset,
  });
  modelCandles = normalized.candles;
  if (!modelCandles.length) throw new Error('No clean market rows were returned.');
  plan = { ...plan, historyLimited: !!plan.historyLimited || modelCandles.length < (plan.targetRows || 0) };

  const displayCandles = sliceDisplayCandles(modelCandles, plan);
  const session = marketSessionPolicy({ provider, meta, interval: meta.interval || interval });
  const analysis = analyzeV6(provider, symbol, meta.interval || interval, horizon, modelCandles);
  const timed = addForecastObservationTimes(analysis.modelForecast, modelCandles, meta, provider, meta.interval || interval);
  const forecast = applySessionForecastPolicy(timed, session, normalized.diagnostics);

  return {
    symbol,
    provider,
    meta,
    quote,
    candles: displayCandles,
    forecast,
    validation: analysis.validation,
    qualification: analysis.qualification,
    indicators: analysis.indicators,
    session,
    analysisIdentity: analysis.analysisIdentity,
    quality: { rows: displayCandles.length, integrity: normalized.diagnostics },
    provenance,
    compute: {
      validationOriginsMax: 60,
      warmAnalysisCacheHit: analysis.cacheHit,
      modelRows: modelCandles.length,
      displayRows: displayCandles.length,
      requestedRange: range,
      modelRange: plan.modelRange || null,
      historyLimited: !!plan.historyLimited,
      targetValidationRows: plan.targetRows || null,
      holdoutChecks: analysis.qualification?.checks || 0,
    },
    asOf: new Date().toISOString(),
  };
}
