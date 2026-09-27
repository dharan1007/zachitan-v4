import test from 'node:test';
import assert from 'node:assert/strict';
import {computeChartIndicators,CHART_OVERLAYS} from '../lib/chart-indicators.mjs';

const row=(i,volume=100)=>({time:1700000000+i*300,open:100+i,high:102+i,low:99+i,close:101+i,volume});
const approx=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance, String(actual)+' !== '+String(expected));

test('moving average windows are properly seeded; early data is not represented as observed average',()=>{
 const x=computeChartIndicators(Array.from({length:240},(_,i)=>row(i)));
 assert.equal(x.sma20[18],null);
 approx(x.sma20[19],110.5);
 assert.equal(x.sma200[198],null);
 approx(x.sma200[199],200.5);
 approx(x.ema9[8],105);
 assert.ok(Number.isFinite(x.ema20[40]));
 assert.equal(CHART_OVERLAYS.length,12);
});

test('volatility bands, RSI and MACD treat a constant candle as a zero-volatility signal',()=>{
 const x=computeChartIndicators(Array.from({length:120},(_,i)=>({
  time:1700000000+i*300,open:100,high:100,low:100,close:100,volume:10,
 })));
 approx(x.bbMiddle[19],100);
 approx(x.bbUpper[19],100);
 approx(x.bbLower[19],100);
 approx(x.rsi14[14],50);
 approx(x.macd[60],0);
 approx(x.macdSignal[60],0);
 approx(x.macdHistogram[60],0);
 approx(x.atr14[14],0);
});

test('volume-weighted average never treats missing publisher volume as zero',()=>{
 const x=computeChartIndicators(Array.from({length:30},(_,i)=>row(i,i===5?null:100)));
 assert.equal(x.vwap20[19],null);
 assert.equal(x.vwap20[24],null);
 assert.ok(x.vwap20[25]>0);
 const first=computeChartIndicators(Array.from({length:20},(_,i)=>row(i,10+i))).vwap20[19];
 const reference=Array.from({length:20},(_,i)=>(100+i+2/3)*(10+i)).reduce((sum,term)=>sum+term,0)/Array.from({length:20},(_,i)=>10+i).reduce((sum,x)=>sum+x,0);
 approx(first,reference);
});

test('changing the future cannot revise any historical overlay value',()=>{
 const prefix=Array.from({length:230},(_,i)=>row(i));
 const original=computeChartIndicators(prefix);
 const polluted=computeChartIndicators([...prefix,{...row(230),high:9999,low:1,close:9999,volume:1e9}]);
 for(const key of Object.keys(original))assert.deepEqual(polluted[key].slice(0,prefix.length),original[key],key);
});

test('invalid and missing high/low must not enter range or volatility overlays',()=>{
 const rows=Array.from({length:30},(_,i)=>row(i));
 rows[10].high=null;
 const x=computeChartIndicators(rows);
 assert.equal(x.atr14[14],null);
 assert.equal(x.donchianUpper[19],null);
 assert.equal(x.donchianUpper[29],null);
});
