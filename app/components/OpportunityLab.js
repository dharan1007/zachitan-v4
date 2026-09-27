'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {smart,pct,date} from './Format';

const SEGMENTS=['India','Technology','Financials','Healthcare','Energy','Consumer','Industrials',
 'US indices','India indices','Forex','Commodities','Crypto'];
const allowedCapital=v=>v!==''&&v!==null&&Number.isFinite(Number(v))&&Number(v)>0;
const reasonableCurrency=s=>s?(' · '+s):'';
const cacheKey=segment=>'zachitan.research.2026.'+segment;
async function querySegment(segment,signal){
 const response=await fetch('/api/data?action=opportunities&segment='+encodeURIComponent(segment),{signal});
 const result=await response.json();
 if(!response.ok||!result.ok)throw new Error(result.error||('Research request '+response.status));
 return result;
}
function displayResult(value,dp=1){return value===null||value===undefined||!Number.isFinite(Number(value))?'—':Number(value).toFixed(dp)+'%'}
function samplePosition(row,capital,riskPercent){
 if(!allowedCapital(capital)||!Number.isFinite(riskPercent)||riskPercent<=0||riskPercent>1)return null;
 if(!row.qualified||row.currentSignal!=='UP'||!['stock','etf','crypto'].includes(row.assetClass))return null;
 const entry=row.referenceEntry,stop=row.referenceStop;
 const distance=entry-stop;
 if(!(entry>0&&distance>0))return null;
 const cash=Number(capital),riskBudget=cash*riskPercent/100;
 const byRisk=riskBudget/distance,byCash=cash/entry;
 return row.assetClass==='crypto'?Math.floor(Math.min(byRisk,byCash)*1e6)/1e6:Math.floor(Math.min(byRisk,byCash));
}
export default function OpportunityLab(){
 const anchorRef=useRef(null),controllerRef=useRef(null);
 const [visible,setVisible]=useState(false),[segment,setSegment]=useState('India');
 const [cache,setCache]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [sort,setSort]=useState('reliability'),[capital,setCapital]=useState(''),[riskPercent,setRiskPercent]=useState('0.5');
 const [expanded,setExpanded]=useState(null);
 useEffect(()=>{
  const node=anchorRef.current;if(!node)return;
  if(!('IntersectionObserver' in window)){setVisible(true);return}
  const io=new IntersectionObserver(entries=>{
   if(entries.some(x=>x.isIntersecting)){setVisible(true);io.disconnect()}
  },{rootMargin:'200px'});
  io.observe(node);return()=>io.disconnect();
 },[]);
 useEffect(()=>{
  if(!visible||cache[segment])return;
  let local=null;
  try{
   const stored=JSON.parse(sessionStorage.getItem(cacheKey(segment))||'null');
   if(stored&&Date.now()-stored.savedAt<15*60_000&&stored.value?.ok)local=stored.value;
  }catch{}
  if(local){setCache(old=>({...old,[segment]:local}));return}
  controllerRef.current?.abort();
  const ctrl=new AbortController();controllerRef.current=ctrl;
  setBusy(true);setError('');
  querySegment(segment,ctrl.signal).then(value=>{
   if(ctrl.signal.aborted)return;
   setCache(old=>({...old,[segment]:value}));
   try{sessionStorage.setItem(cacheKey(segment),JSON.stringify({savedAt:Date.now(),value}))}catch{}
  }).catch(err=>{
   if(!ctrl.signal.aborted)setError(err.message||'Market research unavailable.');
  }).finally(()=>{if(!ctrl.signal.aborted)setBusy(false)});
  return()=>ctrl.abort();
 },[segment,visible,cache]);
 const current=cache[segment];
 const rows=useMemo(()=>{
  const a=[...(current?.rows||[])];
  return a.sort((x,y)=>{
   if(Number(x.qualified)!==Number(y.qualified))return Number(y.qualified)-Number(x.qualified);
   if(sort==='reliability')return (y.wilsonLower95||0)-(x.wilsonLower95||0);
   return (y.atrPct||0)-(x.atrPct||0);
  });
 },[current,sort]);
 const count=rows.filter(r=>r.qualified).length;
 const risk=Number(riskPercent);
 return <section ref={anchorRef} className="card pad" id="research-opportunities" style={{marginTop:16}}>
  <div className="sectionHead">
   <div><p className="eyebrow">Source-first · multi-asset research · no invented firm verdicts</p>
    <h2>Cross-market opportunity research</h2></div>
   <span className="betaBadge">{current?date(current.asOf):visible?'CHECKING SOURCES':'ON-VIEW LOAD'}</span>
  </div>
  <p className="muted" style={{fontSize:13,lineHeight:1.65,marginBottom:13}}>
   Separate what is observed from what might happen. Evaluate a predeclared 20/60-observation trend and momentum signal over completed historical daily bars, with the following session's open as the hypothetical entry and a later open as the hypothetical exit. Signals, lower confidence bounds and price volatility are <strong>not forecasts of profit</strong>. These studies exclude spreads, fees, slippage, taxes, borrowing costs and market impact. They do not reproduce investment-bank or hedge-fund trading systems.
  </p>
  <div className="chips" role="group" aria-label="Research sectors and assets" style={{marginBottom:14}}>
   {SEGMENTS.map(item=><button type="button" className={'chip '+(segment===item?'on':'')} key={item} onClick={()=>{setSegment(item);setExpanded(null)}}>{item}</button>)}
  </div>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:14}}>
   <div className="muted" style={{fontSize:12}}>{current?<>{current.available}/{current.sampled} publisher instruments available · {count} with historical qualification · latest completed daily observations</>:busy?'Loading up to three current publisher feeds…':'This segment loads automatically when viewed. No background scans.'}</div>
   <div style={{display:'flex',alignItems:'center',gap:8}}><label htmlFor="opportunity-sort" className="label" style={{marginBottom:0}}>Order by</label>
    <select id="opportunity-sort" className="select" style={{width:'auto'}} value={sort} onChange={e=>setSort(e.target.value)}>
     <option value="reliability">Measured historical confidence</option><option value="volatility">Observed volatility, not profit</option>
    </select>
   </div>
  </div>
  {error?<div className="error" role="status">No result for this segment: {error}. No replacement prices or signals are fabricated.</div>:null}
  {current&&count===0?<div className="notice" style={{marginBottom:13}}>No instrument in this sampled sector has met the predeclared historical-evidence requirements. Watch-only rows are shown for research, not as suggested trades.</div>:null}
  <div className="researchResultGrid">
   {rows.map(row=><article key={row.symbol} className="researchResult">
    <div className="researchResultTop">
     <div><span className="eyebrow">{segment} · {row.assetClass||'source unavailable'}</span>
      <h3 style={{margin:'3px 0',fontSize:19}}>{row.name||row.symbol}</h3><span className="muted" style={{fontSize:11}}>{row.symbol}{reasonableCurrency(row.currency)} · {row.source||'source unavailable'}</span></div>
     <span className={'researchStatus '+(row.qualified?'researchPositive':'researchNeutral')}>{!row.available?'SOURCE UNAVAILABLE':row.qualified?'HISTORICALLY QUALIFIED':row.status==='NO_SIGNAL'?'NO SIGNAL':'WATCH / UNQUALIFIED'}</span>
    </div>
    {!row.available?<p className="error" style={{fontSize:12}}>{row.reason}</p>:<>
     <div className="researchMetrics">
      <div><span>Last completed close</span><b>{smart(row.lastCompletedClose)}</b></div>
      <div><span>Observed as of</span><b style={{fontSize:11}}>{date(row.lastCompletedTime)}</b></div>
      <div><span>Historical signal wins</span><b>{row.testedSignalChecks?row.matchingWins+' / '+row.testedSignalChecks:'—'}</b></div>
      <div><span>Later-period lower win bound</span><b>{row.heldoutChecks>=20?displayResult((row.wilsonLower95||0)*100,1):'INSUFFICIENT'}</b></div>
      <div><span>Observed ATR / close</span><b>{displayResult((row.atrPct||0)*100,2)}</b></div>
      <div><span>5-session study return</span><b>{displayResult(row.historicalMeanGrossReturnPct,2)}</b></div>
      <div><span>Later-period scored signals</span><b>{row.heldoutChecks||0}</b></div>
      <div><span>Later-period mean gross return</span><b>{displayResult(row.heldoutMeanGrossReturnPct,2)}</b></div>
     </div>
     <p style={{margin:'9px 0 0',fontSize:12,lineHeight:1.55}}><b>Evidence:</b> {row.currentSignal==='UP'?'historical uptrend pattern':row.currentSignal==='DOWN'?'historical downward-trend pattern':'no directional trend signal'}; sample n={row.testedSignalChecks}. {row.drift?'Recent retrospective win-rate deterioration was detected.':'Current trend does not establish future returns.'} Session: {row.session}. </p>
     <div className="researchRule">
      <b>Conditional reference levels — NOT backtested stop/target orders</b>
      <p>Latest observed close {smart(row.referenceEntry)}; {row.currentSignal==='MIXED'?'entry withheld for mixed trend':'hypothetical observation at next published open'}; illustrative stop {row.referenceStop==null?'—':smart(row.referenceStop)}; illustrative target {row.referenceTarget==null?'—':smart(row.referenceTarget)}. A future opening gap can invalidate these reference levels. {row.tradable?'Any trade would depend on execution, liquidity and fees.':'The index or futures quote is not a directly executable equity unit; product and contract details are required.'}</p>
     </div>
     {row.qualified&&row.currentSignal==='UP'&&['stock','etf','crypto'].includes(row.assetClass)?<div style={{marginTop:12}}>
      <button type="button" className="btn" onClick={()=>setExpanded(expanded===row.symbol?null:row.symbol)}>
       {expanded===row.symbol?'Hide':'Inspect'} hypothetical long-only risk sizing
      </button>
      {expanded===row.symbol?<div className="researchRule" style={{marginTop:9}}>
       <p>For an illustrative portfolio in {row.currency||'the instrument quote currency'}, using capital and a risk limit <strong>you choose</strong>, size is the lesser of capital ÷ reference entry and capital-at-risk ÷ (reference entry − illustrative stop). This does not include FX conversion, fees, gap risk or realized fill prices.</p>
       <div style={{display:'flex',gap:9,flexWrap:'wrap',alignItems:'end'}}>
        <label style={{fontSize:11}}>Capital ({row.currency||'quote units'})<input className="input" inputMode="decimal" type="number" min="0" value={capital} placeholder="Enter your amount" onChange={e=>setCapital(e.target.value)}/></label>
        <label style={{fontSize:11}}>Illustrative capital risk (%)<input className="input" inputMode="decimal" type="number" min="0.1" max="1" step="0.1" value={riskPercent} onChange={e=>setRiskPercent(e.target.value)}/></label>
       </div>
       <p style={{marginTop:8,fontWeight:750}}>Illustrative maximum quantity: {samplePosition(row,capital,risk)==null?'—':samplePosition(row,capital,risk)} {row.assetClass==='crypto'?'spot units':'shares'}.</p>
       <p>Not an order recommendation. The stop is a scenario assumption and can execute at a worse price or not at all.</p>
      </div>:null}
     </div>:null}
     <div className="muted" style={{fontSize:11,marginTop:10}}>The study does not represent an analyst consensus. No verified institution-specific rating or recommendation is connected for this instrument.</div>
    </>}
   </article>)}
  </div>
  <div className="notice" style={{marginTop:15}}>
   <b>Research limitations.</b> A ranked sampled watchlist is not a list of assets guaranteed to deliver large gains. Rank refers solely to measured historical evidence among the loaded instruments; observed volatility is movement in either direction, not profit. The lower win-rate bound uses an approximate independent-trial assumption; even a later chronological evaluation segment can suffer data snooping and regime changes. A five-session gross study is not a simulation of the displayed illustrative stops or targets. Markets that are closed have no executable "today" entry.
  </div>
  <p className="muted" style={{fontSize:12,lineHeight:1.6,margin:'14px 0 0'}}>
   Public institutional methodology references: <a href="https://www.aqr.com/learning-center/systematic-equities" target="_blank" rel="noopener noreferrer">AQR systematic equity</a>, <a href="https://www.blackrock.com/institutions/en-us/investment-capabilities/strategies/systematic-investing" target="_blank" rel="noopener noreferrer">BlackRock systematic investing</a>, and <a href="https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/backtesting-and-simulation" target="_blank" rel="noopener noreferrer">CFA Institute backtesting standards</a>. These are methodology sources; none supplies Zachitan with a live proprietary firm verdict.
  </p>
 </section>;
}
