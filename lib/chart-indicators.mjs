// Chart-only indicators computed from published historical bars.
// No look-ahead, no artificial candles, no training or trading signal claims.
const finite = x => x !== null && x !== undefined && Number.isFinite(Number(x));
const value = x => finite(x) ? Number(x) : null;
function sma(a, period) {
 const result = Array(a.length).fill(null); let sum = 0, missing = 0;
 for (let i = 0; i < a.length; i++) {
  if (a[i] === null) missing++; else sum += a[i];
  if (i >= period) { if (a[i-period] === null) missing--; else sum -= a[i-period]; }
  if (i >= period-1 && !missing) result[i] = sum/period;
 }
 return result;
}
function ema(a, period) {
 const result = Array(a.length).fill(null);
 const initial = sma(a, period);
 const alpha = 2/(period+1);
 for (let i = period-1; i < a.length; i++) {
  if (a[i] === null) continue;
  if (result[i-1] !== null && i>0) result[i]=alpha*a[i]+(1-alpha)*result[i-1];
  else if (initial[i]!==null) result[i]=initial[i];
 }
 return result;
}
function rollingVwap(prices, volume, period) {
 const result=Array(prices.length).fill(null);
 let weighted=0,total=0,bad=0;
 for(let i=0;i<prices.length;i++) {
  const ok=prices[i]!==null && volume[i]!==null && volume[i]>0;
  if(ok){weighted+=prices[i]*volume[i];total+=volume[i];}else bad++;
  if(i>=period){
   const old=i-period,previousOk=prices[old]!==null && volume[old]!==null && volume[old]>0;
   if(previousOk){weighted-=prices[old]*volume[old];total-=volume[old];}else bad--;
  }
  if(i>=period-1&&bad===0&&total>0)result[i]=weighted/total;
 }
 return result;
}
function rsi(close,period=14){
 const result=Array(close.length).fill(null);
 let gain=0,loss=0;
 for(let i=1;i<close.length;i++){
  if(close[i]===null||close[i-1]===null){gain=0;loss=0;continue;}
  const change=close[i]-close[i-1];
  if(i<=period){gain+=Math.max(change,0);loss+=Math.max(-change,0);
   if(i===period) {gain/=period;loss/=period;result[i]=loss===0?(gain===0?50:100):100-100/(1+gain/loss);}
  }else{
   gain=(gain*(period-1)+Math.max(change,0))/period;
   loss=(loss*(period-1)+Math.max(-change,0))/period;
   result[i]=loss===0?(gain===0?50:100):100-100/(1+gain/loss);
  }
 }
 return result;
}
export function computeChartIndicators(rows=[]) {
 const close=rows.map(r=>value(r?.close)), high=rows.map(r=>value(r?.high)),low=rows.map(r=>value(r?.low)),volume=rows.map(r=>value(r?.volume));
 const sma20=sma(close,20), middle=sma20, upper=Array(rows.length).fill(null),lower=Array(rows.length).fill(null);
 const typical=rows.map((r,i)=>high[i]===null||low[i]===null||close[i]===null?null:(high[i]+low[i]+close[i])/3);
 const donchianUpper=Array(rows.length).fill(null),donchianLower=Array(rows.length).fill(null);
 for(let i=19;i<rows.length;i++){
  if(middle[i]!==null){
   const window=close.slice(i-19,i+1);
   const sd=Math.sqrt(window.reduce((acc,x)=>acc+(x-middle[i])**2,0)/20);
   upper[i]=middle[i]+2*sd;lower[i]=middle[i]-2*sd;
  }
  const highs=high.slice(i-19,i+1),lows=low.slice(i-19,i+1);
  if(highs.every(finite)&&lows.every(finite)){donchianUpper[i]=Math.max(...highs);donchianLower[i]=Math.min(...lows);}
 }
 const fast=ema(close,12),slow=ema(close,26);
 const macd=fast.map((x,i)=>x===null||slow[i]===null?null:x-slow[i]);
 const signal=ema(macd,9);
 const histogram=macd.map((x,i)=>x===null||signal[i]===null?null:x-signal[i]);
 const trueRange=rows.map((r,i)=>high[i]===null||low[i]===null?null:Math.max(high[i]-low[i],i&&close[i-1]!==null?Math.abs(high[i]-close[i-1]):0,i&&close[i-1]!==null?Math.abs(low[i]-close[i-1]):0));
 const atr=sma(trueRange,14);
 return {sma20,sma50:sma(close,50),sma200:sma(close,200),ema9:ema(close,9),ema20:ema(close,20),ema50:ema(close,50),
  bbUpper:upper,bbMiddle:middle,bbLower:lower,vwap20:rollingVwap(typical,volume,20),
  donchianUpper,donchianLower,rsi14:rsi(close),atr14:atr,macd,macdSignal:signal,macdHistogram:histogram};
}
export const CHART_OVERLAYS=[
 {id:'sma20',label:'Simple average · 20',color:'#176cda'},
 {id:'sma50',label:'Simple average · 50',color:'#8641c6'},
 {id:'sma200',label:'Simple average · 200',color:'#333b49'},
 {id:'ema9',label:'Exponential average · 9',color:'#d45709'},
 {id:'ema20',label:'Exponential average · 20',color:'#087a71'},
 {id:'ema50',label:'Exponential average · 50',color:'#a83373'},
 {id:'bbUpper',label:'Bollinger upper · 20',color:'#7551c7'},
 {id:'bbMiddle',label:'Bollinger middle · 20',color:'#7551c7'},
 {id:'bbLower',label:'Bollinger lower · 20',color:'#7551c7'},
 {id:'vwap20',label:'Rolling volume-weighted price · 20',color:'#c45721'},
 {id:'donchianUpper',label:'20-bar highest high',color:'#087968'},
 {id:'donchianLower',label:'20-bar lowest low',color:'#087968'},
];
