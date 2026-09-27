// An honest, per-browser, as-issued next-bar ledger. No server calls or cron.
// Historical reconstructed backtests are NEVER inserted into this store.
export const LIVE_LEDGER_KEY='zachitan.as-issued.v1';
const FIELDS=['open','high','low','close','volume','range','body'];
const VERSION='adaptive-next-bar-v2';
const INTERVAL_SECONDS={'1m':60,'2m':120,'5m':300,'15m':900,'30m':1800,'1h':3600,'60m':3600,'1d':86400,'1wk':604800};
const timestamp=x=>{const t=Date.parse(x);return Number.isFinite(t)?t/1000:null};
const finite=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));
export const ledgerIdentity=(provider,symbol,interval,time)=>[VERSION,provider,symbol,interval,time].join('|');
const size=x=>({range:finite(x?.high)&&finite(x?.low)?Number(x.high)-Number(x.low):null,
 body:finite(x?.open)&&finite(x?.close)?Math.abs(Number(x.close)-Number(x.open)):null});
export function issueAndSettleLedger(previous=[],snapshot={},issuedAt=null){
 const original=Array.isArray(previous)?previous:[];
 const provider=snapshot?.provider,symbol=snapshot?.symbol,interval=snapshot?.meta?.interval;
 const completed=Array.isArray(snapshot?.candles)?snapshot.candles.filter(r=>finite(r?.time)&&r.time>0).slice().sort((a,b)=>a.time-b.time):[];
 const nowSec=issuedAt==null?Date.now()/1000:timestamp(issuedAt);
 const step=INTERVAL_SECONDS[interval]||null;
 const index=new Map(original.filter(x=>x&&typeof x.id==='string').map(x=>[x.id,x]));
 // Finalize ONLY with a distinct, later provider-completed candle; quotes or
 // historical backtest rows must never settle an actually issued prediction.
 for(const saved of index.values()){
  if(saved.status!=='PENDING'||saved.provider!==provider||saved.symbol!==symbol||saved.interval!==interval)continue;
  // An observation is next only if its original bar is still verifiable.
  // A truncated display range must not settle a forecast against an arbitrary
  // much later bar and report an inaccurate or fabricated next-bar miss.
  const at=completed.findIndex(x=>x.time===saved.originTime);
  if(at<0||at>=completed.length-1)continue;
  const next=completed[at+1];
  const savedStep=INTERVAL_SECONDS[saved.interval];
  if(saved.provider==='coinbase'&&savedStep&&next.time-saved.originTime>savedStep*1.1)continue;
  const actual={...next,...size(next)};
  const observed=Object.fromEntries(FIELDS.map(k=>[k,finite(actual[k])?Number(actual[k]):null]));
  const absErrorPct=Object.fromEntries(FIELDS.map(k=>[k,
   saved.predicted?.[k]>0&&observed[k]>0?100*Math.abs(saved.predicted[k]/observed[k]-1):null]));
  index.set(saved.id,{...saved,status:'SETTLED',actualTime:next.time,observed,absErrorPct});
 }
 const forecast=snapshot?.nextBar?.forecast,origin=completed.at(-1);
 // A snapshot fetched after the next bar has already matured may be cached or
 // delayed. Such data must not be written as a purported live issuance.
 // Daily reference/exchange bars have a wider publication clock than crypto.
 const observedAt=timestamp(snapshot.asOf);
 const completedEnough=provider==='coinbase'||step<86400
   ? nowSec>=origin?.time+step-15
   : nowSec>=origin?.time;
 // A late or missing source candle must NOT permit issuing a forecast after
 // the next crypto candle has already completed in exchange time. Timestamp
 // freshness of the API response alone does not prove its source is current.
 const beforeNextCryptoClose=provider!=='coinbase'||(nowSec<origin?.time+step*2-5);
 const freshEnough=nowSec!=null&&step&&origin&&completedEnough&&beforeNextCryptoClose&&
   nowSec-origin.time<=(step>=86400?step*1.5:step*2+90)&&
   observedAt!=null&&observedAt<=nowSec+30&&
   nowSec-observedAt<=(step>=86400?3600:Math.max(45,step/2+30));
 const validSession=provider==='coinbase'||snapshot?.session?.state==='REGULAR'||
   (step>=86400&&snapshot?.session?.state!=='UNKNOWN'&&snapshot?.session?.state!==undefined);
 // Only the snapshot computed from the latest completed origin may be logged.
 // A failed integrity gate, stale observation, absent interval or NAV/reference
 // source cannot issue an as-issued live forecast.
 if(freshEnough&&validSession&&snapshot?.nextBar?.available===true&&snapshot?.quality?.integrity?.critical!==true&&
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
