// An honest, per-browser, as-issued next-bar ledger. No server calls or cron.
// Historical reconstructed backtests are NEVER inserted into this store.
export const LIVE_LEDGER_KEY='zachitan.as-issued.v1';
const FIELDS=['open','high','low','close','volume','range','body'];
const VERSION='adaptive-next-bar-v1';
const finite=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));
export const ledgerIdentity=(provider,symbol,interval,time)=>[VERSION,provider,symbol,interval,time].join('|');
const size=x=>({range:finite(x?.high)&&finite(x?.low)?Number(x.high)-Number(x.low):null,
 body:finite(x?.open)&&finite(x?.close)?Math.abs(Number(x.close)-Number(x.open)):null});
export function issueAndSettleLedger(previous=[],snapshot={},issuedAt=null){
 const original=Array.isArray(previous)?previous:[];
 const provider=snapshot?.provider,symbol=snapshot?.symbol,interval=snapshot?.meta?.interval;
 const completed=Array.isArray(snapshot?.candles)?snapshot.candles.filter(r=>finite(r?.time)&&r.time>0).slice().sort((a,b)=>a.time-b.time):[];
 const index=new Map(original.filter(x=>x&&typeof x.id==='string').map(x=>[x.id,x]));
 // Finalize ONLY with a distinct, later provider-completed candle; quotes or
 // historical backtest rows must never settle an actually issued prediction.
 for(const saved of index.values()){
  if(saved.status!=='PENDING'||saved.provider!==provider||saved.symbol!==symbol||saved.interval!==interval)continue;
  const next=completed.find(x=>x.time>saved.originTime);
  if(!next)continue;
  const actual={...next,...size(next)};
  const observed=Object.fromEntries(FIELDS.map(k=>[k,finite(actual[k])?Number(actual[k]):null]));
  const absErrorPct=Object.fromEntries(FIELDS.map(k=>[k,
   saved.predicted?.[k]>0&&observed[k]>0?100*Math.abs(saved.predicted[k]/observed[k]-1):null]));
  index.set(saved.id,{...saved,status:'SETTLED',actualTime:next.time,observed,absErrorPct});
 }
 const forecast=snapshot?.nextBar?.forecast,origin=completed.at(-1);
 // Only the snapshot computed from the latest completed origin may be logged.
 // A failed integrity gate or reference-only source cannot issue.
 if(snapshot?.nextBar?.available===true&&snapshot?.quality?.integrity?.critical!==true&&
   !snapshot?.meta?.referenceValueOnly&&provider&&symbol&&interval&&origin&&
   origin.time===snapshot.nextBar.latestCompletedTime&&finite(origin.close)&&
   forecast&&FIELDS.slice(0,4).every(k=>finite(forecast[k])&&Number(forecast[k])>0)){
  const id=ledgerIdentity(provider,symbol,interval,origin.time);
  if(!index.has(id)){
   const predicted=Object.fromEntries(FIELDS.map(k=>[k,finite(forecast[k])?Number(forecast[k]):null]));
   index.set(id,{id,modelVersion:VERSION,provider,symbol,interval,originTime:origin.time,
    issuedAt:issuedAt||new Date().toISOString(),sourceAsOf:snapshot.asOf||null,
    sourceIdentity:snapshot.snapshot?.id||null,provenance:snapshot.provenance?.provider||provider,
    status:'PENDING',predicted,actualTime:null,observed:null,absErrorPct:null});
  }
 }
 // Bounded browser storage. The loss of older entries is disclosed to users;
 // this is NOT an immutable external compliance or broker audit trail.
 return [...index.values()].sort((a,b)=>(a.originTime||0)-(b.originTime||0)).slice(-300);
}
export function ledgerMetrics(rows=[],provider,symbol,interval){
 const relevant=rows.filter(r=>r.provider===provider&&r.symbol===symbol&&r.interval===interval);
 const settled=relevant.filter(r=>r.status==='SETTLED');
 const settledErrors=settled.map(r=>r.absErrorPct?.close).filter(finite);
 const mean=settledErrors.length?settledErrors.reduce((a,b)=>a+b,0)/settledErrors.length:null;
 const correct=settled.filter(r=>r.predicted?.close>0&&r.observed?.close>0&&r.predicted?.open>0&&r.observed?.open>0&&
   Math.sign(r.predicted.close-r.predicted.open)!==0&&Math.sign(r.observed.close-r.observed.open)!==0);
 const direction=correct.length>=20?correct.filter(r=>
   Math.sign(r.predicted.close-r.predicted.open)===Math.sign(r.observed.close-r.observed.open)).length/correct.length:null;
 return {issued:relevant.length,settled:settled.length,pending:relevant.length-settled.length,
  meanAbsCloseErrorPct:mean,closeDirectionAccuracy:direction,directionChecks:correct.length,
  history:relevant.slice(-40).reverse()};
}
