'use client';
import {useEffect,useMemo,useState} from 'react';
import {smart,date,pct} from './Format';

const ENDPOINT=String(process.env.NEXT_PUBLIC_ZACHITAN_EVIDENCE_URL||'').trim().replace(/\/+$/,'');
const FIELDS=[['open','Open'],['high','High'],['low','Low'],['close','Close'],['volume','Volume']];
const prettyTime=seconds=>seconds?date(seconds):'—';
function pctNumber(v){return v==null||!Number.isFinite(Number(v))?'—':Number(v).toFixed(2)+'%';}
export default function IndependentVerification({symbol='BTC-USD',interval='5m'}){
 const supported=['BTC-USD','ETH-USD'].includes(symbol)&&interval==='5m';
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{
  if(!ENDPOINT||!/^https:\/\//.test(ENDPOINT)||!supported){setData(null);return}
  let active=true,controller=null;
  const load=async()=>{
   if(!active||document.hidden)return;
   controller?.abort();controller=new AbortController();
   setLoading(true);
   try{
    const res=await fetch(ENDPOINT+'/v1/report?symbol='+encodeURIComponent(symbol)+'&limit=60',
     {signal:controller.signal,cache:'no-cache',mode:'cors'});
    const payload=await res.json();
    if(!res.ok||payload?.ok!==true)throw Error('Independent evidence endpoint unavailable');
    if(active){setData(payload);setError('');}
   }catch(e){if(active&&e?.name!=='AbortError'){setData(null);setError(e.message||'Unable to verify independent evidence')}}
   finally{if(active)setLoading(false)}
  };
  load();
  const tick=globalThis.setInterval(load,120000);
  const show=()=>{if(!document.hidden)load()};
  document.addEventListener('visibilitychange',show);
  return()=>{active=false;controller?.abort();globalThis.clearInterval(tick);document.removeEventListener('visibilitychange',show)};
 },[symbol,interval,supported]);
 const history=useMemo(()=>Array.isArray(data?.history)?data.history:[],[data]);
 const completed=history.filter(r=>r.state==='SETTLED');
 const healthy=data?.schedulerHealthy===true&&data?.lastScheduledRun?.finished_at!=null;
 const latest=history[0];
 return <section className="card pad evidenceCard" id="unattended-evidence" aria-label="Independently scheduled forecasting evidence">
  <div className="sectionHead" style={{marginBottom:10}}>
   <div><p className="eyebrow">Actual forecasts · separate scheduler and durable records</p><h2>Independent live verification</h2></div>
   <span className={'researchStatus '+(healthy?'researchPositive':'researchNeutral')}>{healthy?'SCHEDULER RUNNING':'NOT VERIFIED LIVE'}</span>
  </div>
  {!ENDPOINT?<div className="notice">The independent evidence service is not connected to this deployment. It has not issued or settled any verified server-side forecasts here. Browser history below cannot replace an always-running service.</div>:
   !supported?<div className="notice">The independently scheduled service currently covers BTC-USD and ETH-USD at five-minute resolution only. {symbol} / {interval} has no independently scheduled coverage. Other horizons require their own verified data pipeline.</div>:
   error?<div className="error">{error}. No historical numbers or predictions are substituted.</div>:
   !data?<div className="notice">{loading?'Reading the independent evidence store…':'Waiting for independently verified evidence.'}</div>:
   <>
    <p className="muted" style={{fontSize:13,lineHeight:1.55,margin:'2px 0 13px'}}>Source: {data.source}. Its lightweight independent model is <b>not</b> the same as the main V6 price model. The scheduler is active only when recently completed runs are verifiable. Past forecasts are preserved even when outcomes disagree with them.</p>
    <div className="grid4" style={{marginBottom:13}}>
     <div className="metric"><span>Last scheduler cycle</span><b style={{fontSize:15}}>{prettyTime(data.lastScheduledRun?.finished_at)}</b></div>
     <div className="metric"><span>Settled in this displayed sample</span><b>{data.stats?.settled??0}</b></div>
     <div className="metric"><span>Observed close MAPE</span><b>{pctNumber(data.stats?.byField?.close?.meanAbsolutePercent)}</b><small>n={data.stats?.byField?.close?.checks??0}</small></div>
     <div className="metric"><span>Accuracy vs unchanged price</span><b>{data.stats?.byField?.close?.improvementVsBaseline==null?'Not measured':pct(data.stats.byField.close.improvementVsBaseline)}</b><small>Positive means lower log error, not a guaranteed trading return.</small></div>
    </div>
    <p className="muted" style={{fontSize:12,margin:'0 0 11px'}}>{data.scoreScope||'Accuracy covers only the returned source records.'} Target: {data.targetTiming||'Timing not independently established.'}</p>
    <div className="evidenceReadout">
     {FIELDS.map(([key,label])=><div key={key}><span>{label} error</span><b>{pctNumber(data.stats?.byField?.[key]?.meanAbsolutePercent)}</b>
       <small>{data.stats?.byField?.[key]?.checks??0} completed outcomes</small></div>)}
    </div>
    {data.lastScheduledRun?.failures_json&&JSON.parse(data.lastScheduledRun.failures_json||'[]').length>0?<div className="notice" style={{marginTop:10}}>Latest scheduler cycle reported one or more publisher failures. The reported time and checked count remain unchanged until genuine observations are processed.</div>:null}
    {history.length? <div className="candleHistoryScroll" style={{maxHeight:360,marginTop:13}}>
     <table className="table candleTable"><thead><tr><th>Issued</th><th>Expected completed interval</th><th>Predicted next close</th><th>Observed next close</th><th>Close absolute error</th><th>Verification</th></tr></thead>
      <tbody>{history.map(row=>{
       const err=row.observed?.close>0&&row.predicted?.close>0?100*Math.abs(row.predicted.close/row.observed.close-1):null;
       return <tr key={row.id}><td>{prettyTime(row.issued_at)}</td><td>{prettyTime(row.expected_time)}</td>
        <td>{smart(row.predicted?.close)}</td><td>{smart(row.observed?.close)}</td>
        <td>{pctNumber(err)}</td><td>{row.state==='SETTLED'?'Settled':row.state==='UNOBSERVED_GAP'?'Unobserved source gap':'Awaiting actual candle'}</td></tr>;
      })}</tbody></table>
    </div>:<div className="notice" style={{marginTop:12}}>No as-issued records yet. This does not mean 100% accuracy: zero outcomes produce no numerical score.</div>}
    <p className="muted" style={{fontSize:12,marginTop:11}}>Latest source observation: {prettyTime(latest?.origin_time)}. {completed.length<20?'Too few independently matured forecasts to infer reliable performance.':'Measurements describe the recorded sample only.'} Data from other instruments, dates, or unconnected institutions is never substituted.</p>
   </>}
 </section>;
}
