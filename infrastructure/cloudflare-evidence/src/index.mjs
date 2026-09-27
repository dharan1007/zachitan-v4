/*
 * Zachitan Independent Evidence Worker — Cloudflare Workers + D1.
 * Deployment prerequisites are explicit in README.md. The code does not
 * assert that a scheduler, database or live measurement exists before deploy.
 * THIS IS A SEPARATE FORECAST MODEL from the browser's analogue/V6 models.
 * No Vercel function, GitHub Action, artificial candle or trading advice.
 */
const PROVIDER='coinbase';
const GRANULARITY=300;
const MODEL_VERSION='edge-5m-ohlcv-v1';
const PRICE=['open','high','low','close'];
const FIELDS=[...PRICE,'volume'];
const floor=(x,a,b)=>Math.min(b,Math.max(a,x));
const finite=x=>x!==null&&x!==undefined&&Number.isFinite(Number(x));
const positive=x=>finite(x)&&Number(x)>0;
const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const pctError=(pred,obs)=>obs>0&&finite(pred)?100*Math.abs(pred/obs-1):null;
function safeSymbol(v){
 return ['BTC-USD','ETH-USD'].includes(String(v).toUpperCase())?String(v).toUpperCase():null;
}
function safeParse(str){
 try{return JSON.parse(str||'null');}catch{return null;}
}
function json(body,status=200,cache='public, max-age=30'){
 return new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':cache,
  'X-Content-Type-Options':'nosniff'}});
}
function validCandle(c){
 return finite(c?.time)&&positive(c.open)&&positive(c.close)&&positive(c.high)&&positive(c.low)&&
  c.low<=Math.min(c.open,c.close)&&c.high>=Math.max(c.open,c.close)&&
  (c.volume==null||(finite(c.volume)&&c.volume>=0));
}
async function sourceCandles(symbol,now,oldestOutstanding=null){
 const high=Math.floor(now/GRANULARITY)*GRANULARITY;
 // A failed scheduler cycle may have left unsettled forecasts outside the
 // normal short fetch window. Fetch a bounded historical catch-up window.
 // Coinbase enforces a maximum of 300 observations per candle query.
 const desired=finite(oldestOutstanding)?Math.min(high-13*GRANULARITY,oldestOutstanding-GRANULARITY):high-13*GRANULARITY;
 const from=Math.max(high-299*GRANULARITY,desired);
 const url=new URL('https://api.exchange.coinbase.com/products/'+encodeURIComponent(symbol)+'/candles');
 url.searchParams.set('granularity',String(GRANULARITY));
 url.searchParams.set('start',new Date(from*1000).toISOString());
 url.searchParams.set('end',new Date(high*1000).toISOString());
 const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('Publisher returned HTTP '+response.status);
 const data=await response.json();
 if(!Array.isArray(data))throw Error('Publisher did not return candles');
 const map=new Map();
 for(const row of data){
  if(!Array.isArray(row)||row.length<6)continue;
  const [time,low,highValue,open,close,volume]=row;
  const c={time:Number(time),low:Number(low),high:Number(highValue),
   open:Number(open),close:Number(close),volume:volume==null?null:Number(volume)};
  if(validCandle(c)&&c.time+GRANULARITY<=now-15&&c.time<=high&&c.time>=from)
   map.set(c.time,c);
 }
 return [...map.values()].sort((a,b)=>a.time-b.time);
}
function naive(c){
 return {open:c.close,high:c.high,low:c.low,close:c.close,
  volume:positive(c.volume)?c.volume:null};
}
export function candidateForecast(current,previous){
 if(!validCandle(current)||!validCandle(previous))return null;
 const lastReturn=Math.log(current.close/previous.close);
 const lastGap=Math.log(current.open/previous.close);
 const nextOpen=current.close*Math.exp(floor(lastGap*.25,-.03,.03));
 const nextClose=current.close*Math.exp(floor(lastReturn*.35,-.03,.03));
 const relativeRange=floor((current.high-current.low)/current.close,.00001,.15);
 const raw={open:nextOpen,close:nextClose,
  high:Math.max(nextOpen,nextClose)*(1+relativeRange*.55),
  low:Math.min(nextOpen,nextClose)/(1+relativeRange*.55),
  volume:positive(current.volume)&&positive(previous.volume)?
   current.volume*Math.exp(floor(Math.log(current.volume/previous.volume)*.25,-1,1)):null};
 return raw;
}
function safeField(record,field){
 const predicted=safeParse(record.raw_json)?.[field],
  baseline=safeParse(record.baseline_json)?.[field],
  observed=safeParse(record.observed_json)?.[field];
 return positive(predicted)&&positive(baseline)&&positive(observed)
  ?{raw:Number(predicted),base:Number(baseline),actual:Number(observed)}:null;
}
export function adaptForecast(raw,baseline,matured=[]){
 const adjusted={},parameters={};
 for(const field of FIELDS){
  if(!positive(raw?.[field])||!positive(baseline?.[field])){
   adjusted[field]=null;parameters[field]={weight:0,checks:0,reason:'Publisher value unavailable'};
   continue;
  }
  const points=matured.map(r=>safeField(r,field)).filter(Boolean).slice(-40);
  if(points.length<20){
   adjusted[field]=baseline[field];
   parameters[field]={weight:0,checks:points.length,reason:'Baseline until twenty independently settled outcomes'};
   continue;
  }
  const rawLoss=avg(points.map(p=>Math.abs(Math.log(p.actual/p.raw))));
  const baselineLoss=avg(points.map(p=>Math.abs(Math.log(p.actual/p.base))));
  const advantage=baselineLoss>1e-10?1-rawLoss/baselineLoss:0;
  const weight=floor(2*advantage,0,.65);
  // Bias is learned ONLY from already settled as-issued outcomes.
  const signedBias=avg(points.slice(-20).map(p=>Math.log(p.actual/p.raw)))||0;
  const correction=floor(signedBias*.25*weight,-.015,.015);
  adjusted[field]=baseline[field]*Math.exp(
   weight*Math.log(raw[field]/baseline[field])+correction);
  parameters[field]={weight,checks:points.length,rawMeanAbsLog:rawLoss,
   baselineMeanAbsLog:baselineLoss,reason:weight>0?'Past settled data supported a limited adjustment':'Baseline beat the candidate on settled observations'};
 }
 if(PRICE.every(k=>positive(adjusted[k]))){
  adjusted.high=Math.max(adjusted.high,adjusted.open,adjusted.close);
  adjusted.low=Math.min(adjusted.low,adjusted.open,adjusted.close);
 }
 return {predicted:adjusted,parameters};
}
export function summarizeIssued(rows=[]){
 const ordered=rows.filter(r=>r.status==='SETTLED').slice();
 const stats={};
 for(const k of FIELDS){
  const eligible=ordered.map(r=>({
   actual:safeParse(r.observed_json)?.[k],
   predicted:safeParse(r.predicted_json)?.[k],
   baseline:safeParse(r.baseline_json)?.[k]
  })).filter(x=>positive(x.actual)&&positive(x.predicted)&&positive(x.baseline));
  const model=avg(eligible.map(x=>Math.abs(Math.log(x.predicted/x.actual))));
  const base=avg(eligible.map(x=>Math.abs(Math.log(x.baseline/x.actual))));
  stats[k]={checks:eligible.length,
   meanAbsolutePercent:avg(eligible.map(x=>pctError(x.predicted,x.actual))),
   baselineMeanAbsolutePercent:avg(eligible.map(x=>pctError(x.baseline,x.actual))),
   improvementVsBaseline:base>1e-12?1-model/base:null};
 }
 return {settled:ordered.length,byField:stats};
}
async function settleExisting(env,symbol,candles,now){
 if(!candles.length)return {settled:0,gaps:0};
 const pending=(await env.DB.prepare(
  "SELECT id,expected_time,origin_time FROM predictions WHERE symbol=? AND interval='5m' AND state='PENDING' ORDER BY origin_time DESC LIMIT 36"
 ).bind(symbol).all()).results||[];
 const index=new Map(candles.map(c=>[c.time,c]));
 let settled=0,gaps=0;
 for(const row of pending){
  const actual=index.get(row.expected_time);
  if(actual){
   const observed=JSON.stringify(actual);
   await env.DB.prepare("UPDATE predictions SET state='SETTLED',observed_json=?,settled_at=? WHERE id=? AND state='PENDING'")
    .bind(observed,now,row.id).run();
   settled++;
  }else if(now>=row.expected_time+GRANULARITY*3&&
    candles[0].time<row.expected_time&&candles.at(-1).time>row.expected_time){
   // Mark a genuine unobserved slot ONLY if surrounding published bars
   // bracket that exact timestamp. A truncated fetch is not a source gap.
   await env.DB.prepare("UPDATE predictions SET state='UNOBSERVED_GAP',settled_at=? WHERE id=? AND state='PENDING'")
    .bind(now,row.id).run();
   gaps++;
  }
 }
 return {settled,gaps};
}
async function issueOne(env,symbol,candles,now){
 if(candles.length<3)return {issued:false,reason:'Too few publisher candles'};
 const current=candles.at(-1),previous=candles.at(-2);
 if(current.time+GRANULARITY>now-15)return {issued:false,reason:'Last bar not completed'};
 if(now-(current.time+GRANULARITY)>GRANULARITY+45)return {issued:false,reason:'Publisher snapshot stale'};
 if(current.time-previous.time!==GRANULARITY)return {issued:false,reason:'Prior completed source interval missing'};
 const raw=candidateForecast(current,previous),base=naive(current);
 if(!raw)return {issued:false,reason:'Invalid publisher OHLC'};
 const rows=(await env.DB.prepare(
  "SELECT raw_json,baseline_json,observed_json FROM predictions WHERE symbol=? AND interval='5m' AND state='SETTLED' ORDER BY origin_time DESC LIMIT 40"
 ).bind(symbol).all()).results||[];
 const {predicted,parameters}=adaptForecast(raw,base,rows.slice().reverse());
 const id=PROVIDER+':'+symbol+':5m:'+current.time+':'+MODEL_VERSION;
 const row=(await env.DB.prepare(
  "INSERT OR IGNORE INTO predictions(id,provider,symbol,interval,model_version,origin_time,expected_time,issued_at,source_json,raw_json,baseline_json,predicted_json,parameters_json,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING')"
 ).bind(id,PROVIDER,symbol,'5m',MODEL_VERSION,current.time,current.time+GRANULARITY,
  now,JSON.stringify(current),JSON.stringify(raw),JSON.stringify(base),
  JSON.stringify(predicted),JSON.stringify(parameters)).run());
 return {issued:!!row.meta?.changes,originTime:current.time};
}
async function tick(env,now){
 if(!env.DB)throw Error('D1 DB binding is required');
 const slot=Math.floor(now/GRANULARITY);
 const lock=await env.DB.prepare(
  'INSERT OR IGNORE INTO run_slots(slot,started_at) VALUES(?,?)'
 ).bind(slot,now).run();
 if(!lock.meta?.changes)return {duplicate:true,slot};
 let issued=0,settled=0,gaps=0,failures=[];
 const chosen=String(env.TRACKED_SYMBOLS||'BTC-USD,ETH-USD').split(',').map(s=>safeSymbol(s.trim())).filter(Boolean).slice(0,2);
 for(const symbol of [...new Set(chosen)]){
  try{
   const unresolved=await env.DB.prepare("SELECT MIN(expected_time) AS oldest FROM predictions WHERE symbol=? AND state='PENDING'").bind(symbol).first();
   const candles=await sourceCandles(symbol,now,unresolved?.oldest??null);
   const s=await settleExisting(env,symbol,candles,now);
   const i=await issueOne(env,symbol,candles,now);
   issued+=Number(i.issued);settled+=s.settled;gaps+=s.gaps;
  }catch(e){failures.push({symbol,reason:String(e?.message||e).slice(0,120)});}
 }
 await env.DB.prepare("UPDATE run_slots SET finished_at=?,issued=?,settled=?,gaps=?,failures_json=? WHERE slot=?")
  .bind(Date.now()/1000,issued,settled,gaps,JSON.stringify(failures),slot).run();
 return {slot,issued,settled,gaps,failures};
}
function cors(response,request,env){
 const origin=request.headers.get('Origin');
 if(origin&&origin===env.SITE_ORIGIN){
  response.headers.set('Access-Control-Allow-Origin',origin);
  response.headers.set('Vary','Origin');
 }
 return response;
}
async function report(request,env){
 const u=new URL(request.url);
 const symbol=safeSymbol(u.searchParams.get('symbol')||'BTC-USD');
 if(!symbol)return json({ok:false,reason:'Unknown instrument'},400,'no-store');
 const limit=floor(Math.trunc(Number(u.searchParams.get('limit'))||36),1,120);
 const history=(await env.DB.prepare(
  "SELECT id,provider,symbol,interval,model_version,origin_time,expected_time,issued_at,source_json,predicted_json,baseline_json,observed_json,settled_at,parameters_json,state FROM predictions WHERE symbol=? ORDER BY origin_time DESC LIMIT ?"
 ).bind(symbol,limit).all()).results||[];
 const last=(await env.DB.prepare('SELECT slot,started_at,finished_at,issued,settled,gaps,failures_json FROM run_slots ORDER BY slot DESC LIMIT 1').first());
 const computed=summarizeIssued(history);
 return json({ok:true,provider:PROVIDER,symbol,modelVersion:MODEL_VERSION,
  liveSchedulerConfigured:true,source:'Coinbase Exchange public completed 5-minute OHLCV',
  lastScheduledRun:last||null,schedulerHealthy:!!last?.finished_at&&Date.now()/1000-last.finished_at<900,
  stats:computed,
  // No after-the-fact edits: actual values and original issuance are different columns.
  history:history.map(x=>({...x,source:safeParse(x.source_json),
   predicted:safeParse(x.predicted_json),baseline:safeParse(x.baseline_json),
   observed:safeParse(x.observed_json),parameters:safeParse(x.parameters_json),
   source_json:undefined,predicted_json:undefined,baseline_json:undefined,
   observed_json:undefined,parameters_json:undefined})),
  limits:'Only preconfigured crypto products are scheduled. Other assets and intervals are not autonomously verified. No guaranteed edge or execution price.'});
}
export default {
 async scheduled(_controller,env,ctx){
  const run=tick(env,Math.floor(Date.now()/1000));
  ctx.waitUntil(run.catch(e=>console.error('zachitan evidence tick:',String(e))));
 },
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(request.method==='OPTIONS'){
   const res=new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type','Cache-Control':'max-age=120'}});
   return cors(res,request,env);
  }
  if(request.method!=='GET')return cors(json({ok:false,reason:'Read-only public endpoint'},405,'no-store'),request,env);
  if(path==='/health'){
   const last=await env.DB.prepare('SELECT finished_at,failures_json FROM run_slots ORDER BY slot DESC LIMIT 1').first();
   return cors(json({ok:true,schedulerConfigured:true,
    actuallyRunning:!!last?.finished_at&&Date.now()/1000-last.finished_at<900,
    lastRun:last?.finished_at??null,errors:safeParse(last?.failures_json)||[]}),request,env);
  }
  if(path==='/v1/report'){
   try{return cors(await report(request,env),request,env);}
   catch(e){return cors(json({ok:false,reason:'Evidence database unavailable'},503,'no-store'),request,env);}
  }
  return cors(json({ok:false,reason:'No such endpoint'},404,'no-store'),request,env);
 }
};
