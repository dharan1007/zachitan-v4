'use client';
import {useEffect,useMemo,useRef,useState} from 'react';

const cache=new Map();
const prettyClass=x=>String(x||'market').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

export default function AssetSearch({value,onChange,onSelect,placeholder='Search instrument…',filter,maxResults=18,label='Search',help='Type a symbol or name',autoFocus=false}){
 const [results,setResults]=useState([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[active,setActive]=useState(-1);
 const wrap=useRef(null),requestId=useRef(0);
 const visible=useMemo(()=>{
  const rows=filter?results.filter(filter):results;
  return rows.slice(0,maxResults);
 },[results,filter,maxResults]);

 useEffect(()=>{
  const q=String(value||'').trim();
  if(!open)return;
  const id=++requestId.current;
  const key=q.toLowerCase();
  if(cache.has(key)){
   setResults(cache.get(key));
   setActive(cache.get(key)?.length?0:-1);
   setLoading(false);
   setError('');
   return;
  }
  const ctrl=new AbortController();
  const t=setTimeout(async()=>{
   setLoading(true);setError('');
   try{
    const r=await fetch(`/api/data?action=search&q=${encodeURIComponent(q)}`,{signal:ctrl.signal});
    const d=await r.json();
    if(!r.ok||!d.ok)throw new Error(d.error||`Search ${r.status}`);
    if(id!==requestId.current)return;
    const rows=Array.isArray(d.results)?d.results:[];
    cache.set(key,rows);
    setResults(rows);
    setActive(rows.length?0:-1);
   }catch(e){
    if(e?.name!=='AbortError'&&id===requestId.current){setError(e?.message||'Search unavailable');setResults([])}
   }finally{if(id===requestId.current)setLoading(false)}
  },q?120:0);
  return()=>{clearTimeout(t);ctrl.abort()};
 },[value,open]);

 useEffect(()=>{
  const close=e=>{if(wrap.current&&!wrap.current.contains(e.target))setOpen(false)};
  document.addEventListener('pointerdown',close);
  return()=>document.removeEventListener('pointerdown',close);
 },[]);

 const choose=x=>{onSelect?.(x);setOpen(false);setActive(-1)};
 const keyDown=e=>{
  if(e.key==='Escape'){setOpen(false);setActive(-1);return}
  if(!open&&(e.key==='ArrowDown'||e.key==='ArrowUp')){setOpen(true);return}
  if(!visible.length)return;
  if(e.key==='ArrowDown'){e.preventDefault();setActive(v=>Math.min(visible.length-1,v+1))}
  else if(e.key==='ArrowUp'){e.preventDefault();setActive(v=>Math.max(0,v-1))}
  else if(e.key==='Enter'&&open){e.preventDefault();choose(visible[Math.max(0,active)]||visible[0])}
 };
 return <div className="assetSearch" ref={wrap}>
  <div className="searchInputShell">
   <span className="searchIcon" aria-hidden="true">⌕</span>
   <input className="input searchInput" value={value} onChange={e=>{onChange?.(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} onKeyDown={keyDown} placeholder={placeholder} autoFocus={autoFocus} autoComplete="off" spellCheck="false" aria-label={label} aria-expanded={open} aria-autocomplete="list" />
   {loading?<span className="searchState">Searching…</span>:value?<button className="searchClear" type="button" onClick={()=>{onChange?.('');setOpen(true)}} aria-label="Clear search">×</button>:<span className="searchState">{help}</span>}
  </div>
  {open&&<div className="suggest" role="listbox">
   <div className="suggestHead"><span>{value?.trim()?'Matches':'Suggested instruments'}</span><span>{loading?'Live search':''}</span></div>
   {error&&<div className="suggestMessage bad">{error}</div>}
   {!loading&&!error&&visible.length===0&&<div className="suggestMessage">No supported matches. Try a ticker, company, fund, index, future, FX pair or crypto symbol.</div>}
   {visible.map((x,i)=><button type="button" role="option" aria-selected={i===active} className={i===active?'active':''} key={`${x.provider}:${x.symbol}:${i}`} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(x)} onMouseEnter={()=>setActive(i)}>
    <span className="suggestMain"><strong>{x.symbol}</strong><small>{x.name||x.symbol}</small></span>
    <span className="suggestMeta"><b>{prettyClass(x.assetClass)}</b><small>{x.exchange||x.provider}</small></span>
   </button>)}
  </div>}
 </div>
}
