'use client';
import {useMemo,useState} from 'react';
const FIELDS=[['close','Close'],['open','Open'],['high','High'],['low','Low'],
 ['volume','Traded volume'],['range','Full range'],['body','Body size']];
const number=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
function absolutePercent(estimate,actual){
 const a=number(actual),p=number(estimate);
 return a>0&&p!==null&&p>=0?100*Math.abs(p/a-1):null;
}
export default function BacktestErrorChart({history=[]}){
 const [field,setField]=useState('close');
 const series=useMemo(()=>history.map(row=>({
  t:row.observedAt,
  model:absolutePercent(row.predicted?.[field],row.observed?.[field]),
  baseline:absolutePercent(row.baseline?.[field],row.observed?.[field]),
 })).filter(v=>v.model!==null&&v.baseline!==null),[history,field]);
 const W=810,H=226,P={left:58,right:18,top:20,bottom:34};
 const chartW=W-P.left-P.right,chartH=H-P.top-P.bottom;
 const max=series.length?Math.max(.01,...series.map(r=>Math.max(r.model,r.baseline)))*1.1:1;
 const x=i=>P.left+chartW*i/Math.max(1,series.length-1);
 const y=v=>P.top+chartH*(1-v/max);
 const path=key=>series.map((r,i)=>(i===0?'M':'L')+x(i).toFixed(1)+' '+y(r[key]).toFixed(1)).join(' ');
 const from=v=>Number.isFinite(v)?v.toFixed(v<.1?3:2)+'%':'—';
 const stamp=v=>new Date(Number(v)*1000).toLocaleString();
 return <div aria-label={'Actual consecutive reconstructed historical '+field+' prediction errors, compared with the naive baseline'} style={{margin:'17px 0 14px'}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap',marginBottom:8}}>
   <b style={{fontSize:14}}>Completed-observation error, period by period</b>
   <label style={{display:'flex',gap:7,alignItems:'center',fontSize:12}}>Forecast variable
    <select className="select" style={{width:'auto'}} value={field} onChange={e=>setField(e.target.value)}>
     {FIELDS.map(([k,label])=><option key={k} value={k}>{label}</option>)}
    </select>
   </label>
  </div>
  {series.length<2?<div className="notice">At least two eligible observed outcomes are required for a measured error curve. Unavailable and zero-denominator values are not invented.</div>:
   <div className="chartHistoryWrap">
    <svg viewBox={'0 0 '+W+' '+H} role="img" aria-label="Blue is prediction absolute percentage error; grey is previous-observation baseline error" style={{width:'100%',height:'auto',display:'block'}}>
     {[0,.25,.5,.75,1].map(v=><g key={v}><line x1={P.left} y1={y(max*v)} x2={W-P.right} y2={y(max*v)} stroke="#e3e9ed"/><text x={P.left-8} y={y(max*v)+4} textAnchor="end" fill="#5c6977" fontSize="11">{from(max*v)}</text></g>)}
     <path d={path('baseline')} fill="none" stroke="#96a2ad" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
     <path d={path('model')} fill="none" stroke="#2860c9" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
     {series.map((r,i)=><g key={r.t+':'+i}><circle cx={x(i)} cy={y(r.model)} r="3" fill="#2860c9"><title>{stamp(r.t)} — forecast absolute error {from(r.model)}; baseline {from(r.baseline)}</title></circle></g>)}
     {[0,Math.floor((series.length-1)/2),series.length-1].map((i,k)=><text key={k} x={x(i)} y={H-9} textAnchor={k===0?'start':k===2?'end':'middle'} fill="#5c6977" fontSize="10">{new Date(series[i].t*1000).toLocaleDateString()}</text>)}
    </svg>
    <div style={{display:'flex',flexWrap:'wrap',gap:15,fontSize:11,color:'#586571',padding:'3px 8px 8px'}}>
     <span><span aria-hidden="true" style={{display:'inline-block',width:20,height:3,background:'#2860c9',verticalAlign:'middle',marginRight:4}}/>Reconstructed model error</span>
     <span><span aria-hidden="true" style={{display:'inline-block',width:20,height:3,background:'#96a2ad',verticalAlign:'middle',marginRight:4}}/>Naive baseline error</span>
     <span>{series.length} eligible consecutive recorded origins within the available source history</span>
    </div>
   </div>}
  <p className="muted" style={{fontSize:11,lineHeight:1.5,marginTop:5}}>The chart plots absolute percentage error at each already completed observation, not projected future profit. It never plots an unobserved outcome. Gaps in the publisher&apos;s actual trading calendar are not filled with invented prices.</p>
 </div>;
}
