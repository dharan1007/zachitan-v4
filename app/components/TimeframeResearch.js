'use client';
import {useMemo} from 'react';
import {smart,date,pct} from './Format';
const RESOLUTIONS=[
 ['1m','One-minute observation','Immediate intraday'],
 ['5m','Five-minute observation','Intraday'],
 ['15m','Fifteen-minute observation','Intraday'],
 ['1h','One-hour observation','Intraday / short swing'],
 ['6h','Six-hour observation','Multi-session'],
 ['1d','Daily observation','Swing / position'],
 ['1wk','Weekly observation','Longer-term'],
];
const eligible=(selection,t)=>{
 if(['ecb','amfi'].includes(selection.provider)||selection.assetClass==='mutual_fund')return t==='1d';
 if(selection.provider==='coinbase')return t!=='1wk';
 if(selection.provider==='yahoo')return t!=='6h';
 return false;
};
export default function TimeframeResearch({selection,interval,onSelect,data}){
 const f=data?.forecast,bar=data?.nextBar,current=data?.candles?.at(-1);
 const eligibleNext=bar?.available&&['open','close'].every(k=>
  bar.accuracy?.[k]?.samples>=40&&bar.accuracy[k]?.skill>0);
 const status=useMemo(()=>{
  if(!data?.quality?.newest)return 'Source data not loaded';
  if(!bar?.available)return 'No supported next-candle estimate';
  if(!eligibleNext)return 'Research estimate; not independently qualified';
  if(f?.decisionState==='PUBLISHABLE')return 'Historically supported on available sample';
  return 'Next-bar evidence only; long-horizon estimate withheld';
 },[data,bar,eligibleNext,f]);
 return <section className="card pad" id="timeframe-research" aria-label="Timeframe-by-timeframe investment research">
  <div className="sectionHead">
   <div><p className="eyebrow">Timeframe explorer · source-only and on demand</p><h2>When could an entry or exit be investigated?</h2></div>
   <p>Choose the actual market observation interval to view historical accuracy and later observed outcomes. Unloaded intervals are not simulated from the current chart.</p>
  </div>
  <div className="timeframeResearchGrid">
   {RESOLUTIONS.map(([t,label,purpose])=>{
    const allowed=eligible(selection,t),active=t===interval;
    return <div key={t} className={'timeframeResearchItem '+(active?'timeframeResearchActive':'')}>
     <div className="timeframeResearchHeader"><div><strong>{label}</strong><span>{purpose}</span></div>
      {allowed?<button type="button" className={active?'btn primary':'btn'} disabled={active} onClick={()=>onSelect(t)}>{active?'Viewing':'Inspect source'}</button>:
       <span className="sourcePill GATED">Not natively published</span>}
     </div>
     {!allowed?<p className="muted">The selected publisher does not provide this native candle interval. We do not relabel or fabricate higher-frequency observations.</p>:
      !active?<p className="muted">Not fetched. Inspect this interval to see genuine observed prices and new evaluation results, using the existing bounded market request. No background scan is started.</p>:
      data?.meta?.referenceValueOnly?<div className="timeframeResearchFinding">
       <strong>Published reference only: {smart(current?.close)}</strong>
       <p>Published at {date(current?.time)} by {data?.provenance?.provider||'its reference publisher'}. This is a single NAV or reference exchange-rate observation—not an exchange-traded opening, high, low or close. No genuine traded volume, intraday candle, actionable entry or exit timing is published by this series. No OHLC forecast is displayed.</p>
      </div>:
      <>
       <div className="timeframeResearchMetrics">
        <div><span>Last observed open</span><b>{smart(current?.open)}</b></div>
        <div><span>Last observed close</span><b>{smart(current?.close)}</b></div>
        <div><span>Next open estimate</span><b>{bar?.available?smart(bar.forecast?.open):'Withheld'}</b></div>
        <div><span>Next close estimate</span><b>{bar?.available?smart(bar.forecast?.close):'Withheld'}</b></div>
        <div><span>Possible high (research)</span><b>{bar?.available?smart(bar.forecast?.high):'Withheld'}</b></div>
        <div><span>Possible low (research)</span><b>{bar?.available?smart(bar.forecast?.low):'Withheld'}</b></div>
       </div>
       <div className="timeframeResearchFinding">
        <strong>{status}</strong>
        <p>Most recent completed observation: {date(current?.time)}. {bar?.available?'Historical next-open sample: '+(bar.accuracy?.open?.samples||0)+'; close sample: '+(bar.accuracy?.close?.samples||0)+'. ':''}
         {eligibleNext?'Historical errors on this source window were below their simple matched reference for both opening and closing prices. ':'No independently established improvement is available for the next open and close on this source window. '}
         Predicted next open/close are not executable orders, and neither specifies the best time to enter or exit. Actual future prices update only after the publisher completes the relevant candle.</p>
       </div>
       {bar?.available?<div className="muted" style={{fontSize:12,marginTop:9}}>
        Next-close measured historical absolute error: {bar.accuracy?.close?.meanAbsPctError==null?'—':bar.accuracy.close.meanAbsPctError.toFixed(2)+'%'}.
        Empirical 80% close band: {Array.isArray(bar.empirical80?.close)?bar.empirical80.close.map(smart).join(' – '):'not calibrated'}.
        Latest published traded volume: {current?.volume==null?'not supplied':smart(current.volume)}.
       </div>:null}
      </>}
    </div>;
   })}
  </div>
  <div className="notice" style={{marginTop:14}}>A historically accurate next close does not prove an optimal entry or exit. Any trading strategy needs verified order prices, fees, spread, slippage, liquidity, account constraints and an independent future test. If measured performance is insufficient, Zachitan shows no supported buy/sell instruction instead of inventing one. Indices and continuous futures symbols require a specified tradable product before an executable entry price exists.</div>
 </section>;
}
