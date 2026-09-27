'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import InteractiveChart from './InteractiveChart';
import BacktestErrorChart from './BacktestErrorChart';
import ExtendedBacktest from './ExtendedBacktest';
import IndependentVerification from './IndependentVerification';
import MarketIndicatorPanels from './MarketIndicatorPanels';
import TimeframeResearch from './TimeframeResearch';
import { classifyGap } from '@/lib/candle-calendar.mjs';
import Score from './Score';
import SourceStatus from './SourceStatus';
import AssetSearch from './AssetSearch';
import {smart,pct,signedPct,date,num} from './Format';
import {LIVE_LEDGER_KEY,issueAndSettleLedger,ledgerMetrics} from '@/lib/live-ledger.mjs';

const GROUPS={
 'Crypto':[['BTC-USD','Bitcoin / USD','coinbase']],
 'Stocks':[['AAPL','Apple','yahoo'],['RELIANCE.NS','Reliance','yahoo'],['NVDA','NVIDIA','yahoo']],
 'ETFs':[['SPY','S&P 500 ETF','yahoo'],['NIFTYBEES.NS','Nifty BeES','yahoo']],
 'Indices':[['^NSEI','NIFTY 50','yahoo'],['^GSPC','S&P 500','yahoo']],
 'Futures':[['ES=F','E-mini S&P','yahoo'],['GC=F','Gold','yahoo'],['CL=F','Crude oil','yahoo']],
 'Forex':[['USDINR=X','USD / INR','yahoo'],['EURUSD=X','EUR / USD','yahoo'],['EUR/INR','EUR / INR ECB reference','ecb']],
 'Funds':[['VFIAX','Vanguard 500 Index Fund','yahoo'],['FXAIX','Fidelity 500 Index Fund','yahoo']]
};
const TF=['1m','5m','15m','1h','6h','1d','1wk'];
const INTERVAL_SEC={'1m':60,'5m':300,'15m':900,'1h':3600,'6h':21600,'1d':86400,'1wk':604800};
const RANGES=['1d','5d','1mo','3mo','6mo','1y','2y','5y','10y','max'];
function clampInterval(v){return TF.includes(String(v))?String(v):'5m'}
function clampRange(v){return RANGES.includes(String(v))?String(v):'1mo'}
function assetClassForGroup(g){return g.toLowerCase().replace('funds','mutual_fund').replace('stocks','stock').replace('indices','index').replace('futures','future').replace('etfs','etf')}
async function getJson(url,signal){const r=await fetch(url,{signal});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||`Request ${r.status}`);return d}
function buildUrl(selection,interval,range,horizon){return `/api/data?${new URLSearchParams({action:'market',provider:selection.provider,symbol:selection.symbol,interval:clampInterval(interval),range:clampRange(range),horizon:String(horizon)})}`}
function metric(v,d=2){return Number.isFinite(v)?Number(v).toFixed(d):'—'}
function titleCase(v){return String(v||'unknown').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase())}
const plainStatus=state=>({'PUBLISHABLE':'Historical checks passed','RESEARCH_ONLY':'More evidence needed','ABSTAIN':'Forecast withheld','UNAVAILABLE':'Data unavailable'})[state]||'Evidence not verified';
const plainAdjustment=reason=>reason?.startsWith('Missing')?'Publisher has no usable volume':reason?.startsWith('Uncalibrated')?'Too few previously observed errors':reason?.startsWith('Baseline selected')?'Using the simpler reference':reason?.startsWith('Chronologically adapted')?'Adjusted using earlier settled mistakes':reason?.startsWith('Derived')?'Calculated from predicted OHLC':reason||'No completed calibration';

export default function MarketLab(){
 const [selection,setSelection]=useState({symbol:'BTC-USD',name:'Bitcoin / US Dollar',provider:'coinbase',assetClass:'crypto',exchange:'Coinbase'});
 const [saved,setSaved]=useState(false),[interval,setInterval]=useState('5m'),[range,setRange]=useState('1mo'),[horizon,setHorizon]=useState(12);
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[query,setQuery]=useState('BTC-USD');
 const [options,setOptions]=useState(null),[optionsLoading,setOptionsLoading]=useState(false),[streamPrice,setStreamPrice]=useState(null),[streamTime,setStreamTime]=useState(null);
 const [orderFlow,setOrderFlow]=useState(null),[orderFlowLoading,setOrderFlowLoading]=useState(false);
 const [localLedger,setLocalLedger]=useState([]),[ledgerStatus,setLedgerStatus]=useState('LOCAL_ONLY');
 const [tableLimit,setTableLimit]=useState(50);
 const inFlight=useRef(false),requestKey=useRef(null),abortRef=useRef(null),requestSeq=useRef(0);
 const isDailyOnly=selection.provider==='amfi'||selection.provider==='ecb'||selection.assetClass==='mutual_fund';

 useEffect(()=>{try{const q=new URLSearchParams(window.location.search),symbol=q.get('symbol'),provider=q.get('provider'),name=q.get('name'),assetClass=q.get('assetClass');if(symbol&&provider){setSelection({symbol,provider,name:name||symbol,assetClass:assetClass||'market',exchange:''});setQuery(symbol)}}catch{}},[]);
 useEffect(()=>{try{const a=JSON.parse(localStorage.getItem('zachitan.watchlist.v4')||'[]');setSaved(a.some(x=>x.symbol===selection.symbol&&x.provider===selection.provider))}catch{setSaved(false)}},[selection.symbol,selection.provider]);
 useEffect(()=>setOrderFlow(null),[selection.provider,selection.symbol]);
 // Automatic as-issued issuance and settlement. This reuses responses already
 // fetched for the visible market page, with zero additional server calls.
 useEffect(()=>{
  if(!data?.nextBar||data?.provider!==selection.provider||data?.symbol!==selection.symbol||data?.meta?.interval!==interval)return;
  try{
   const before=JSON.parse(localStorage.getItem(LIVE_LEDGER_KEY)||'[]');
   const after=issueAndSettleLedger(before,data);
   if(JSON.stringify(after)!==JSON.stringify(before))localStorage.setItem(LIVE_LEDGER_KEY,JSON.stringify(after));
   setLocalLedger(after);setLedgerStatus('LOCAL_ONLY');
  }catch{setLedgerStatus('STORAGE_UNAVAILABLE');setLocalLedger([])}
 },[data,selection.provider,selection.symbol,interval]);
 const measuredLedger=useMemo(()=>ledgerMetrics(localLedger,selection.provider,selection.symbol,interval),[localLedger,selection.provider,selection.symbol,interval]);

 const load=useCallback(async({quiet=false}={})=>{
  const url=buildUrl(selection,interval,range,horizon);
  // Deduplicate the same poll but cancel a stale request immediately when
  // symbol, interval, range, or horizon changes.
  if(inFlight.current&&requestKey.current===url)return;
  inFlight.current=true;requestKey.current=url;
  const seq=++requestSeq.current;
  abortRef.current?.abort();
  const ctrl=new AbortController();abortRef.current=ctrl;
  if(!quiet)setLoading(true);setError('');
  try{const d=await getJson(url,ctrl.signal);if(seq===requestSeq.current)setData(d)}
  catch(e){if(e?.name!=='AbortError'&&seq===requestSeq.current)setError(e.message||'Market request failed')}
  finally{if(seq===requestSeq.current){if(!quiet)setLoading(false);inFlight.current=false;requestKey.current=null}}
 },[selection,interval,range,horizon]);

 useEffect(()=>{load();return()=>abortRef.current?.abort()},[load]);
 useEffect(()=>{
  const every=Number(data?.session?.autoRefreshMs);
  if(!Number.isFinite(every)||every<60_000)return;
  let active=true;
  const id=globalThis.setInterval(()=>{if(active&&!document.hidden)load({quiet:true})},every);
  const visible=()=>{if(active&&!document.hidden)load({quiet:true})};
  document.addEventListener('visibilitychange',visible);
  return()=>{active=false;globalThis.clearInterval(id);document.removeEventListener('visibilitychange',visible)};
 },[data?.session?.autoRefreshMs,load]);

 useEffect(()=>{setStreamPrice(null);setStreamTime(null);if(selection.provider!=='coinbase')return;let ws;try{ws=new WebSocket('wss://ws-feed.exchange.coinbase.com');ws.onopen=()=>ws.send(JSON.stringify({type:'subscribe',product_ids:[selection.symbol],channels:['ticker']}));ws.onmessage=e=>{try{const x=JSON.parse(e.data);if(x.type==='ticker'&&x.product_id===selection.symbol&&Number.isFinite(+x.price)){setStreamPrice(+x.price);setStreamTime(x.time||new Date().toISOString())}}catch{}}}catch{}return()=>{try{ws?.close()}catch{}}},[selection.provider,selection.symbol]);

 const choose=x=>{const s={symbol:x.symbol,name:x.name||x.symbol,provider:x.provider||'yahoo',assetClass:x.assetClass||'market',exchange:x.exchange||''};setData(null);setStreamPrice(null);setStreamTime(null);setSelection(s);setQuery(s.symbol);setOptions(null);if(s.provider==='amfi'||s.provider==='ecb'||s.assetClass==='mutual_fund'){setInterval('1d');if(['1d','5d'].includes(range))setRange('2y')}else if((s.provider==='coinbase'&&interval==='1wk')||(s.provider==='yahoo'&&interval==='6h'))setInterval('1d')};
 const loadOptions=async()=>{setOptionsLoading(true);try{setOptions(await getJson(`/api/data?action=options&symbol=${encodeURIComponent(selection.symbol)}`))}catch(e){setOptions({state:'DEGRADED',message:e.message,calls:[],puts:[]})}finally{setOptionsLoading(false)}};
 const loadOrderFlow=async()=>{setOrderFlowLoading(true);try{setOrderFlow(await getJson(`/api/data?action=microstructure&symbol=${encodeURIComponent(selection.symbol)}`))}catch(e){setOrderFlow({error:e.message||'Exchange microstructure unavailable'})}finally{setOrderFlowLoading(false)}};
 const f=data?.forecast,v=data?.validation,ind=data?.indicators,m=orderFlow?.microstructure||data?.microstructure,quote=data?.quote||{},meta=data?.meta||{};
 const displayPrice=streamPrice??quote.price??data?.candles?.at(-1)?.close;
 const change=Number.isFinite(+displayPrice)&&Number.isFinite(+quote.previousClose)&&+quote.previousClose?+displayPrice/+quote.previousClose-1:null;
 const forecastState=f?.decisionState||'UNAVAILABLE';
 const publishable=forecastState==='PUBLISHABLE';
 const chartForecast=useMemo(()=>{
  if(!f?.available||publishable)return f;
  return {...f,center:null,points:(f.points||[]).map(p=>({...p,price:null,change:null}))};
 },[f,publishable]);
 const forecastPoints=publishable?(f?.points||[]):[];
 const canOptions=['stock','etf','index'].includes(selection.assetClass)||['stock','etf','index'].includes(String(meta.assetClass||'').toLowerCase());
 const optionsNear=useMemo(()=>{if(!options?.calls?.length&&!options?.puts?.length)return[];const spot=options.metrics?.spot||+quote.price||0;return[...(options.calls||[]).map(x=>({...x,type:'Call'})),...(options.puts||[]).map(x=>({...x,type:'Put'}))].sort((a,b)=>Math.abs(a.strike-spot)-Math.abs(b.strike-spot)).slice(0,16)},[options,quote.price]);
 const candleRows=data?.candles||[];
 const forecastByObservation=useMemo(()=>{
  const values=new Map((data?.nextBar?.history||[]).map(r=>[Number(r.observedAt),{...r,sourceLabel:'Historical replay'}]));
  for(const row of localLedger){
   if(row.status==='SETTLED'&&row.provider===selection.provider&&row.symbol===selection.symbol&&row.interval===interval)
    values.set(Number(row.actualTime),{predicted:row.predicted,observed:row.observed,absErrorPct:row.absErrorPct,sourceLabel:'Issued live'});
  }
  return values;
 },[data?.nextBar?.history,localLedger,selection.provider,selection.symbol,interval]);
 const displayedHistory=useMemo(()=>candleRows.slice(-tableLimit).slice().reverse(),[candleRows,tableLimit]);
 const integrity=data?.quality?.integrity||{};
 const integrityIssues=(integrity.invalidRowsRemoved||0)+(integrity.duplicatesRemoved||0)+(integrity.outOfOrderPairs||0);

 const toggleWatch=()=>{try{let a=JSON.parse(localStorage.getItem('zachitan.watchlist.v4')||'[]');const same=x=>x.symbol===selection.symbol&&x.provider===selection.provider;if(a.some(same)){a=a.filter(x=>!same(x));setSaved(false)}else{a.unshift({...selection,name:meta.name||selection.name});a=a.slice(0,40);setSaved(true)}localStorage.setItem('zachitan.watchlist.v4',JSON.stringify(a));window.dispatchEvent(new Event('zachitan-watchlist'))}catch{}};
 const exportCsv=()=>{const rows=data?.candles||[];if(!rows.length)return;const csv=(meta.referenceValueOnly?['time,reference_value',...rows.map(x=>[new Date(x.time*1000).toISOString(),x.close].join(','))]:['time,open,high,low,close,volume',...rows.map(x=>[new Date(x.time*1000).toISOString(),x.open,x.high,x.low,x.close,x.volume??''].join(','))]).join('\n');const blob=new Blob([csv],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`zachitan-${selection.symbol.replace(/[^A-Za-z0-9.-]/g,'_')}-${interval}.csv`;a.click();URL.revokeObjectURL(a.href)};
 const skillState=!v?.available?'Not enough completed historical checks':v.skillVsNoChange>0&&v.brierSkillVs50>0?'Lower historical price and direction error than simple baselines in this sample':'Predictions did not reliably beat a no-change reference in this sample';

 return <div className={`marketLayout ${loading?'loading':''}`}>
  <aside className="card controls">
   <label className="label">Find an instrument</label><AssetSearch value={query} onChange={setQuery} onSelect={choose} placeholder="Ticker, company, index, FX or crypto…" label="Find an instrument" help="Search by symbol or name"/>
   <div className="controlGroup"><label className="label">Observation size</label><div className="chips">{TF.map(t=><button key={t} disabled={(isDailyOnly&&t!=='1d')||(selection.provider==='coinbase'&&t==='1wk')||(selection.provider==='yahoo'&&t==='6h')} className={`chip ${interval===t?'on':''}`} onClick={()=>setInterval(t)}>{t}</button>)}</div>{isDailyOnly&&<p className="muted" style={{fontSize:10}}>Daily/reference source. Intraday bars are not fabricated.</p>}</div>
   <div className="controlGroup"><label className="label">Display history</label><select className="select" value={range} onChange={e=>setRange(e.target.value)}>{RANGES.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
   <div className="controlGroup"><label className="label">Forecast horizon</label><select className="select" value={horizon} onChange={e=>setHorizon(+e.target.value)}>{[3,5,8,12,20,30,50].map(x=><option key={x} value={x}>{x} market observations</option>)}</select></div>
   <div className="controlGroup"><button className="btn primary" style={{width:'100%'}} onClick={()=>load()}>Refresh snapshot</button></div>
   <details className="controlGroup"><summary className="label" style={{cursor:'pointer'}}>Quick markets</summary><div style={{marginTop:10}}>{Object.entries(GROUPS).map(([g,rows])=><div key={g} style={{marginBottom:9}}><div style={{fontSize:10,color:'#85888e',margin:'0 0 5px'}}>{g}</div><div className="chips">{rows.map(([s,n,p])=><button key={`${p}:${s}`} className={`chip ${selection.symbol===s?'on':''}`} title={n} onClick={()=>choose({symbol:s,name:n,provider:p,assetClass:assetClassForGroup(g)})}>{s}</button>)}</div></div>)}</div></details>
   <div className="controlGroup notice">Future prices are shown only when completed historical checks support them. A withheld price is not a missing user action; it reflects insufficient measured accuracy.</div>
  </aside>

  <div className="marketMain">
   {error&&<div className="error"><b>Market source failed.</b> {error}. No substitute price was generated.</div>}
   <div className="card pad"><div className="assetHead"><div><p className="eyebrow">{meta.assetClass||selection.assetClass} · {meta.exchange||selection.exchange||selection.provider}</p><h2>{meta.name||selection.name||selection.symbol}</h2><div className="assetSub">{selection.symbol} · {meta.currency||''} · {data?.quality?.rows||0} clean observations · {date(data?.quality?.newest)}</div><div className="pillRow" style={{marginTop:9}}><button className="btn" onClick={toggleWatch}>{saved?'★ In watchlist':'☆ Add to watchlist'}</button><button className="btn" onClick={exportCsv} disabled={!data?.candles?.length}>Export CSV</button></div></div><div className="quote"><div className="quotePrice">{smart(displayPrice)}</div><div className={`quoteSub ${change>0?'positive':change<0?'negative':''}`}>{change==null?'Previous-close comparison unavailable':`${signedPct(change)} vs previous close`} · {date(streamTime||quote.time||data?.quality?.newest)}</div></div></div>
    <div className="grid3" style={{marginTop:18}}><div className="metric"><span>Market session</span><b>{data?.session?.state||'—'}</b><small>{data?.session?.transport||'source status pending'}</small></div><div className="metric"><span>Forecast reliability</span><b>{plainStatus(forecastState)}</b><small>{f?.abstainReason||skillState}</small></div><div className="metric"><span>Data integrity</span><b>{integrityIssues===0?'CLEAN':`${integrityIssues} repaired`}</b><small>{integrity.duplicatesRemoved||0} duplicate · {integrity.invalidRowsRemoved||0} invalid · {integrity.outOfOrderPairs||0} order</small></div></div>
   </div>

   <div className="card chartPanel"><div className="chartToolbar"><div><b style={{fontSize:13}}>{meta.referenceValueOnly?'Published reference values':'Observed market data'}</b><div className="muted" style={{fontSize:10,marginTop:2}}>{publishable?'Validated forecast overlay is enabled.':'Forecast overlay is withheld until publication gates pass.'} Drag to pan · wheel or +/− to zoom</div></div><SourceStatus provider={data?.provenance?.provider||selection.provider} state={data?'CONNECTED':'CHECKING'}/></div><div className="chartWrap"><InteractiveChart key={selection.provider+':'+selection.symbol+':'+interval} candles={data?.candles||[]} forecast={chartForecast} livePrice={displayPrice} provider={selection.provider} interval={meta.interval||interval} referenceValueOnly={!!meta.referenceValueOnly}/></div><div className="chartLegend"><span>{meta.referenceValueOnly?'Published NAV/reference values are genuine; the flat display is not real OHLC or traded volume.':'Open, high, low and close are completed source bars. The live ticker is separate.'}</span><span>{data?.provenance?.provider||'Source pending'} · no invented candles</span></div>
    <MarketIndicatorPanels candles={data?.candles||[]} interval={meta.interval||interval} provider={selection.provider} referenceValueOnly={!!meta.referenceValueOnly}/>
    <section className="candleHistory" aria-label="Published candle history">
     <div className="candleHistoryHead">
      <div><h3>Observed price history</h3><p>Source timestamps are shown in your device timezone. Rows are published candles, not projections. A missing slot is never filled with a fabricated candle.</p></div>
      <label>Rows <select className="select" value={tableLimit} onChange={e=>setTableLimit(Number(e.target.value))}>{[25,50,100,250,1000].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
     </div>
     <div className="candleHistoryScroll"><table className="table candleTable">
      <thead><tr><th>Published bar</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th><th>Change vs preceding close</th><th>High − low</th><th>Forecast open</th><th>Forecast high</th><th>Forecast low</th><th>Forecast close</th><th>Actual − forecast close</th><th>Evidence type</th><th>Time since preceding bar</th></tr></thead>
      <tbody>{displayedHistory.map((bar,i)=>{
       const index=candleRows.length-1-i,previous=candleRows[index-1];
       const diff=previous?.close>0?bar.close/previous.close-1:null;
       const gapLabel=classifyGap(previous,bar,{provider:selection.provider,interval:meta.interval||interval,timezone:meta.timezone||'UTC'}).label;
       const matched=forecastByObservation.get(Number(bar.time));
       const estimated=matched?.predicted;
       const signedDelta=estimated?.close>0&&bar.close>0?bar.close-estimated.close:null;
       return <tr key={bar.time}>
        <td><b>{date(bar.time)}</b></td>
        <td>{meta.referenceValueOnly?'Reference only':smart(bar.open)}</td>
        <td>{meta.referenceValueOnly?'Reference only':smart(bar.high)}</td>
        <td>{meta.referenceValueOnly?'Reference only':smart(bar.low)}</td>
        <td><b>{smart(bar.close)}</b></td>
        <td>{meta.referenceValueOnly?'Not published':smart(bar.volume)}</td>
        <td className={diff>0?'positive':diff<0?'negative':''}>{diff==null?'—':signedPct(diff)}</td>
        <td>{meta.referenceValueOnly?'Not published':bar.high!=null&&bar.low!=null?smart(bar.high-bar.low):'—'}</td>
        <td>{estimated?.open!=null?smart(estimated.open):'—'}</td>
        <td>{estimated?.high!=null?smart(estimated.high):'—'}</td>
        <td>{estimated?.low!=null?smart(estimated.low):'—'}</td>
        <td>{estimated?.close!=null?smart(estimated.close):'—'}</td>
        <td className={signedDelta>0?'positive':signedDelta<0?'negative':''}>{signedDelta==null?'—':smart(signedDelta)}{matched?.absErrorPct?.close!=null?<small style={{display:'block'}}>Abs. error {matched.absErrorPct.close.toFixed(2)}%</small>:null}</td>
        <td>{matched?.sourceLabel||'No issued forecast'}</td>
        <td>{gapLabel}</td>
       </tr>;
      })}</tbody>
     </table></div>
     <p className="candleHistoryFoot">{candleRows.length?'Showing '+displayedHistory.length+' of '+candleRows.length+' displayed source candles. First: '+date(candleRows[0].time)+'; latest: '+date(candleRows.at(-1).time)+'.':'Waiting for published candles.'} Predicted fields are drawn only from recorded live forecasts or identified historical replays; no missing prediction or candle is manufactured.</p>
    </section>
   </div>

   <TimeframeResearch selection={selection} interval={interval} onSelect={setInterval} data={data}/>

   <div className="forecastPanel">
    <div className="card forecastHero"><p className="eyebrow">Future-price estimate</p>{f?.available?<>{publishable?<><div className="forecastCenter">{smart(f.center)}</div><div className="muted" style={{fontSize:12}}>{horizon} observations ahead · current {smart(f.current)} · center change {signedPct(f.center/f.current-1)}</div></>:<><div className="forecastCenter" style={{fontSize:28}}>NOT ENOUGH EVIDENCE</div><div className="muted" style={{fontSize:12}}>{f.abstainReason||'The forecast is research-only because production publication gates are not satisfied.'}</div></>}<div className="notice" style={{marginTop:12}}><b>{skillState}</b><div style={{marginTop:4,fontSize:11}}>Forecast status: {plainStatus(forecastState)}{f?.regime?.elevated?` · regime move ${pct(f.regime.absoluteMove)}`:''}</div></div><div className="rangeList">{[50,80,90].map(k=><div className="rangeRow" key={k}><span>{k}%</span><b>{f.ranges?.[k]?`${smart(f.ranges[k][0])} — ${smart(f.ranges[k][1])}`:'Withheld'}</b><small>{f.ranges?.[k]?'historical empirical uncertainty; not a point target':'insufficient dependence-adjusted evidence'}</small></div>)}</div></>:<div className="notice">{f?.reason||'Forecast unavailable for the current history.'}</div>}</div>
    <div className="card pad"><Score value={f?.evidenceScore} title="Historical pattern support" copy="How much independent past market data supports the observed pattern. It does not guarantee a future return."/><div className="divider"/><Score value={f?.calibrationScore} title="Historical error checks" copy="Compares measured past errors and expected ranges. An unavailable score means no reliable measurement."/><div className="divider"/><div className="grid2"><div className="metric"><span>P(above current)</span><b>{f?.available?pct(f?.direction?.up):'—'}</b></div><div className="metric"><span>P(below current)</span><b>{f?.available?pct(f?.direction?.down):'—'}</b></div><div className="metric"><span>Independent historical examples (adjusted)</span><b>{num(f?.effectiveN,1)}</b></div><div className="metric"><span>Completed historical test points</span><b>{v?.checks||'—'}</b><small>up to {data?.compute?.validationOriginsMax||36} origins</small></div></div></div>
   </div>


   <details className="card pad" id="forecast-diagnosis">
    <summary style={{cursor:'pointer',fontWeight:750,fontSize:17}}>Why are the forecasts inaccurate? · Measured diagnostics</summary>
    <p className="muted" style={{fontSize:12,lineHeight:1.6,margin:'13px 0'}}>These diagnostics distinguish statistically observed failures from missing inputs. An omitted factor is a potential limitation, not proof that it caused any particular price move.</p>
    {data?.diagnostic?.measured?.length?<div className="grid2">
     {data.diagnostic.measured.map(item=><div key={item.code} className={item.severity==='CRITICAL'?'error':'notice'}>
      <b>{item.title}</b><p style={{fontSize:12,lineHeight:1.5,margin:'5px 0 0'}}>{item.detail} {item.samples?'n='+item.samples:''}</p>
     </div>)}
    </div>:<div className="notice">No measured failure finding is available from the current completed source observations. This is not evidence that a future projection is correct.</div>}
    <details style={{marginTop:13}}><summary style={{cursor:'pointer',fontWeight:700}}>Unmeasured factors and external-source limitations</summary>
     <div className="grid2" style={{marginTop:12}}>{(data?.diagnostic?.unmeasured||[]).map(item=><div key={item.code} className="metric"><b style={{fontSize:13}}>{item.title}</b><p style={{fontSize:12,lineHeight:1.5,margin:'6px 0 0'}}>{item.detail}</p></div>)}</div>
    </details>
   </details>

   <IndependentVerification symbol={selection.symbol} interval={interval}/>

   <section className="card pad" id="live-tracker" aria-label="Observed live forecast ledger">
    <div className="sectionHead" style={{marginBottom:12}}><div><p className="eyebrow">Browser-local · recorded when this page is open</p><h2 style={{fontSize:23}}>This browser’s observation log</h2></div><span className="betaBadge">{ledgerStatus==='LOCAL_ONLY'?'BROWSER LOCAL':'STORAGE UNAVAILABLE'}</span></div>
    <p className="muted" style={{fontSize:12,lineHeight:1.6}}>Actual forecasts are recorded when this browser receives a new completed source bar. When a later completed bar becomes available, its genuine published OHLCV values settle the earlier forecast automatically. This is separate from reconstructed historical backtesting. It performs no additional backend polling, but <strong>cannot issue predictions while the browser is closed</strong>. Local browser storage may be deleted, and records do not synchronize across devices.</p>
    <div className="grid4" style={{marginTop:13}}>
     <div className="metric"><span>Actually issued here</span><b>{measuredLedger.issued}</b></div>
     <div className="metric"><span>Settled on published bars</span><b>{measuredLedger.settled}</b></div>
     <div className="metric"><span>Awaiting outcome</span><b>{measuredLedger.pending}</b></div>
     <div className="metric"><span>Mean close absolute error</span><b>{measuredLedger.meanAbsCloseErrorPct==null?'—':measuredLedger.meanAbsCloseErrorPct.toFixed(3)+'%'}</b><small>n={measuredLedger.settled}, issued on this browser</small></div>
    </div>
    {ledgerStatus!=='LOCAL_ONLY'?<div className="error" style={{marginTop:12}}>Browser storage is unavailable; an authentic as-issued history cannot be persisted in this session.</div>:null}
    {measuredLedger.settled<20?<div className="notice" style={{marginTop:12}}>Insufficient as-issued outcomes for a reliable accuracy assessment. Historical reconstructions below are not counted as actual live predictions.</div>:<div className="notice" style={{marginTop:12}}>Live historical directional sample: {measuredLedger.directionChecks}; measured candle-body direction {measuredLedger.closeDirectionAccuracy==null?'insufficient':pct(measuredLedger.closeDirectionAccuracy)}. No performance guarantee.</div>}
    <details style={{marginTop:12}}><summary style={{cursor:'pointer',fontWeight:700}}>Original predictions and subsequently observed outcomes</summary>
     <div style={{overflowX:'auto',marginTop:10}}><table className="table"><thead><tr><th>Issued</th><th>Origin bar</th><th>Outcome bar</th><th>Original next O / H / L / C / volume</th><th>Observed next O / H / L / C / volume</th><th>Close error</th><th>State</th></tr></thead>
      <tbody>{measuredLedger.history.map(x=><tr key={x.id}><td>{date(x.issuedAt)}</td><td>{date(x.originTime)}</td><td>{date(x.actualTime)}</td>
       <td>{['open','high','low','close','volume'].map(k=>smart(x.predicted?.[k])).join(' / ')}</td>
       <td>{x.status==='SETTLED'?['open','high','low','close','volume'].map(k=>smart(x.observed?.[k])).join(' / '):'Pending completed observation'}</td>
       <td>{x.absErrorPct?.close==null?'—':x.absErrorPct.close.toFixed(3)+'%'}</td><td>{x.status}</td></tr>)}</tbody></table>
     </div>
    </details>
   </section>

   <section className="card pad" id="accuracy-history" aria-label="Adaptive OHLCV forecast and accuracy history">
     <div className="sectionHead" style={{marginBottom:14}}>
       <div><p className="eyebrow">Automatic, source-only prequential evaluation</p><h2 style={{fontSize:24}}>Upcoming candle · Forecast and accuracy history</h2></div>
       <span className="betaBadge">{data?.nextBar?.available?'HISTORICAL RECONSTRUCTION':'NOT AVAILABLE'}</span>
     </div>
     <p className="muted" style={{fontSize:12,marginBottom:15}}>On continuous crypto markets the future opening-price forecast targets a bar that has not yet opened, {data?.nextBar?.horizonObservations||1} source observations after the last completed origin. {data?.nextBar?.targetTime?'Target starts '+date(data.nextBar.targetTime)+'. ':''}Every historical forecast uses earlier completed candles only. Later observed candles score it, and earlier matured errors adjust subsequent forecasts automatically. These are reconstructed walk-forward tests, not archived predictions issued to users or a guarantee of future accuracy. No manual verification is required.</p>
     {data?.nextBar?.available?<>
       <div className="grid3" style={{marginBottom:14}}>
         <div className="metric"><span>Walk-forward checks</span><b>{data.nextBar.checks}</b><small>Last {data.nextBar.evaluationChecks} in error statistics</small></div>
         <div className="metric"><span>Next-close direction accuracy</span><b>{data.nextBar.closeDirectionAccuracy==null?'Not measured':pct(data.nextBar.closeDirectionAccuracy)}</b><small>{data.nextBar.directionChecks} scored nonzero-direction forecasts</small></div>
         <div className="metric"><span>Latest completed candle</span><b style={{fontSize:12}}>{date(data.nextBar.latestCompletedTime)}</b><small>{data?.compute?.excludedUnfinished?'Unfinished candle excluded':'Completed source observations only'}</small></div>
       </div>
       <div style={{overflowX:'auto'}}>
         <table className="table">
           <thead><tr><th>Variable</th><th>Next observation</th><th>Empirical 80% band</th><th>Average prediction error</th><th>Simple baseline error</th><th>Relative improvement</th><th>Adjustment</th></tr></thead>
           <tbody>{[['open','Next open'],['high','Next high'],['low','Next low'],['close','Next close'],['volume','Next traded volume'],['range','Full candle range (high − low)'],['body','Candle body (|close − open|)']].map(([field,label])=>{
             const stats=data.nextBar.accuracy?.[field]||{},band=data.nextBar.empirical80?.[field],parameter=data.nextBar.parameters?.[field]||{};
             return <tr key={field}>
               <td><b>{label}</b>{field==='volume'?<div className="muted" style={{fontSize:10}}>Per completed candle, only where reported</div>:null}</td>
               <td><b>{smart(data.nextBar.forecast?.[field])}</b></td>
               <td>{Array.isArray(band)?band.map(smart).join(' – '):'Uncalibrated'}</td>
               <td>{stats.meanAbsPctError==null?'—':stats.meanAbsPctError.toFixed(2)+'%'}<div className="muted" style={{fontSize:10}}>n={stats.samples||0}</div></td>
               <td>{stats.baselineMeanAbsPctError==null?'—':stats.baselineMeanAbsPctError.toFixed(2)+'%'}</td>
               <td className={stats.skill>0?'positive':stats.skill<0?'negative':''}>{stats.skill==null?'—':pct(stats.skill)}</td>
               <td><b>{parameter.weight==null?'—':pct(parameter.weight,0)} pattern influence</b><div className="muted" style={{fontSize:10}}>{plainAdjustment(parameter.reason)}</div></td>
             </tr>;
           })}</tbody>
         </table>
       </div>
       <div className="notice" style={{marginTop:12}}><b>Accuracy is measured, not asserted.</b> The MAPE columns are the mean of the displayed per-origin absolute percentage errors (100 × |prediction / actual − 1|); only positive actuals are eligible. The separate skill column compares mean absolute log errors against a matched naive baseline. Positive skill means lower historical log error, not positive investment returns. Missing volume or bands are never invented.</div>
       <div className="notice" style={{marginTop:12}}>Measured window: {date(data.nextBar.firstEvaluationTime)} to {date(data.nextBar.lastEvaluationTime)} · {data.nextBar.evaluationChecks||0} completed next-bar outcomes. {data.nextBar.skippedUnobservedIntervals?data.nextBar.skippedUnobservedIntervals+' crypto publisher time gaps excluded from scoring.':'No publisher gaps were excluded in this window.'} If the source provides fewer bars than requested, no longer history is inferred.</div>
       <BacktestErrorChart history={data.nextBar.history||[]} provider={selection.provider} interval={meta.interval||interval}/>
        <ExtendedBacktest candles={data?.candles||[]} provider={selection.provider} interval={meta.interval||interval} analysisIdentity={data?.analysisIdentity}/>
       <details style={{marginTop:18}}>
         <summary style={{cursor:'pointer',fontWeight:700}}>Observed interval coverage and historical predictions</summary>
         <div className="grid5" style={{marginTop:13,marginBottom:13}}>
           {['open','high','low','close','volume','range','body'].map(field=>{
             const c=data.nextBar.intervalCoverage?.[field]||{};
             return <div className="metric" key={field}><span>{field.toUpperCase()} · nominal 80%</span><b>{c.observed==null?'Insufficient':pct(c.observed)}</b><small>{c.checks||0} matured band checks</small></div>;
           })}
         </div>
         <div style={{overflowX:'auto'}}>
           <table className="table">
             <thead><tr><th>Historical forecast origin</th><th>Observed next</th><th>Predicted O / H / L / C / volume</th><th>Observed O / H / L / C / volume</th><th>Close absolute error</th></tr></thead>
             <tbody>{(data.nextBar.history||[]).map((record,i)=><tr key={record.issuedAt+'-'+i}>
               <td>{date(record.issuedAt)}</td><td>{date(record.observedAt)}</td>
               <td>{['open','high','low','close','volume'].map(k=>smart(record.predicted?.[k])).join(' / ')}<div className="muted" style={{fontSize:10}}>Range {smart(record.predicted?.range)} · Body {smart(record.predicted?.body)}</div></td>
               <td>{['open','high','low','close','volume'].map(k=>smart(record.observed?.[k])).join(' / ')}<div className="muted" style={{fontSize:10}}>Range {smart(record.observed?.range)} · Body {smart(record.observed?.body)}</div></td>
               <td>{record.absErrorPct?.close==null?'—':record.absErrorPct.close.toFixed(2)+'%'}</td>
             </tr>)}</tbody>
           </table>
         </div>
         <p className="muted" style={{fontSize:11,marginTop:9}}>These rows are reproducibly reconstructed from source history. They are not an immutable as-issued live prediction ledger. Results vary by symbol, timeframe and market regime.</p>
       </details>
     </>:<div className="notice">{data?.nextBar?.reason||'No eligible completed source OHLCV history. Live accuracy has not been measured.'}</div>}
   </section>
   {publishable&&forecastPoints.length?<div className="card pad"><div className="sectionHead" style={{marginBottom:8}}><div><p className="eyebrow">Validated forward path</p><h2 style={{fontSize:25}}>Published checkpoints</h2></div><p>{f?.timePolicy||'Indexed by future market observations.'}</p></div><div style={{overflow:'auto'}}><table className="pointTable"><thead><tr><th>Checkpoint</th><th>Point</th><th>Change</th><th>P(up)</th><th>50% interval</th><th>80% interval</th><th>90% interval</th></tr></thead><tbody>{forecastPoints.map((p,i)=><tr key={`${p.bar}:${i}`}><td>{p.time?date(p.time):p.observationLabel||`+${p.bar} observations`}</td><td><b>{smart(p.price)}</b></td><td className={p.change>=0?'positive':'negative'}>{signedPct(p.change)}</td><td>{pct(p.pUp)}</td><td>{p.ranges?.[50]?`${smart(p.ranges[50][0])}–${smart(p.ranges[50][1])}`:'—'}</td><td>{p.ranges?.[80]?`${smart(p.ranges[80][0])}–${smart(p.ranges[80][1])}`:'—'}</td><td>{p.ranges?.[90]?`${smart(p.ranges[90][0])}–${smart(p.ranges[90][1])}`:'—'}</td></tr>)}</tbody></table></div></div>:null}

   <details className="card pad"><summary style={{cursor:'pointer',fontWeight:700}}>Validation and model diagnostics</summary><div style={{marginTop:16}}>{v?.available?<><div className="grid5"><div className="metric"><span>Walk-forward checks</span><b>{v.checks}</b><small>minimum gap {v.originGapMin} bars</small></div><div className="metric"><span>Error relative to unchanged price</span><b>{metric(v.maseNoChange,3)}</b><small>&lt;1 beats unchanged-price</small></div><div className="metric"><span>Historical improvement vs simple price</span><b className={v.skillVsNoChange>0?'positive':'negative'}>{pct(v.skillVsNoChange)}</b><small>positive is better</small></div><div className="metric"><span>Past confidence in up/down direction</span><b className={v.brierSkillVs50>0?'positive':'negative'}>{pct(v.brierSkillVs50)}</b><small>vs 50/50 probability</small></div><div className="metric"><span>Past up/down accuracy</span><b>{pct(v.directionAccuracy)}</b><small>momentum {pct(v.momentumDirectionAccuracy)}</small></div></div><div className="grid3" style={{marginTop:12}}>{[50,80,90].map(k=><div className="metric" key={k}><span>{k}% interval coverage</span><b>{pct(v.coverage?.[k])}</b><small>mean width {pct(v.intervalMeanWidthPct?.[k])}</small></div>)}</div></>:<div className="notice">{v?.reason||'Not enough clean history for non-overlapping validation.'}</div>}</div></details>

   <details className="card pad"><summary style={{cursor:'pointer',fontWeight:700}}>Technical context</summary><div className="grid5" style={{marginTop:16}}><div className="metric"><span>RSI 14</span><b>{num(ind?.rsi14,1)}</b><small>50 is neutral</small></div><div className="metric"><span>ATR / price</span><b>{pct(ind?.atrPct,2)}</b><small>Recent range scale</small></div><div className="metric"><span>20-observation vol</span><b>{pct(ind?.realizedVol20,2)}</b><small>Log-return dispersion</small></div><div className="metric"><span>252-observation position</span><b>{pct(ind?.position52,0)}</b><small>Available rolling range</small></div><div className="metric"><span>Freshness</span><b>{data?.quality?.freshnessScore??'—'}</b><small>{titleCase(data?.quality?.freshnessStatus)}</small></div></div></details>

   {selection.provider==='coinbase'&&<details className="card pad"><summary style={{cursor:'pointer',fontWeight:700}}>Exchange microstructure · on demand</summary><div style={{marginTop:14}}><p className="muted" style={{fontSize:11,marginBottom:10}}>Order-book and trade snapshots are optional and never trigger extra upstream requests on the automatic forecast refresh cycle.</p><button className="btn" onClick={loadOrderFlow} disabled={orderFlowLoading}>{orderFlowLoading?'Loading venue data…':'Load live order flow'}</button>{orderFlow?.error?<div className="notice" style={{marginTop:8}}>{orderFlow.error}</div>:null}{m?<div className="grid5" style={{marginTop:16}}><div className="metric"><span>Book imbalance</span><b>{metric(m.bookImbalance,3)}</b></div><div className="metric"><span>Trade imbalance</span><b>{metric(m.tradeImbalance,3)}</b></div><div className="metric"><span>Spread</span><b>{metric(m.spreadBps,2)} bps</b></div><div className="metric"><span>Best bid</span><b>{smart(m.bestBid)}</b></div><div className="metric"><span>Best ask</span><b>{smart(m.bestAsk)}</b></div></div>:null}</div></details>}

   {canOptions&&<details className="card pad"><summary style={{cursor:'pointer',fontWeight:700}}>Options evidence</summary><div style={{marginTop:16}}><div className="sectionHead"><p>Best-effort published chain. Loaded only on demand.</p><button className="btn" onClick={loadOptions} disabled={optionsLoading}>{optionsLoading?'Loading…':'Load options'}</button></div>{options?.state==='DEGRADED'?<div className="notice">{options.message||'Public options feed unavailable. No synthetic contracts were inserted.'}</div>:optionsNear.length?<div style={{overflow:'auto'}}><table className="table"><thead><tr><th>Type</th><th>Strike</th><th>Bid</th><th>Ask</th><th>IV</th><th>Volume</th><th>OI</th></tr></thead><tbody>{optionsNear.map((o,i)=><tr key={`${o.contractSymbol}:${i}`}><td>{o.type}</td><td>{smart(o.strike)}</td><td>{smart(o.bid)}</td><td>{smart(o.ask)}</td><td>{pct(o.impliedVolatility)}</td><td>{o.volume||0}</td><td>{o.openInterest||0}</td></tr>)}</tbody></table></div>:<div className="notice">No chain loaded yet.</div>}</div></details>}
  </div>
 </div>
}
