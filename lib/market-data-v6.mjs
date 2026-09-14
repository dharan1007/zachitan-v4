import { microstructure } from './forecast.mjs';
import { loadMarketSource } from './market-source-v6.mjs';
import { analyzeV6 } from './analysis-engine-v6.mjs';
import { normalizeCandles, marketSessionPolicy, applySessionForecastPolicy } from './market-integrity-v6.mjs';
import { addForecastObservationTimes } from './market-time.mjs';
import { sliceDisplayCandles } from './model-history.mjs';
import { marketQualityV6 } from './market-quality-v6.mjs';

export async function buildMarketDataV6({ provider, symbol, interval, range, horizon }) {
  const source = await loadMarketSource({ provider, symbol, interval, range, horizon });
  let { plan, modelCandles, meta, quote, book, trades, provenance } = source;
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
    microstructure: provider === 'coinbase' ? microstructure(book, trades) : null,
    session,
    publication: {
      state: forecast?.decisionState || 'UNAVAILABLE',
      modelStatus: forecast?.modelStatus || null,
      reason: forecast?.abstainReason || (forecast?.decisionState === 'RESEARCH_ONLY' ? analysis.qualification?.reason || analysis.validation?.reason || 'Numeric targets are withheld until all evidence gates pass.' : null),
      pointModel: forecast?.pointModel || null,
      qualificationState: analysis.qualification?.state || 'INSUFFICIENT',
    },
    analysisIdentity: analysis.analysisIdentity,
    snapshot: {
      id: analysis.analysisIdentity,
      firstObservation: modelCandles.at(0)?.time || null,
      lastObservation: modelCandles.at(-1)?.time || null,
      rows: modelCandles.length,
      immutableInputs: true,
    },
    quality: marketQualityV6(displayCandles, meta, provider, session, normalized.diagnostics),
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
