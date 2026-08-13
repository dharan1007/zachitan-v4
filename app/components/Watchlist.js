'use client';
import {useEffect,useState} from 'react';
import AssetSearch from './AssetSearch';
import {smart,signedPct} from './Format';

function read(){try{return JSON.parse(localStorage.getItem('zachitan.watchlist.v4')||'[]')}catch{return[]}}
export default function Watchlist(){
 const [items,setItems]=useState([]),[snap,setSnap]=useState({}),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[lastRefresh,setLastRefresh]=useState(null);
 useEffect(()=>{setItems(read())},[]);
 const save=a=>{setItems(a);localStorage.setItem('zachitan.watchlist.v4',JSON.stringify(a));window.dispatchEvent(new Event('zachitan-watchlist'))};
 const add=x=>{if(items.some(i=>i.symbol===x.symbol&&i.provider===x.provider))return;save([{symbol:x.symbol,name:x.name||x.symbol,provider:x.provider,assetClass:x.assetClass||'market',exchange:x.exchange||''},...items].slice(0,40));setQuery('')};
 const remove=x=>save(items.filter(i=>!(i.symbol===x.symbol&&i.provider===x.provider)));
 const refresh=async()=>{
  setBusy(true);const next={};
  await Promise.all(items.slice(0,20).map(async x=>{try{const u=new URLSearchParams({action:'market',provider:x.provider,symbol:x.symbol,interval:'1d',range:'1y',horizon:'5'}),r=await fetch(`/api/data?${u}`),d=await r.json();if(d.ok){const px=d.quote?.price??d.candles?.at(-1)?.close,prev=d.quote?.previousClose??d.candles?.at(-2)?.close;next[`${x.provider}:${x.symbol}`]={price:px,change:px&&prev?px/prev-1:null,evidence:d.forecast?.evidenceScore,center:d.forecast?.center,source:d.provenance?.provider,timing:d.provenance?.cadence||d.quality?.timing}}}catch{}}));
  setSnap(next);setLastRefresh(new Date());setBusy(false)
 };
 const exportList=()=>{const blob=new Blob([JSON.stringify(items,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='zachitan-watchlist.json';a.click();URL.revokeObjectURL(a.href)};
 return <div>
  <div className="grid2 watchTop">
   <div className="card pad searchCard"><p className="eyebrow">Add instrument</p><h3 className="panelTitle">Build a cross-asset research list.</h3><p className="bodycopy compactCopy">Suggestions now appear as soon as the field is focused and refine while you type.</p><AssetSearch value={query} onChange={setQuery} onSelect={add} placeholder="Apple, NIFTY 50, USDINR, gold, Bitcoin, fund…" label="Add an instrument to watchlist" help="Focus for suggestions"/></div>
   <div className="card pad"><p className="eyebrow">Local-first beta</p><h3 className="panelTitle">Saved here, not silently synced.</h3><p className="bodycopy compactCopy">The public beta stores this list in your browser. Refresh snapshots when you want a comparable daily view, or open an instrument for its full chart and forecast controls.</p><div className="pillRow"><button className="btn primary" onClick={refresh} disabled={!items.length||busy}>{busy?'Refreshing…':'Refresh snapshots'}</button><button className="btn" onClick={exportList} disabled={!items.length}>Export JSON</button></div>{lastRefresh&&<p className="subtleLine">Last snapshot refresh {lastRefresh.toLocaleTimeString()} · {Object.keys(snap).length} instruments returned.</p>}</div>
  </div>
  <section className="section"><div className="sectionHead"><div><p className="eyebrow">Watchlist</p><h2>{items.length} saved instrument{items.length===1?'':'s'}</h2></div><p>Price, daily change, source and evidence are shown together. No placeholder quote is created when a provider fails.</p></div>
   <div className="card pad watchTable">{items.length?items.map(x=>{const k=`${x.provider}:${x.symbol}`,s=snap[k],href=`/markets?symbol=${encodeURIComponent(x.symbol)}&provider=${encodeURIComponent(x.provider)}&name=${encodeURIComponent(x.name||x.symbol)}&assetClass=${encodeURIComponent(x.assetClass||'market')}`;return <div className="watchRow" key={k}><div className="watchIdentity"><b>{x.symbol}</b><span>{x.name}</span><small>{x.assetClass?.replaceAll('_',' ')} · {x.exchange||x.provider}</small></div><div className="watchSnapshot"><b>{smart(s?.price)}</b><small className={s?.change>=0?'positive':'negative'}>{s?`${signedPct(s.change)} · evidence ${s.evidence??'—'}`:'Refresh to load snapshot'}</small>{s?.timing&&<small>{s.timing}</small>}</div><div className="pillRow"><a className="btn" href={href}>Open</a><button className="btn danger" onClick={()=>remove(x)}>Remove</button></div></div>}):<div className="emptyState"><div className="emptyGlyph">☆</div><h3>No instruments saved yet</h3><p>Focus the search box above to see supported examples, then type any ticker or instrument name to search across stocks, ETFs, indices, futures, FX, crypto and supported funds.</p></div>}</div>
  </section>
 </div>
}
