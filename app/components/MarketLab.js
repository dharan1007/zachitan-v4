'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import InteractiveChart from './InteractiveChart';
import Score from './Score';
import SourceStatus from './SourceStatus';
import AssetSearch from './AssetSearch';
import {smart,pct,signedPct,date,num} from './Format';

const GROUPS={
 'Crypto':[['BTC-USD','Bitcoin / USD','coinbase']],
 'Stocks':[['AAPL','Apple','yahoo'],['RELIANCE.NS','Reliance','yahoo'],['NVDA','NVIDIA','yahoo']],
 'ETFs':[['SPY','S&P 500 ETF','yahoo'],['NIFTYBEES.NS','Nifty BeES','yahoo']],
 'Indices':[['^NSEI','NIFTY 50','yahoo'],['^GSPC','S&P 500','yahoo']],
 'Futures':[['ES=F','E-mini S&P','yahoo'],['GC=F','Gold','yahoo'],['CL=F','Crude oil','yahoo']],
 'Forex':[['USDINR=X','USD / INR','yahoo'],['EURUSD=X','EUR / USD','yahoo'],['EUR/INR','EUR / INR ECB reference','ecb']],
 'Funds':[['VFIAX','Vanguard 500 Index Fund','yahoo'],['FXAIX','Fidelity 500 Index Fund','yahoo']]
};
const TF=['1m','5m','15m','1h','1d','1wk'];
const RANGES=['1d','5d','1mo','3mo','6mo','1y','2y','5y','10y','max'];
function clampInterval(v){return TF.includes(String(v))?String(v):'5m'}
function clampRange(v){return RANGES.includes(String(v))?String(v):'1mo'}
function assetClassForGroup(g){return g.toLowerCase().replace('funds','mutual_fund').replace('stocks','stock').replace('indices','index').replace('futures','future').replace('etfs','etf')}
async function getJson(url,signal){const r=await fetch(url,{signal});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||`Request ${r.status}`);return d}
function buildUrl(selection,interval,range,horizon){return `/api/data?${new URLSearchParams({action:'market',provider:selection.provider,symbol:selection.symbol,interval:clampInterval(interval),range:clampRange(range),horizon:String(horizon)})}`}
function metric(v,d=2){return Number.isFinite(v)?Number(v).toFixed(d):'—'}
function titleCase(v){return String(v||'unknown').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase())}

export default function MarketLab(){
 const [selection,setSelection]=useState({symbol:'BTC-USD',name:'Bitcoin / US Dollar',provider:'coinbase',assetClass:'crypto',exchange:'Coinbase'});
 const [saved,setSaved]=useState(false),[interval,setInterval]=useState('5m'),[range,setRange]=useState('1mo'),[horizon,setHorizon]=useState(12);
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[query,setQuery]=useState('BTC-USD');
 const [options,setOptions]=useState(null),[optionsLoading,setOptionsLoading]=useState(false),[streamPrice,setStreamPrice]=useState(null),[streamTime,setStreamTime]=useState(null);
 const inFlight=useRef(false),abortRef=useRef(null),requestSeq=useRef(0);
 const isDailyOnly=selection.provider==='amfi'||selection.provider==='ecb'||selection.assetClass==='mutual_fund';

 useEffect(()=>{try{const q=new URLSearchParams(window.location.search),symbol=q.get('symbol'),provider=q.get('provider'),name=q.get('name'),assetClass=q.get('assetClass');if(symbol&&provider){setSelection({symbol,provider,name:name||symbol,assetClass:assetClass||'market',exchange:''});setQuery(symbol)}}catch{}},[]);
 useEffect(()=>{try{const a=JSON.parse(localStorage.getItem('zachitan.watchlist.v4')||'[]');setSaved(a.some(x=>x.symbol===selection.symbol&&x.provider===selection.provider))}catch{setSaved(false)}},[selection.symbol,selection.provider]);

 const load=useCallback(async({quiet=false}={})=>{
  if(inFlight.current)return;
  inFlight.current=true;
  const seq=++requestSeq.current;
  abortRef.current?.abort();
  const ctrl=new AbortController();abortRef.current=ctrl;
  if(!quiet)setLoading(true);setError('');
  try{const d=await getJson(buildUrl(selection,interval,range,horizon),ctrl.signal);if(seq===requestSeq.current)setData(d)}
  catch(e){if(e?.name!=='AbortError'&&seq===requestSeq.current)setError(e.message||'Market request failed')}
  finally{if(seq===requestSeq.current&&!quiet)setLoading(false);inFlight.current=false}
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

 const choose=x=>{const s={symbol:x.symbol,name:x.name||x.symbol,provider:x.provider||'yahoo',assetClass:x.assetClass||'market',exchange:x.exchange||''};setData(null);setSelection(s);setQuery(s.symbol);setOptions(null);if(s.provider==='amfi'||s.provider==='ecb'||s.assetClass==='mutual_fund'){setInterval('1d');if(['1d','5d'].includes(range))setRange('2y')}};
 const loadOptions=async()=>{setOptionsLoading(true);try{setOptions(await getJson(`/api/data?action=options&symbol=${encodeURIComponent(selection.symbol)}`))}catch(e){setOptions({state:'DEGRADED',message:e.message,calls:[],puts:[]})}finally{setOptionsLoading(false)}};
 const f=data?.forecast,v=data?.validation,ind=data?.indicators,m=data?.microstructure,quote=data?.quote||{},meta=data?.meta||{};
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
 const integrity=data?.quality?.integrity||{};
 const integrityIssues=(integrity.invalidRowsRemoved||0)+(integrity.duplicatesRemoved||0)+(integrity.outOfOrderPairs||0);

 const toggleWatch=()=>{try{let a=JSON.parse(localStorage.getItem('zachitan.watchlist.v4')||'[]');const same=x=>x.symbol===selection.symbol&&x.provider===selection.provider;if(a.some(same)){a=a.filter(x=>!same(x));setSaved(false)}else{a.unshift({...selection,name:meta.name||selection.name});a=a.slice(0,40);setSaved(true)}localStorage.setItem('zachitan.watchlist.v4',JSON.stringify(a));window.dispatchEvent(new Event('zachitan-watchlist'))}catch{}};
 const exportCsv=()=>{const rows=data?.candles||[];if(!rows.length)return;const csv=['time,open,high,low,close,volume',...rows.map(x=>[new Date(x.time*1000).toISOString(),x.open,x.high,x.low,x.close,x.volume||0].join(','))].join('\n');const blob=new Blob([csv],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`zachitan-${selection.symbol.replace(/[^A-Za-z0-9.-]/g,'_')}-${interval}.csv`;a.click();URL.revokeObjectURL(a.href)};
 const skillState=!v?.available?'Validation unavailable':v.skillVsNoChange>0&&v.brierSkillVs50>0?'Positive out-of-sample skill on this window':'No positive baseline skill on this window';

 return <div className={`marketLayout ${loading?'loading':''}`}>
  <aside className="card controls">
   <label className="label">Find an instrument</label><AssetSearch value={query} onChange={setQuery} onSelect={choose} placeholder="Ticker, company, index, FX or crypto…" label="Find an instrument" help="Search by symbol or name"/>
   <div className="controlGroup"><label className="label">Observation size</label><div className="chips">{TF.map(t=><button key={t} disabled={isDailyOnly&&t!=='1d'} className={`chip ${interval===t?'on':''}`} onClick={()=>setInterval(t)}>{t}</button>)}</div>{isDailyOnly&&<p className="muted" style={{fontSize:10}}>Daily/reference source. Intraday bars are not fabricated.</p>}</div>
   <div className="controlGroup"><label className="label">History</label><select className="select" value={range} onChange={e=>setRange(e.target.value)}>{RANGES.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
   <div className="controlGroup"><label className="label">Forecast horizon</label><select className="select" value={horizon} onChange={e=>setHorizon(+e.target.value)}>{[3,5,8,12,20,30,50].map(x=><option key={x} value={x}>{x} market observations</option>)}</select></div>
   <div className="controlGroup"><button className="btn primary" style={{width:'100%'}} onClick={()=>load()}>Refresh snapshot</button></div>
   <details className="controlGroup"><summary className="label" style={{cursor:'pointer'}}>Quick markets</summary><div style={{marginTop:10}}>{Object.entries(GROUPS).map(([g,rows])=><div key={g} style={{marginBottom:9}}><div style={{fontSize:10,color:'#85888e',margin:'0 0 5px'}}>{g}</div><div className="chips">{rows.map(([s,n,p])=><button key={`${p}:${s}`} className={`chip ${selection.symbol===s?'on':''}`} title={n} onClick={()=>choose({symbol:s,name:n,provider:p,assetClass:assetClassForGroup(g)})}>{s}</button>)}</div></div>)}</div></details>
   <div className="controlGroup notice">A price target is shown only when the session is valid, the latest regime is not a jump outlier, and walk-forward point plus probability skill both beat their naïve baselines.</div>
  </aside>

  <div className="marketMain">
   {error&&<div className="error"><b>Market source failed.</b> {error}. No substitute price was generated.</div>}
   <div className="card pad"><div className="assetHead"><div><p className="eyebrow">{meta.assetClass||selection.assetClass} · {meta.exchange||selection.exchange||selection.provider}</p><h2>{meta.name||selection.name||selection.symbol}</h2><div className="assetSub">{selection.symbol} · {meta.currency||''} · {data?.quality?.rows||0} clean observations · {date(data?.quality?.newest)}</div><div className="pillRow" style={{marginTop:9}}><button className="btn" onClick={toggleWatch}>{saved?'★ In watchlist':'☆ Add to watchlist'}</button><button className="btn" onClick={exportCsv} disabled={!data?.candles?.length}>Export CSV</button></div></div><div className="quote"><div className="quotePrice">{smart(displayPrice)}</div><div className={`quoteSub ${change>0?'positive':change<0?'negative':''}`}>{change==null?'Previous-close comparison unavailable':`${signedPct(change)} vs previous close`} · {date(streamTime||quote.time||data?.quality?.newest)}</div></div></div>
    <div className="grid3" style={{marginTop:18}}><div className="metric"><span>Market session</span><b>{data?.session?.state||'—'}</b><small>{data?.session?.transport||'source status pending'}</small></div><div className="metric"><span>Forecast status</span><b>{titleCase(forecastState)}</b><small>{f?.abstainReason||skillState}</small></div><div className="metric"><span>Data integrity</span><b>{integrityIssues===0?'CLEAN':`${integrityIssues} repaired`}</b><small>{integrity.duplicatesRemoved||0} duplicate · {integrity.invalidRowsRemoved||0} invalid · {integrity.outOfOrderPairs||0} order</small></div></div>
   </div>

   <div className="card chartPanel"><div className="chartToolbar"><div><b style={{fontSize:13}}>Observed market data</b><div className="muted" style={{fontSize:10,marginTop:2}}>{publishable?'Validated forecast overlay is enabled.':'Forecast overlay is withheld until publication gates pass.'} Drag to pan · wheel/pinch to zoom</div></div><SourceStatus provider={data?.provenance?.provider||selection.provider} state={data?'CONNECTED':'CHECKING'}/></div><div className="chartWrap"><InteractiveChart candles={data?.candles||[]} forecast={chartForecast} livePrice={displayPrice}/></div><div className="chartLegend"><span>Observed OHLC comes from the named provider. Numeric forecast paths appear only after the publication gates pass.</span><span>{data?.provenance?.provider||'Source pending'} · synthetic: false</span></div></div>

   <div className="forecastPanel">
    <div className="card forecastHero"><p className="eyebrow">Forecast decision</p>{f?.available?<>{publishable?<><div className="forecastCenter">{smart(f.center)}</div><div className="muted" style={{fontSize:12}}>{horizon} observations ahead · current {smart(f.current)} · center change {signedPct(f.center/f.current-1)}</div></>:<><div className="forecastCenter" style={{fontSize:28}}>TARGET WITHHELD</div><div className="muted" style={{fontSize:12}}>{f.abstainReason||'The forecast is research-only because production publication gates are not satisfied.'}</div></>}<div className="notice" style={{marginTop:12}}><b>{skillState}</b><div style={{marginTop:4,fontSize:11}}>Decision state: {titleCase(forecastState)} · model: {titleCase(f.modelStatus)}{f?.regime?.elevated?` · regime move ${pct(f.regime.absoluteMove)}`:''}</div></div><div className="rangeList">{[50,80,90].map(k=><div className="rangeRow" key={k}><span>{k}%</span><b>{f.ranges?.[k]?`${smart(f.ranges[k][0])} — ${smart(f.ranges[k][1])}`:'Withheld'}</b><small>{f.ranges?.[k]?'historical empirical uncertainty; not a point target':'insufficient dependence-adjusted evidence'}</small></div>)}</div></>:<div className="notice">{f?.reason||'Forecast unavailable for the current history.'}</div>}</div>
    <div className="card pad"><Score value={f?.evidenceScore} title="Evidence score" copy="Similarity evidence after concentration and temporal-dependence penalties."/><div className="divider"/><Score value={f?.calibrationScore} title="Calibration score" copy="Walk-forward error skill, probability skill and interval coverage. N/A means it was not measured."/><div className="divider"/><div className="grid2"><div className="metric"><span>P(above current)</span><b>{f?.available?pct(f?.direction?.up):'—'}</b></div><div className="metric"><span>P(below current)</span><b>{f?.available?pct(f?.direction?.down):'—'}</b></div><div className="metric"><span>Dependence-adjusted N</span><b>{num(f?.effectiveN,1)}</b></div><div className="metric"><span>Interactive validation</span><b>{v?.checks||'—'}</b><small>up to {data?.compute?.validationOriginsMax||36} origins</small></div></div></div>
   </div>


   <section className="card pad" id="accuracy-history" aria-label="Adaptive OHLCV forecast and accuracy history">
     <div className="sectionHead" style={{marginBottom:14}}>
       <div><p className="eyebrow">Automatic, source-only prequential evaluation</p><h2 style={{fontSize:24}}>Next observation · Forecast and accuracy history</h2></div>
       <span className="betaBadge">{data?.nextBar?.available?'HISTORICAL RECONSTRUCTION':'NOT AVAILABLE'}</span>
     </div>
     <p className="muted" style={{fontSize:12,marginBottom:15}}>Every historical forecast uses earlier completed candles only. Later observed candles score it, and earlier matured errors adjust subsequent forecasts automatically. These are reconstructed walk-forward tests, not archived predictions issued to users or a guarantee of future accuracy. No manual verification is required.</p>
     {data?.nextBar?.available?<>
       <div className="grid3" style={{marginBottom:14}}>
         <div className="metric"><span>Walk-forward checks</span><b>{data.nextBar.checks}</b><small>Last {data.nextBar.evaluationChecks} in error statistics</small></div>
         <div className="metric"><span>Next-close direction accuracy</span><b>{data.nextBar.closeDirectionAccuracy==null?'Not measured':pct(data.nextBar.closeDirectionAccuracy)}</b><small>{data.nextBar.directionChecks} scored nonzero-direction forecasts</small></div>
         <div className="metric"><span>Latest completed candle</span><b style={{fontSize:12}}>{date(data.nextBar.latestCompletedTime)}</b><small>{data?.compute?.excludedUnfinished?'Unfinished candle excluded':'Completed source observations only'}</small></div>
       </div>
       <div style={{overflowX:'auto'}}>
         <table className="table">
           <thead><tr><th>Variable</th><th>Next observation</th><th>Empirical 80% band</th><th>Historical MAE</th><th>Naive MAE</th><th>Skill vs naive</th><th>Adjustment</th></tr></thead>
           <tbody>{[['open','Next open'],['high','Next high'],['low','Next low'],['close','Next close'],['volume','Next traded volume']].map(([field,label])=>{
             const stats=data.nextBar.accuracy?.[field]||{},band=data.nextBar.empirical80?.[field],parameter=data.nextBar.parameters?.[field]||{};
             return <tr key={field}>
               <td><b>{label}</b>{field==='volume'?<div className="muted" style={{fontSize:10}}>Per completed candle, only where reported</div>:null}</td>
               <td><b>{smart(data.nextBar.forecast?.[field])}</b></td>
               <td>{Array.isArray(band)?band.map(smart).join(' – '):'Uncalibrated'}</td>
               <td>{stats.maePct==null?'—':stats.maePct.toFixed(2)+'%'}<div className="muted" style={{fontSize:10}}>n={stats.samples||0}</div></td>
               <td>{stats.baselineMaePct==null?'—':stats.baselineMaePct.toFixed(2)+'%'}</td>
               <td className={stats.skill>0?'positive':stats.skill<0?'negative':''}>{stats.skill==null?'—':pct(stats.skill)}</td>
               <td><b>{parameter.weight==null?'—':pct(parameter.weight,0)} analogue</b><div className="muted" style={{fontSize:10}}>{parameter.reason||'No calibration history'}</div></td>
             </tr>;
           })}</tbody>
         </table>
       </div>
       <div className="notice" style={{marginTop:12}}><b>Accuracy is measured, not asserted.</b> Positive skill means lower historical absolute log error than a no-change baseline on this evaluation window. Negative skill means worse. The model may fall back to that baseline; this does not guarantee future improvement. Missing volume or bands are not invented.</div>
       <details style={{marginTop:18}}>
         <summary style={{cursor:'pointer',fontWeight:700}}>Observed interval coverage and historical predictions</summary>
         <div className="grid5" style={{marginTop:13,marginBottom:13}}>
           {['open','high','low','close','volume'].map(field=>{
             const c=data.nextBar.intervalCoverage?.[field]||{};
             return <div className="metric" key={field}><span>{field.toUpperCase()} · nominal 80%</span><b>{c.observed==null?'Insufficient':pct(c.observed)}</b><small>{c.checks||0} matured band checks</small></div>;
           })}
         </div>
         <div style={{overflowX:'auto'}}>
           <table className="table">
             <thead><tr><th>Historical forecast origin</th><th>Observed next</th><th>Predicted O / H / L / C / volume</th><th>Observed O / H / L / C / volume</th><th>Close absolute error</th></tr></thead>
             <tbody>{(data.nextBar.history||[]).map((record,i)=><tr key={record.issuedAt+'-'+i}>
               <td>{date(record.issuedAt)}</td><td>{date(record.observedAt)}</td>
               <td>{['open','high','low','close','volume'].map(k=>smart(record.predicted?.[k])).join(' / ')}</td>
               <td>{['open','high','low','close','volume'].map(k=>smart(record.observed?.[k])).join(' / ')}</td>
               <td>{record.absErrorPct?.close==null?'—':record.absErrorPct.close.toFixed(2)+'%'}</td>
             </tr>)}</tbody>
           </table>
         </div>
         <p className="muted" style={{fontSize:11,marginTop:9}}>These rows are reproducibly reconstructed from source history. They are not an immutable as-issued live prediction ledger. Results vary by symbol, timeframe and market regime.</p>
       </details>
     </>:<div className="notice">{data?.nextBar?.reason||'No eligible completed source OHLCV history. Live accuracy has not been measured.'}</div>}
   </section>
   {publishable&&forecastPoints.length?<div className="card pad"><div className="sectionHead" style={{marginBottom:8}}><div><p className="eyebrow">Validated forward path</p><h2 style={{fontSize:25}}>Published checkpoints</h2></div><p>{f?.timePolicy||'Indexed by future market observations.'}</p></div><div style={{overflow:'auto'}}><table className="pointTable"><thead><tr><th>Checkpoint</th><th>Point</th><th>Change</th><th>P(up)</th><th>50% interval</th><th>80% interval</th><th>90% interval</th></tr></thead><tbody>{forecastPoints.map((p,i)=><tr key={`${p.bar}:${i}`}><td>{p.time?date(p.time):p.observationLabel||`+${p.bar} observations`}</td><td><b>{smart(p.price)}</b></td><td className={p.change>=0?'positive':'negative'}>{signedPct(p.change)}</td><td>{pct(p.pUp)}</td><td>{p.ranges?.[50]?`${smart(p.ranges[50][0])}–${smart(p.ranges[50][1])}`:'—'}</td><td>{p.ranges?.[80]?`${smart(p.ranges[80][0])}–${smart(p.ranges[80][1])}`:'—'}</td><td>{p.ranges?.[90]?`${smart(p.ranges[90][0])}–${smart(p.ranges[90][1])}`:'—'}</td></tr>)}</tbody></table></div></div>:null}

   <details className="card pad"><summary style={{cursor:'pointer',fontWeight:700}}>Validation and model diagnostics</summary><div style={{marginTop:16}}>{v?.available?<><div className="grid5"><div className="metric"><span>Walk-forward checks</span><b>{v.checks}</b><small>minimum gap {v.originGapMin} bars</small></div><div className="metric"><span>MASE vs no-change</span><b>{metric(v.maseNoChange,3)}</b><small>&lt;1 beats unchanged-price</small></div><div className="metric"><span>Error skill</span><b className={v.skillVsNoChange>0?'positive':'negative'}>{pct(v.skillVsNoChange)}</b><small>positive is better</small></div><div className="metric"><span>Brier skill</span><b className={v.brierSkillVs50>0?'positive':'negative'}>{pct(v.brierSkillVs50)}</b><small>vs 50/50 probability</small></div><div className="metric"><span>Direction accuracy</span><b>{pct(v.directionAccuracy)}</b><small>momentum {pct(v.momentumDirectionAccuracy)}</small></div></div><div className="grid3" style={{marginTop:12}}>{[50,80,90].map(k=><div className="metric" key={k}><span>{k}% interval coverage</span><b>{pct(v.coverage?.[k])}</b><small>mean width {pct(v.intervalMeanWidthPct?.[k])}</small></div>)}</div></>:<div className="notice">{v?.reason||'Not enough clean history for non-overlapping validation.'}</div>}</div></details>

   <details className="card pad"><summary style={{cursor:'pointer',fontWeight:700}}>Technical context</summary><div className="grid5" style={{marginTop:16}}><div className="metric"><span>RSI 14</span><b>{num(ind?.rsi14,1)}</b><small>50 is neutral</small></div><div className="metric"><span>ATR / price</span><b>{pct(ind?.atrPct,2)}</b><small>Recent range scale</small></div><div className="metric"><span>20-observation vol</span><b>{pct(ind?.realizedVol20,2)}</b><small>Log-return dispersion</small></div><div className="metric"><span>252-observation position</span><b>{pct(ind?.position52,0)}</b><small>Available rolling range</small></div><div className="metric"><span>Freshness</span><b>{data?.quality?.freshnessScore??'—'}</b><small>{titleCase(data?.quality?.freshnessStatus)}</small></div></div></details>

   {m&&<details className="card pad"><summary style={{cursor:'pointer',fontWeight:700}}>Exchange microstructure</summary><div className="grid5" style={{marginTop:16}}><div className="metric"><span>Book imbalance</span><b>{metric(m.bookImbalance,3)}</b></div><div className="metric"><span>Trade imbalance</span><b>{metric(m.tradeImbalance,3)}</b></div><div className="metric"><span>Spread</span><b>{metric(m.spreadBps,2)} bps</b></div><div className="metric"><span>Best bid</span><b>{smart(m.bestBid)}</b></div><div className="metric"><span>Best ask</span><b>{smart(m.bestAsk)}</b></div></div></details>}

   {canOptions&&<details className="card pad"><summary style={{cursor:'pointer',fontWeight:700}}>Options evidence</summary><div style={{marginTop:16}}><div className="sectionHead"><p>Best-effort published chain. Loaded only on demand.</p><button className="btn" onClick={loadOptions} disabled={optionsLoading}>{optionsLoading?'Loading…':'Load options'}</button></div>{options?.state==='DEGRADED'?<div className="notice">{options.message||'Public options feed unavailable. No synthetic contracts were inserted.'}</div>:optionsNear.length?<div style={{overflow:'auto'}}><table className="table"><thead><tr><th>Type</th><th>Strike</th><th>Bid</th><th>Ask</th><th>IV</th><th>Volume</th><th>OI</th></tr></thead><tbody>{optionsNear.map((o,i)=><tr key={`${o.contractSymbol}:${i}`}><td>{o.type}</td><td>{smart(o.strike)}</td><td>{smart(o.bid)}</td><td>{smart(o.ask)}</td><td>{pct(o.impliedVolatility)}</td><td>{o.volume||0}</td><td>{o.openInterest||0}</td></tr>)}</tbody></table></div>:<div className="notice">No chain loaded yet.</div>}</div></details>}
  </div>
 </div>
}
