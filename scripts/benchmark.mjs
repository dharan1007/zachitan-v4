import fs from 'node:fs/promises';
import path from 'node:path';
import * as yf from '../lib/providers/yahoo.mjs';
import * as cb from '../lib/providers/coinbase.mjs';
import { validate } from '../lib/forecast.mjs';

const universe = [
  { symbol: 'AAPL', name: 'Apple', assetClass: 'US equity', provider: 'yahoo' },
  { symbol: 'SPY', name: 'S&P 500 ETF', assetClass: 'US ETF', provider: 'yahoo' },
  { symbol: '^NSEI', name: 'NIFTY 50', assetClass: 'India index', provider: 'yahoo' },
  { symbol: 'GC=F', name: 'Gold futures', assetClass: 'commodity future', provider: 'yahoo' },
  { symbol: 'CL=F', name: 'Crude oil futures', assetClass: 'commodity future', provider: 'yahoo' },
  { symbol: 'USDINR=X', name: 'USD/INR', assetClass: 'FX', provider: 'yahoo' },
  { symbol: 'BTC-USD', name: 'Bitcoin', assetClass: 'crypto', provider: 'coinbase' },
  { symbol: 'ETH-USD', name: 'Ethereum', assetClass: 'crypto', provider: 'coinbase' },
];
const horizons = [5, 20];

async function history(x) {
  if (x.provider === 'coinbase') return cb.candles(x.symbol, 86400, 1200);
  return (await yf.chart(x.symbol, '1d', '5y')).candles;
}

function median(values) {
  const a = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!a.length) return null;
  const m = Math.floor(a.length/2);
  return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
}
function mean(values) {
  const a=values.filter(Number.isFinite);
  return a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
}

const rows=[];
for (const instrument of universe) {
  try {
    const candles = await history(instrument);
    for (const horizon of horizons) {
      const v = validate(candles, horizon, 60);
      rows.push({
        ...instrument,
        horizon,
        observations: candles.length,
        available: !!v.available,
        checks: v.checks ?? 0,
        nonOverlapping: v.nonOverlapping ?? null,
        maseNoChange: v.maseNoChange ?? null,
        skillVsNoChange: v.skillVsNoChange ?? null,
        directionAccuracy: v.directionAccuracy ?? null,
        momentumDirectionAccuracy: v.momentumDirectionAccuracy ?? null,
        brier: v.brier ?? null,
        brierSkillVs50: v.brierSkillVs50 ?? null,
        logLoss: v.logLoss ?? null,
        coverage50: v.coverage?.[50] ?? null,
        coverage80: v.coverage?.[80] ?? null,
        coverage90: v.coverage?.[90] ?? null,
        reason: v.reason ?? null,
      });
    }
  } catch (error) {
    for (const horizon of horizons) rows.push({ ...instrument, horizon, available:false, checks:0, error:error?.message||String(error) });
  }
}

const valid=rows.filter(x=>x.available);
const uniqueInstruments=new Set(valid.map(x=>x.symbol)).size;
const pointPositive=valid.filter(x=>x.skillVsNoChange>0).length;
const probabilityPositive=valid.filter(x=>x.brierSkillVs50>0).length;
const jointPositive=valid.filter(x=>x.skillVsNoChange>0&&x.brierSkillVs50>0).length;
const aggregate={
  requestedCases:rows.length,
  validCases:valid.length,
  uniqueInstruments,
  medianSkillVsNoChange:median(valid.map(x=>x.skillVsNoChange)),
  meanSkillVsNoChange:mean(valid.map(x=>x.skillVsNoChange)),
  medianBrierSkillVs50:median(valid.map(x=>x.brierSkillVs50)),
  meanBrierSkillVs50:mean(valid.map(x=>x.brierSkillVs50)),
  pointPositiveRate:valid.length?pointPositive/valid.length:0,
  probabilityPositiveRate:valid.length?probabilityPositive/valid.length:0,
  jointPositiveRate:valid.length?jointPositive/valid.length:0,
  medianDirectionAccuracy:median(valid.map(x=>x.directionAccuracy)),
};

const broadAccuracyGate = {
  minimumValidCases: 12,
  minimumUniqueInstruments: 6,
  minimumJointPositiveRate: 0.65,
  minimumMedianPointSkill: 0.02,
  minimumMedianBrierSkill: 0.01,
};
const broadAccuracyClaimAllowed =
  aggregate.validCases >= broadAccuracyGate.minimumValidCases &&
  aggregate.uniqueInstruments >= broadAccuracyGate.minimumUniqueInstruments &&
  aggregate.jointPositiveRate >= broadAccuracyGate.minimumJointPositiveRate &&
  (aggregate.medianSkillVsNoChange ?? -Infinity) >= broadAccuracyGate.minimumMedianPointSkill &&
  (aggregate.medianBrierSkillVs50 ?? -Infinity) >= broadAccuracyGate.minimumMedianBrierSkill;

const report={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  methodology:'Five-year daily histories where available. Zachitan walk-forward validation uses chronological prefixes and non-overlapping origins. Benchmarked against unchanged-price point error, 50/50 probability baseline, and simple horizon-momentum direction.',
  universe,
  horizons,
  aggregate,
  broadAccuracyGate,
  broadAccuracyClaimAllowed,
  rows,
  warning:broadAccuracyClaimAllowed ? 'This automated screen is positive evidence, not a guarantee or substitute for a frozen untouched publication holdout.' : 'Broad market-prediction accuracy claims are not permitted by this benchmark result.'
};

const out=process.env.BENCHMARK_OUTPUT||'benchmark-output/report.json';
await fs.mkdir(path.dirname(out),{recursive:true});
await fs.writeFile(out,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(valid.length<8){console.error(`Only ${valid.length}/${rows.length} benchmark cases were usable.`);process.exitCode=2;}
