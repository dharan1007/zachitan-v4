'use client';
import {useMemo,useState} from 'react';
import {computeChartIndicators} from '@/lib/chart-indicators.mjs';
import {smart,date} from './Format';

const OPTIONS=[
 {id:'rsi14',label:'RSI · momentum strength',range:[0,100],help:'Price momentum over 14 completed observations. 30 and 70 are conventional reference lines, not buy/sell instructions.',unit:'index'},
 {id:'macd',label:'MACD · trend momentum',help:'Difference between two price averages, with a nine-observation signal average. Zero means neither positive nor negative momentum.',unit:'price'},
 {id:'atr14',label:'ATR · typical candle range',help:'Wilder-smoothed true range over 14 completed observations. ATR measures volatility, not direction.',unit:'price'},
 {id:'volume',label:'Published traded volume',help:'Venue-reported completed-candle volume. Missing publisher volume stays unavailable rather than becoming zero.',unit:'units'},
];
const valid=x=>x!==null&&x!==undefined&&Number.isFinite(Number(x));
const VW=920,VH=205,P={l:65,r:18,t:19,b:32};
const fmt=(x,id)=>!valid(x)?'Unavailable':id==='rsi14'?Number(x).toFixed(1):smart(x);
function graphPath(values,times,y,minTime,maxTime,expected,provider){
 let d='',lastTime=null;
 values.forEach((v,i)=>{
  const t=times[i];
  if(!valid(v)||!valid(t)){lastTime=null;return}
  const x=P.l+(Number(t)-minTime)/Math.max(1,maxTime-minTime)*(VW-P.l-P.r);
  const discontinuity=lastTime!==null&&provider==='coinbase'&&expected&&Number(t)-lastTime>expected*1.1;
  d+=(!d||lastTime===null||discontinuity?'M':'L')+x.toFixed(2)+','+y(Number(v)).toFixed(2)+' ';
  lastTime=Number(t);
 });
 return d.trim();
}
export default function MarketIndicatorPanels({candles=[],interval='5m',provider='coinbase',referenceValueOnly=false}){
 const [enabled,setEnabled]=useState([]);
 const availableOptions=referenceValueOnly?OPTIONS.filter(item=>item.id==='rsi14'||item.id==='macd'):OPTIONS;
 const [showHelp,setShowHelp]=useState(false);
 const computed=useMemo(()=>computeChartIndicators(candles),[candles]);
 const expected=({'1m':60,'5m':300,'15m':900,'1h':3600,'6h':21600,'1d':86400,'1wk':604800})[interval];
 const windows=useMemo(()=>{
  const last=candles.slice(-Math.min(220,candles.length));
  const offset=candles.length-last.length;
  return {last,offset,times:last.map(x=>x.time)};
 },[candles]);
 return <section className="indicatorPanels" aria-label="Additional source-derived chart indicators">
  <div className="indicatorPanelsHead">
   <div><h3>Indicators and price context</h3><p>Add one or more separately scaled studies. Calculations use only the completed observations loaded for this market.</p></div>
   <button className="btn" type="button" onClick={()=>setShowHelp(x=>!x)} aria-expanded={showHelp}>{showHelp?'Hide explanations':'Explain indicators'}</button>
  </div>
  <div className="indicatorPanelOptions" role="group" aria-label="Toggle indicators">
   {availableOptions.map(p=><label key={p.id} className={enabled.includes(p.id)?'indicatorChoice on':'indicatorChoice'}>
    <input type="checkbox" checked={enabled.includes(p.id)}
     onChange={e=>{const checked=e.target.checked;setEnabled(v=>checked?[...v,p.id]:v.filter(x=>x!==p.id))}}/>
    {p.label}</label>)}
  </div>
  {showHelp?<div className="notice">Simple averages, exponential averages, Bollinger bands, rolling VWAP and highest/lowest channels are available through the chart's Indicators menu. Published reference-only NAV and ECB series have no true high, low or trade volume: ATR and volume studies are not offered for them. RSI, MACD, ATR and traded volume use separate scales below; overlaying them on the price axis would be mathematically misleading. No indicator here is a validated trade recommendation.</div>:null}
  {enabled.length===0?<p className="indicatorEmpty">Choose an indicator to add a study below the chart. Reference-only values support price-series momentum studies but not true-range or traded-volume studies. Unavailable publisher data is never invented.</p>:null}
  {availableOptions.filter(x=>enabled.includes(x.id)).map(option=>{
   const {last,offset,times}=windows;
   const values=option.id==='volume'?last.map(c=>c.volume==null?null:Number(c.volume)):
    (computed[option.id]||[]).slice(offset);
   const extra=option.id==='macd'?(computed.macdSignal||[]).slice(offset):null;
   const eligible=[...values,...(extra||[])].filter(valid).map(Number);
   const minTime=Number(times[0]||0),maxTime=Number(times.at(-1)||minTime+1);
   if(eligible.length<2)return <div className="indicatorPanel" key={option.id}><h4>{option.label}</h4><div className="notice">Insufficient published {option.id==='volume'?'volume':'price'} observations to compute this indicator. No zeroes or historical values have been invented.</div></div>;
   let lo=option.range?.[0]??Math.min(...eligible,0),hi=option.range?.[1]??Math.max(...eligible,0);
   if(hi<=lo){lo-=1;hi+=1}
   const pad=(hi-lo)*.09;lo-=option.range?0:pad;hi+=option.range?0:pad;
   const y=v=>P.t+(hi-v)/Math.max(1e-12,hi-lo)*(VH-P.t-P.b);
   const path=graphPath(values,times,y,minTime,maxTime,expected,provider);
   const second=extra?graphPath(extra,times,y,minTime,maxTime,expected,provider):null;
   const latest=values.at(-1);
   return <div className="indicatorPanel" key={option.id}>
    <div className="indicatorPanelTitle"><h4>{option.label}</h4><span>{fmt(latest,option.id)} {option.unit==='units'?'source units':''} · last bar {date(maxTime)}</span></div>
    <div className="indicatorGraphScroll"><svg viewBox={'0 0 '+VW+' '+VH} role="img" aria-label={option.label+' over source timestamps; no gap interpolation'} className="indicatorGraph">
     {[0,.5,1].map((r,i)=>{
      const value=hi-r*(hi-lo),yy=y(value);
      return <g key={i}><line x1={P.l} x2={VW-P.r} y1={yy} y2={yy} stroke="#dce4ec" strokeDasharray="2 4"/>
       <text x={P.l-9} y={yy+5} fill="#233e56" fontSize="13" textAnchor="end">{fmt(value,option.id)}</text></g>;
     })}
     {option.id==='rsi14'?[30,70].map(v=><line key={v} x1={P.l} x2={VW-P.r} y1={y(v)} y2={y(v)} stroke="#ba8d3d" strokeDasharray="5 5" strokeWidth="1.4"/>):null}
     <path d={path} fill="none" stroke="#175eac" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
     {second?<path d={second} fill="none" stroke="#c07823" strokeWidth="2.1" strokeLinecap="round" strokeDasharray="5 4"/>:null}
     {[0,.5,1].map((r,i)=><text key={i} x={P.l+r*(VW-P.l-P.r)} y={VH-8} textAnchor={i===0?'start':i===2?'end':'middle'}
      fontSize="12" fill="#334d64">{new Date((minTime+r*(maxTime-minTime))*1000).toLocaleDateString()}</text>)}
    </svg></div>
    <p className="indicatorExplanation">{option.help} {second?'Blue: MACD; amber: its signal average. ':''}The horizontal axis uses observed timestamps; missing market records are not synthesized.</p>
   </div>
  })}
 </section>;
}
