import { microstructure } from './forecast.mjs';
import { loadMarketSource } from './market-source-v6.mjs';
import { analyzeV6 } from './analysis-engine-v6.mjs';
import { normalizeCandles, marketSessionPolicy, applySessionForecastPolicy } from './market-integrity-v6.mjs';
import { addForecastObservationTimes } from './market-time.mjs';
import { sliceDisplayCandles } from './model-history.mjs';
import { marketQualityV6 } from './market-quality-v6.mjs';
import { forecastDiagnostics } from './forecast-diagnostics.mjs';

function exchangeDate(seconds,meta={}){
 if(!Number.isFinite(Number(seconds)))return null;
 const zone=String(meta.timezone||'');
 if(zone){try{return new Intl.DateTimeFormat('en-CA',
  {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'})
  .format(new Date(Number(seconds)*1000));}catch{}}
 const offset=Number(meta.gmtoffset)||0;
 return new Date((Number(seconds)+offset)*1000).toISOString().slice(0,10);
}
// A Yahoo daily candle is incomplete if it belongs to the still-open local
// exchange session, regardless of whether its UTC timestamp is at midnight.
export function isUnfinishedYahooDailyBar(lastTime,meta={},nowSec=Date.now()/1000){
 return String(meta.marketState||'').toUpperCase()==='REGULAR'&&
  lastTime!==null&&lastTime!==undefined&&Number.isFinite(Number(lastTime))&&Number(lastTime)>0&&
  exchangeDate(lastTime,meta)===exchangeDate(nowSec,meta);
}

export function isReferenceOnlySource(provider,meta={}){
 return provider==='amfi'||provider==='ecb'||
  String(meta.assetClass||'').toLowerCase()==='mutual_fund';
}

export async function buildMarketDataV6({ provider, symbol, interval, range, horizon }) {
  const source = await loadMarketSource({ provider, symbol, interval, range, horizon });
  let { plan, modelCandles, meta, quote, book, trades, provenance } = source;
  const referenceValueOnly = isReferenceOnlySource(provider,meta);
  // The source rate/NAV is real. Its equal O/H/L/C presentation is only a
  // rendering proxy, not publisher-observed opening/high/low values.
  meta = { ...meta, referenceValueOnly, ohlcvPublished: !referenceValueOnly };
  provenance = { ...provenance, referenceValueOnly, constructedOHLCDisplay: referenceValueOnly };
  const normalized = normalizeCandles(modelCandles, {
    provider,
    interval: meta.interval || interval,
    timezone: meta.timezone,
    gmtoffset: meta.gmtoffset,
  });
  modelCandles = normalized.candles;
  if (!modelCandles.length) throw new Error('No clean market rows were returned.');
  // Exchange APIs may include the still-forming last candle. Never train or
  // score against an OHLCV bar before its interval has finished.
  const seconds = { '1m': 60, '2m': 120, '5m': 300, '15m': 900, '30m': 1800,
    '60m': 3600, '1h': 3600, '90m': 5400, '6h': 21600, '1d': 86400 }[meta.interval || interval];
  const last = modelCandles.at(-1);
  const now = Date.now() / 1000;
  const partialCandleExcluded = Number.isFinite(seconds) && last &&
    (provider === 'coinbase' || (provider === 'yahoo' && seconds < 86400)) &&
    last.time + seconds > now - 5;
  if (partialCandleExcluded) modelCandles = modelCandles.slice(0, -1);
  // Daily Yahoo bars are incomplete during regular trading. Provider session
  // metadata determines this; timestamps alone cannot identify today's close.
  const inProgressDaily = provider === 'yahoo' && seconds === 86400 &&
    isUnfinishedYahooDailyBar(modelCandles.at(-1)?.time,meta,now);
  if (inProgressDaily) modelCandles = modelCandles.slice(0, -1);
  if (!modelCandles.length) throw new Error('No completed source candles available.');
  const excludedUnfinished = Boolean(partialCandleExcluded || inProgressDaily);
  plan = { ...plan, historyLimited: !!plan.historyLimited || modelCandles.length < (plan.targetRows || 0) };

  const displayCandles = sliceDisplayCandles(modelCandles, plan);
  const session = marketSessionPolicy({ provider, meta, interval: meta.interval || interval });
  const analysis = analyzeV6(provider, symbol, meta.interval || interval, horizon, modelCandles, { referenceOnly: referenceValueOnly });
  const timed = addForecastObservationTimes(analysis.modelForecast, modelCandles, meta, provider, meta.interval || interval);
  const forecast = applySessionForecastPolicy(timed, session, normalized.diagnostics);
  const nextBar = normalized.diagnostics.critical
    ? { available: false, reason: 'OHLCV audit withheld: source data integrity is critical.' }
    : analysis.nextBar;
  const quality = marketQualityV6(displayCandles, meta, provider, session, normalized.diagnostics);
  const diagnostic = forecastDiagnostics({ candles: modelCandles, validation: analysis.validation,
    qualification: analysis.qualification, nextBar, meta, provider, quality });

  return {
    symbol,
    provider,
    meta,
    quote,
    candles: displayCandles,
    forecast,
    nextBar,
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
      excludedUnfinished,
    },
    quality,
    diagnostic,
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
      nextBarEvaluationChecks: nextBar.evaluationChecks || 0,
      excludedUnfinished,
    },
    asOf: new Date().toISOString(),
  };
}
