'use client';
import {useEffect,useRef,useState} from 'react';
import {smart,date,pct} from './Format';

const FIELDS=[['close','Close'],['open','Open'],['high','High'],['low','Low'],['volume','Traded volume'],['range','Full candle range'],['body','Body size']];
export default function ExtendedBacktest({candles=[],provider='coinbase',interval='5m',analysisIdentity=null}){
 const [expanded,setExpanded]=useState(false);
 const [depth,setDepth]=useState(256);
 const [field,setField]=useState('close');
 const [status,setStatus]=useState('idle');
 const [result,setResult]=useState(null);
 const [error,setError]=useState('');
 const countRef=useRef(0);
 useEffect(()=>{
  if(!expanded)return;
  if(candles.length<120){setStatus('unavailable');setResult(null);return;}
  const requestId=++countRef.current;
  let worker;
  try{
   setStatus('running');setError('');
   // Own CPU budget: the main chart never waits on an extended historical test.
   worker=new Worker(new URL('./historical-backtest.worker.mjs',import.meta.url),{type:'module'});
   worker.onmessage=e=>{
    if(e.data?.requestId!==requestId)return;
    if(e.data?.error){setStatus('error');setResult(null);setError(e.data.error);return;}
    setResult(e.data?.result||null);setStatus('done');
   };
   worker.onerror=()=>{setStatus('error');setResult(null);setError('Browser background calculation failed. No result was substituted.')};
   worker.postMessage({requestId,candles,depth,provider,interval});
  }catch(e){setStatus('error');setResult(null);setError(String(e?.message||e));}
  return()=>worker?.terminate();
 },[expanded,depth,provider,interval,analysisIdentity,candles.length]);
 const stat=result?.accuracy?.[field],sample=result?.history||[];
 return <details className="expandedBacktest" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}>
  <summary>Inspect more completed historical observations · independent browser calculation</summary>
  <div style={{padding:'12px 3px 3px'}}>
   <p className="muted" style={{fontSize:13,lineHeight:1.6}}>This optional, deeper walk-forward replay runs in a browser Web Worker over genuine downloaded history. It does not call any new Vercel function and never replaces the independently issued forecast ledger. Source publishers impose historical-length limits; earlier dates cannot be manufactured.</p>
   <div className="expandedBacktestControls">
    <label>Maximum retrospective checks
     <select className="select" value={depth} onChange={e=>setDepth(Number(e.target.value))}>
      {[128,256,512].map(v=><option key={v} value={v}>{v} most recent eligible observations</option>)}
     </select>
    </label>
    <label>Measured field
     <select className="select" value={field} onChange={e=>setField(e.target.value)}>
      {FIELDS.map(([v,t])=><option key={v} value={v}>{t}</option>)}
     </select>
    </label>
    <span className="muted">{status==='running'?'Calculating from completed source data…':status==='done'?'Evidence recalculated.':'Only source history will be scored.'}</span>
   </div>
   {status==='error'?<div className="error">{error}</div>:null}
   {status==='unavailable'?<div className="notice">Insufficient genuine source candles. Choose a longer supported history range. No historical prices are invented.</div>:null}
   {status==='done'&&result?.available?<div>
    <div className="grid4" style={{marginTop:12}}>
     <div className="metric"><span>Actual scored observations</span><b>{result.evaluationChecks||0}</b></div>
     <div className="metric"><span>First / latest tested date</span><b style={{fontSize:13}}>{date(result.firstEvaluationTime)} — {date(result.lastEvaluationTime)}</b></div>
     <div className="metric"><span>{field} average forecast error</span><b>{stat?.meanAbsPctError==null?'—':stat.meanAbsPctError.toFixed(3)+'%'}</b><small>n={stat?.samples??0}</small></div>
     <div className="metric"><span>{field} simple baseline error</span><b>{stat?.baselineMeanAbsPctError==null?'—':stat.baselineMeanAbsPctError.toFixed(3)+'%'}</b><small>Same eligible observed intervals</small></div>
    </div>
    <p className="muted" style={{fontSize:13,lineHeight:1.55,marginTop:12}}>
     {result.skippedUnobservedIntervals||0} unobserved 24/7 source intervals excluded, rather than filled.
     {stat?.skill==null?' Insufficient evidence for a relative-improvement percentage.':' Relative log-error improvement against the simple baseline: '+(100*stat.skill).toFixed(2)+'%.'}
     A later evaluation date is not a record originally issued by the live production service.
    </p>
    <div className="candleHistoryScroll" style={{maxHeight:380}}>
     <table className="table candleTable"><thead><tr><th>Forecast origin</th><th>Observed next candle</th><th>Forecast {field}</th><th>Observed {field}</th><th>Absolute percentage error</th><th>Simple baseline</th></tr></thead>
      <tbody>{sample.slice().reverse().map((r,i)=><tr key={r.observedAt+':'+i}>
       <td>{date(r.issuedAt)}</td><td>{date(r.observedAt)}</td><td>{smart(r.predicted?.[field])}</td>
       <td>{smart(r.observed?.[field])}</td><td>{r.absErrorPct?.[field]==null?'—':r.absErrorPct[field].toFixed(3)+'%'}</td>
       <td>{smart(r.baseline?.[field])}</td>
      </tr>)}</tbody>
     </table>
    </div>
   </div>:status==='done'?<div className="notice">{result?.reason||'Not enough valid source observations to calculate a deeper replay.'}</div>:null}
  </div>
 </details>;
}
