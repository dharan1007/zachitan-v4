'use client';
import {useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';

const nav=[
 ['Overview','/','◌'],
 ['Markets','/markets','⌁'],
 ['World','/world','◎'],
 ['News + filings','/news','▤'],
 ['Watchlist','/watchlist','☆'],
 ['Playground','/playground','◇'],
 ['Methodology','/methodology','∿'],
 ['Profile','/profile','○']
];

export default function Shell({children}){
 const pathname=usePathname()||'/';
 const [health,setHealth]=useState('checking');
 useEffect(()=>{
  let live=true;
  fetch('/api/data?action=health',{cache:'no-store'})
   .then(r=>r.json())
   .then(d=>{if(live)setHealth(d.ok?'ok':'bad')})
   .catch(()=>{if(live)setHealth('bad')});
  return()=>{live=false};
 },[]);
 const active=h=>h==='/'?pathname==='/' : pathname===h||pathname.startsWith(`${h}/`);
 return <div className="app">
   <aside className="sidebar">
    <a className="logo logoLink" href="/" aria-label="Zachitan overview"><div className="logoMark">Z</div><span>Zachitan</span><span className="beta">V4 BETA</span></a>
    <nav className="nav" aria-label="Primary navigation">
     {nav.map(([n,h,g])=><a href={h} key={h} className={active(h)?'active':''} aria-current={active(h)?'page':undefined}><span className="navGlyph">{g}</span><span>{n}</span><span className="navArrow">›</span></a>)}
    </nav>
    <div className="sideFoot">Research beta. No trade execution. No guaranteed outcome. Source timing and rights are shown per feed.</div>
   </aside>
   <main className="main">
    <header className="top"><div><p className="topKicker">Research workspace</p><h1>Zachitan Research Terminal</h1></div><div className="status"><span className={`statusDot ${health==='ok'?'ok':health==='bad'?'badDot':''}`}></span>{health==='ok'?'Core online':health==='bad'?'Core degraded':'Checking core'}</div></header>
    {children}
   </main>
 </div>
}
