// Bounded, predeclared, source-only cross-asset research screen.
// Not a broker order router, proprietary-firm consensus, or return guarantee.
import * as yf from './providers/yahoo.mjs';
import * as cb from './providers/coinbase.mjs';
import { normalizeCandles } from './market-integrity.mjs';

export const OPPORTUNITY_UNIVERSE = Object.freeze({
 India:[['RELIANCE.NS','Reliance Industries','yahoo'],['TCS.NS','Tata Consultancy Services','yahoo'],['HDFCBANK.NS','HDFC Bank','yahoo']],
 Technology:[['AAPL','Apple','yahoo'],['MSFT','Microsoft','yahoo'],['NVDA','Nvidia','yahoo']],
 Financials:[['JPM','JPMorgan Chase','yahoo'],['GS','Goldman Sachs','yahoo'],['V','Visa','yahoo']],
 Healthcare:[['JNJ','Johnson & Johnson','yahoo'],['UNH','UnitedHealth','yahoo'],['PFE','Pfizer','yahoo']],
 Energy:[['XOM','Exxon Mobil','yahoo'],['CVX','Chevron','yahoo'],['XLE','Energy sector ETF','yahoo']],
 Consumer:[['AMZN','Amazon','yahoo'],['WMT','Walmart','yahoo'],['COST','Costco','yahoo']],
 Industrials:[['CAT','Caterpillar','yahoo'],['HON','Honeywell','yahoo'],['GE','GE Aerospace','yahoo']],
 'US indices':[['^GSPC','S&P 500 index','yahoo'],['^IXIC','Nasdaq Composite index','yahoo'],['^DJI','Dow Jones index','yahoo']],
 'India indices':[['^NSEI','NIFTY 50 index','yahoo'],['^NSEBANK','NIFTY Bank index','yahoo'],['^BSESN','Sensex index','yahoo']],
 Forex:[['EURUSD=X','EUR/USD','yahoo'],['USDINR=X','USD/INR','yahoo'],['USDJPY=X','USD/JPY','yahoo']],
 Commodities:[['GC=F','Gold futures reference','yahoo'],['CL=F','WTI crude futures reference','yahoo'],['SI=F','Silver futures reference','yahoo']],
 Crypto:[['BTC-USD','Bitcoin','coinbase'],['ETH-USD','Ethereum','coinbase'],['SOL-USD','Solana','coinbase']],
});
const DAYS=5,EPS=1e-12;
const mean=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
const finite=x=>x!==null&&x!==undefined&&Number.isFinite(Number(x));
function sma(rows,i,n){if(i<n-1)return null;let total=0;for(let k=i-n+1;k<=i;k++)total+=rows[k].close;return total/n}
function signalAt(rows,i){
 if(i<85||!(rows[i].close>0&&rows[i-20].close>0))return null;
 const fast=sma(rows,i,20),slow=sma(rows,i,60),close=rows[i].close;
 const change=Math.log(close/rows[i-20].close);
 if(fast>slow&&close>fast&&change>0.012)return 'UP';
 if(fast<slow&&close<fast&&change<-.012)return 'DOWN';
 return 'MIXED';
}
function atr(rows){
 const last=rows.length-1;
 if(last<15)return null;
 let sum=0;
 for(let i=last-13;i<=last;i++){
  const x=rows[i],prior=rows[i-1].close;
  sum+=Math.max(x.high-x.low,Math.abs(x.high-prior),Math.abs(x.low-prior));
 }
 return sum/14;
}
export function wilsonLower(wins,total,z=1.96){
 if(!total)return null;
 const p=wins/total,den=1+z*z/total;
 return Math.max(0,(p+z*z/(2*total)-z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total)))/den);
}
export function evaluateOpportunity(candles,{assetClass='',source='',session='',currency='',symbol='',name=''}={}){
 const cleaned=normalizeCandles(candles);
 const rows=cleaned.candles;
 if(rows.length<145||cleaned.diagnostics.critical)return {symbol,name,source,available:false,reason:rows.length<145?'Insufficient completed daily observations':'Market-data integrity is critical'};
 const last=rows.at(-1),currentSignal=signalAt(rows,rows.length-1);
 const tests=[];
 // Predeclared signal, nonoverlapping chronology and NEXT observed open entry:
 // end-to-end outcomes require a later, fully published five-day exit open.
 for(let i=90;i+1+DAYS<rows.length;i+=DAYS+1){
  const side=signalAt(rows,i);
  if(side==='MIXED'||side===null)continue;
  const entry=rows[i+1]?.open,exit=rows[i+1+DAYS]?.open;
  if(!(entry>0&&exit>0))continue;
  const gross=side==='UP'?Math.log(exit/entry):Math.log(entry/exit);
  tests.push({side,originTime:rows[i].time,entryTime:rows[i+1].time,exitTime:rows[i+1+DAYS].time,gross});
 }
 const matching=tests.filter(r=>r.side===currentSignal);
 const wins=matching.filter(r=>r.gross>0).length,n=matching.length;
 const meanGross=mean(matching.map(r=>r.gross));
 const lower=wilsonLower(wins,n);
 const recent=matching.slice(-8),earlier=matching.slice(0,-8);
 const recentWin=recent.length>=5?recent.filter(x=>x.gross>0).length/recent.length:null;
 const priorWin=earlier.length>=5?earlier.filter(x=>x.gross>0).length/earlier.length:null;
 const drift=recentWin!==null&&priorWin!==null&&recentWin+0.2<priorWin;
 const risk=atr(rows),attribution=last.close>0&&risk!==null?risk/last.close:null;
 const volumeSample=rows.slice(-21).map(x=>x.volume).filter(x=>x>0);
 const volumeRatio=last.volume>0&&volumeSample.length>=12?last.volume/(mean(volumeSample.slice(0,-1))||1):null;
 // Signal qualification is strict; a positive historical win-rate alone is not a promise.
 const qualified=currentSignal!=='MIXED'&&currentSignal!==null&&n>=20&&lower>0.5&&
   meanGross>0&&!drift&&cleaned.diagnostics.status!=='CRITICAL';
 const status=qualified?'HISTORICAL_SIGNAL':currentSignal==='MIXED'?'NO_SIGNAL':'UNQUALIFIED';
 const tradable=!['index','future'].includes(assetClass);
 return {
  available:true,symbol,name,source,assetClass,currency,session,lastCompletedTime:last.time,
  lastCompletedClose:last.close,currentSignal,status,qualified,tradable,
  sourceCandles:rows.length,historicalHorizonDays:DAYS,
  testedSignalChecks:n,matchingWins:wins,historicalWinRate:n?wins/n:null,
  wilsonLower95:lower,historicalMeanGrossReturnPct:meanGross===null?null:100*Math.expm1(meanGross),
  recentWinRate:recentWin,priorWinRate:priorWin,drift,atr:risk,atrPct:attribution,
  observedVolumeRatio:volumeRatio,
  // These are REFERENCE ONLY. A historical five-day next-open test does not
  // backtest a stop/target order or prove price availability or liquidity.
  referenceEntry:last.close,referenceStop:risk?currentSignal==='DOWN'?last.close+1.5*risk:last.close-1.5*risk:null,
  referenceTarget:risk?currentSignal==='DOWN'?last.close-2*risk:last.close+2*risk:null,
  strategy:'Predeclared 20/60 trend + 20-day momentum; origin-close signal; following completed bar OPEN entry, five following sessions, EXIT at the subsequent OPEN; no fees, spreads, slippage, borrow charges or intrabar stop tests.',
  institutionalConsensus:'NOT_CONNECTED',
  coverage:'Curated sampled symbols; not a comprehensive market-wide search.',
 };
}
export async function screenSegment(segment){
 const universe=OPPORTUNITY_UNIVERSE[segment];
 if(!universe)return {ok:false,reason:'Unknown sector or asset class'};
 const outcomes=await Promise.allSettled(universe.map(async([symbol,name,provider])=>{
  const result=provider==='coinbase'
   ? {candles:await cb.candles(symbol,86400,400),
      meta:{assetClass:'crypto',currency:symbol.split('-').at(-1),marketState:'OPEN'},provenance:cb.provenance}
   : {...await yf.chart(symbol,'1d','2y'),provenance:yf.provenance};
  // No daily intraday source values enter an opportunity screen. Yahoo's
  // regular-session daily candle is removed until its trading session closes.
  let candles=result.candles;
  if(provider==='coinbase'){
   const now=Date.now()/1000;
   if(candles.at(-1)?.time+86400>now-10)candles=candles.slice(0,-1);
  }else if(result.meta.marketState==='REGULAR'){
   // Market-state signal takes precedence over ambiguous midnight timestamps.
   if(candles.length)candles=candles.slice(0,-1);
  }
  const assetClass=result.meta.assetClass||'market';
  return evaluateOpportunity(candles,{symbol,name,assetClass,source:result.provenance.provider,
   currency:result.meta.currency||'',session:result.meta.marketState||'UNKNOWN'});
 }));
 const rows=outcomes.map((result,i)=>result.status==='fulfilled'?result.value:
  {available:false,symbol:universe[i][0],name:universe[i][1],reason:'Publisher data unavailable: '+String(result.reason?.message||'feed error').slice(0,150)});
 return {ok:true,segment,asOf:new Date().toISOString(),sampled:universe.length,
  available:rows.filter(x=>x.available).length,
  // Qualified ranking is an ordering of measured historical data only,
  // not expected profit or an institution's investment verdict.
  rows:rows.sort((a,b)=>(Number(b.qualified)-Number(a.qualified))||
   ((b.qualified?b.wilsonLower95:0)-(a.qualified?a.wilsonLower95:0))||
   ((Number(b.atrPct)||0)-(Number(a.atrPct)||0))),
  verifiedInstitutionalVerdicts:0,
  methodology:'Historical reconstructed non-overlapping five-day next-open signal study; public-source-data-only, not live as-issued evidence.',
 };
}
