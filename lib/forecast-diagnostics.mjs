// Explanatory diagnostics: observed measurements separated from model limitations.
// Never present an unmeasured factor as a proven cause of any particular miss.
const finite=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n));
const stdev=xs=>{
 if(xs.length<5)return null;
 const avg=xs.reduce((a,b)=>a+b,0)/xs.length;
 return Math.sqrt(xs.reduce((a,b)=>a+(b-avg)**2,0)/xs.length);
};
export function forecastDiagnostics({candles=[],validation={},qualification={},nextBar={},meta={},provider='',quality={}}={}){
 const measured=[],unmeasured=[];
 const skill=validation?.ensembleSkillVsNoChange??validation?.skillVsNoChange;
 if(finite(skill)&&Number(skill)<=0)measured.push({
  code:'PRICE_BASELINE_UNDERPERFORMANCE',severity:'CRITICAL',
  title:'Multi-bar point model underperformed the unchanged-price benchmark',
  detail:'Measured walk-forward skill: '+(100*skill).toFixed(2)+'%. The more complex model added historical error on this evaluation window.',
  samples:validation?.checks||0,
 });
 if(validation?.available&&finite(validation?.directionAccuracy)&&validation.directionAccuracy<=.5)
  measured.push({code:'DIRECTION_NO_EDGE',severity:'HIGH',title:'Directional success was not above one-half on this validation window',
   detail:'Observed direction hit rate: '+(100*validation.directionAccuracy).toFixed(1)+'%. This statistic alone does not establish a statistically significant failure or success.',
   samples:validation.checks||0});
 if(qualification?.available&&!qualification.qualified)
  measured.push({code:'HOLDOUT_UNQUALIFIED',severity:'HIGH',title:'Later frozen qualification failed',
   detail:qualification.reason||'The subsequent holdout failed its predeclared gate.',samples:qualification.checks||0});
 if(nextBar?.available){
  const fields=['open','high','low','close','volume','range','body'];
  for(const field of fields){
   const info=nextBar.accuracy?.[field];
   if(info?.samples>=12&&finite(info.skill)&&info.skill<-.03)
    measured.push({code:'NEXT_'+field.toUpperCase()+'_BASELINE_FAILURE',severity:'HIGH',
     title:'Next '+field+' analogue lost to its matched naive baseline',
     detail:'Measured skill '+(100*info.skill).toFixed(2)+'% over '+info.samples+' scored historical origins. A baseline fallback may be preferable here.',
     samples:info.samples});
  }
  if((nextBar?.directionChecks||0)<20)measured.push({
   code:'NEXT_DIRECTION_INSUFFICIENT',severity:'CAUTION',
   title:'Insufficient nonzero next-bar direction calls',
   detail:'Only '+(nextBar?.directionChecks||0)+' eligible direction calls; a reported hit rate must not be treated as reliable.',
   samples:nextBar.directionChecks||0});
 }
 const clean=Array.isArray(candles)?candles.filter(x=>x?.close>0):[];
 const returns=[];
 for(let i=1;i<clean.length;i++){
  if(clean[i-1].close>0)returns.push(Math.log(clean[i].close/clean[i-1].close));
 }
 if(returns.length>=85){
  const recent=stdev(returns.slice(-20)),older=stdev(returns.slice(-80,-20));
  if(finite(recent)&&finite(older)&&older>0&&recent/older>1.5)
   measured.push({code:'VOLATILITY_REGIME_SHIFT',severity:'CAUTION',
    title:'Recent realized-return dispersion exceeds its earlier window',
    detail:'Last 20-bar standard deviation / previous 60-bar standard deviation = '+(recent/older).toFixed(2)+'×. This is observed market instability, not proof of causation.',
    samples:80});
 }
 if(quality?.integrity?.degraded)measured.push({
  code:'SOURCE_INTEGRITY',severity:quality.integrity.critical?'CRITICAL':'CAUTION',
  title:'Source OHLCV required integrity normalization',detail:quality.integrity.reason||'Some incoming rows were repaired or discarded.',
  samples:quality.integrity.inputRows||0});
 if(meta?.rangeAdjusted)measured.push({
  code:'SOURCE_LOOKBACK_CAPPED',severity:'CAUTION',
  title:'Requested historical lookback was capped by the publisher',
  detail:'The requested historical period is not fully available for this interval, limiting model calibration.',
  samples:clean.length});
 if(provider==='yahoo'){
  unmeasured.push({
   code:'DATA_RIGHTS_AND_LATENCY',title:'Live quote may be delayed and is not an exchange-entitled trade feed',
   detail:'A delayed source is inadequate for guaranteed executable next-open prices or transaction-sensitive signals.'});
  if(['stock','etf'].includes(meta?.assetClass))unmeasured.push({
   code:'CORPORATE_ACTIONS',title:'Corporate actions and total-return adjustment are not independently verified',
   detail:'Raw price history can be discontinuous across splits and dividends. No event-by-event adjusted-price validation has been completed.'});
  if(meta?.assetClass==='future')unmeasured.push({
   code:'FUTURES_ROLLS',title:'Continuous futures roll and contract-multiplier conventions are not verified',
   detail:'A visible futures ticker is not itself a directly executable continuous contract; roll methodology can affect historical returns.'});
 }
 if(provider==='amfi'||provider==='ecb')unmeasured.push({
  code:'REFERENCE_SERIES',title:'Reference values are not genuine tradable intraday OHLCV',
  detail:'NAV/ECB observations cannot support independent open, high, low and traded-volume error measurements.'});
 unmeasured.push({
  code:'EVENT_AND_FUNDAMENTAL_GAP',title:'Unobserved announcements, earnings and macro shocks',
  detail:'The production next-bar analogue uses past OHLCV; it is not trained on timestamped, point-in-time earnings, central-bank events, positioning, options volatility or analyst revisions.'});
 unmeasured.push({
  code:'EXECUTION_GAP',title:'No verified transaction-cost or order-fill model',
  detail:'Forecast error, realized profit and executable return are separate. Spreads, slippage, market impact, borrowing and taxes are not measured by this model.'});
 return {asOf:Date.now(),hasMeasuredIssues:measured.length>0,measured,unmeasured,
  methodology:'Findings are factual measurements or explicitly identified omissions. They are not unverified explanations of a particular historical price move.'};
}
