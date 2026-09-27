'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {smart} from './Format';
import {computeChartIndicators,CHART_OVERLAYS} from '@/lib/chart-indicators.mjs';

const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const valid=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));
const PADDING={l:20,r:112,t:22,b:44};
function timeLabel(sec,span){
 const d=new Date(sec*1000);
 return span<3*86400?d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString([],{month:'short',day:'numeric'});
}

export default function InteractiveChart({candles=[],forecast=null,livePrice=null}){
 const canvasRef=useRef(null),hostRef=useRef(null),dragRef=useRef(null),totalRef=useRef(0);
 const [size,setSize]=useState({w:800,h:510});
 const [view,setView]=useState({end:null,count:125});
 const [cross,setCross]=useState(null);
 const [selectedIndicators,setSelectedIndicators]=useState([]);
 // The live quote is never substituted into a completed historical OHLC candle.
 const series=useMemo(()=>candles.filter(row=>
  [row.time,row.open,row.high,row.low,row.close].every(valid)&&row.time>0&&row.low>0&&
  row.low<=Math.min(row.open,row.close)&&row.high>=Math.max(row.open,row.close)
 ).map(row=>({...row,time:Number(row.time),open:Number(row.open),high:Number(row.high),
  low:Number(row.low),close:Number(row.close)})),[candles]);
 const indicatorSeries=useMemo(()=>computeChartIndicators(series),[series]);
 const points=useMemo(()=>forecast?.available?(forecast.points||[]).filter(p=>
  valid(p.price)&&Number(p.price)>0&&Number.isFinite(Number(p.bar))&&Number(p.bar)>0
 ):[],[forecast]);
 const maxFuture=points.length?Math.max(...points.map(p=>Number(p.bar))):0;
 const totalMax=Math.max(0,series.length-1+maxFuture);
 const currentLive=valid(livePrice)&&Number(livePrice)>0?Number(livePrice):null;

 // Follow new observations only if the user was already looking at the latest bar.
 // Do not reset zoom/pan on WebSocket price ticks, price revisions, or every fetch.
 useEffect(()=>{
  setView(previous=>{
   const previousTotal=totalRef.current;
   const follow=previous.end===null||previous.end>=previousTotal-1;
   totalRef.current=totalMax;
   return {...previous,end:follow?totalMax:clamp(previous.end,0,totalMax)};
  });
 },[totalMax]);

 useEffect(()=>{
  const host=hostRef.current;
  if(!host)return;
  const measure=()=>{
   const r=host.getBoundingClientRect();
   setSize(old=>{
    const w=Math.max(240,Math.floor(r.width)),h=Math.max(290,Math.floor(r.height));
    return old.w===w&&old.h===h?old:{w,h};
   });
  };
  measure();
  const ro=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
  if(ro)ro.observe(host);
  else window.addEventListener('resize',measure);
  return()=>{ro?.disconnect();if(!ro)window.removeEventListener('resize',measure)};
 },[]);

 const geom=useMemo(()=>{
  const w=size.w,h=size.h,pad=PADDING;
  const plotW=Math.max(100,w-pad.l-pad.r),plotH=Math.max(100,h-pad.t-pad.b);
  const capacity=Math.max(1,series.length+maxFuture);
  const count=clamp(view.count||125,Math.min(18,capacity),Math.max(18,capacity));
  const end=clamp(view.end??totalMax,0,totalMax);
  const start=Math.max(0,end-count+1);
  const visC=[];
  for(let i=Math.max(0,Math.floor(start));i<series.length&&i<=end;i++)visC.push({row:series[i],i});
  const visP=points.map(p=>({p,i:series.length-1+Number(p.bar)})).filter(z=>z.i>=start&&z.i<=end);
  const ys=[];
  for(const z of visC)ys.push(z.row.low,z.row.high);
  for(const id of selectedIndicators){const values=indicatorSeries[id];if(Array.isArray(values))for(const z of visC)if(valid(values[z.i]))ys.push(Number(values[z.i]));}
  for(const z of visP){ys.push(Number(z.p.price));for(const k of [50,80,90])if(Array.isArray(z.p.ranges?.[k]))ys.push(...z.p.ranges[k].filter(valid).map(Number))}
  // Separate quote marker from source candles without allowing an extreme ticker
  // to distort the entire historical scale.
  if(!ys.length)ys.push(0,1);
  let min=Math.min(...ys),max=Math.max(...ys);
  let span=max-min||Math.abs(max)*.001||1;
  min-=span*.08;max+=span*.08;span=max-min;
  const X=i=>pad.l+(i-start+.5)/count*plotW;
  const Y=value=>pad.t+(max-value)/span*plotH;
  return {w,h,pad,plotW,plotH,start,end,count,min,max,span,X,Y,visC,visP};
 },[size,view,series,points,maxFuture,totalMax,indicatorSeries,selectedIndicators]);

 const nearest=useCallback(x=>{
  if(!series.length)return null;
  const idx=clamp(Math.floor(geom.start+(x-geom.pad.l)/geom.plotW*geom.count),0,totalMax);
  if(idx<series.length)return {kind:'observed',row:series[idx],idx};
  const p=points.reduce((best,p)=>!best||Math.abs(series.length-1+p.bar-idx)<Math.abs(series.length-1+best.bar-idx)?p:best,null);
  return p?{kind:'forecast',row:p,idx:series.length-1+p.bar}:null;
 },[geom,series,points,totalMax]);

 const draw=useCallback(()=>{
  const canvas=canvasRef.current,ctx=canvas?.getContext('2d');
  if(!ctx)return;
  const g=geom,dpr=Math.min(2,window.devicePixelRatio||1);
  const targetW=Math.floor(g.w*dpr),targetH=Math.floor(g.h*dpr);
  if(canvas.width!==targetW||canvas.height!==targetH){canvas.width=targetW;canvas.height=targetH}
  canvas.style.width=g.w+'px';canvas.style.height=g.h+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,g.w,g.h);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,g.w,g.h);
  ctx.font='13px system-ui,sans-serif';ctx.textBaseline='middle';
  for(let k=0;k<=5;k++){
   const y=g.pad.t+k*g.plotH/5,value=g.max-k*g.span/5;
   ctx.strokeStyle='#ebeee9';ctx.lineWidth=1;ctx.beginPath();
   ctx.moveTo(g.pad.l,y);ctx.lineTo(g.w-g.pad.r,y);ctx.stroke();
   ctx.fillStyle='#59616b';ctx.textAlign='left';ctx.fillText(smart(value),g.w-g.pad.r+6,y);
  }
  if(g.visC.length>0){
   const first=g.visC[0].row.time,last=g.visC.at(-1).row.time,span=last-first;
   ctx.textAlign='center';ctx.fillStyle='#59616b';
   for(let k=0;k<=5;k++){
    const index=Math.round(g.start+(g.count-1)*k/5);
    const row=series[index];const forecastPoint=g.visP.find(z=>z.i===index)?.p;
    const time=row?.time??forecastPoint?.time;
    if(valid(time))ctx.fillText(timeLabel(time,span),clamp(g.X(index),40,g.w-40),g.h-13);
   }
  }
  if(g.visP.length>1){
   const envelope=g.visP.filter(z=>Array.isArray(z.p.ranges?.[80])&&z.p.ranges[80].every(valid));
   if(envelope.length>1){
    ctx.beginPath();
    envelope.forEach((z,i)=>i?ctx.lineTo(g.X(z.i),g.Y(z.p.ranges[80][1])):ctx.moveTo(g.X(z.i),g.Y(z.p.ranges[80][1])));
    [...envelope].reverse().forEach(z=>ctx.lineTo(g.X(z.i),g.Y(z.p.ranges[80][0])));
    ctx.closePath();ctx.fillStyle='rgba(46,96,200,.09)';ctx.fill();
   }
  }
  // Overlays use precisely the same completed-candle indices as the price chart.
  // Missing periods are left blank; no interpolated values are manufactured.
  for(const overlay of CHART_OVERLAYS){
   if(!selectedIndicators.includes(overlay.id))continue;
   const values=indicatorSeries[overlay.id];
   if(!Array.isArray(values))continue;
   ctx.save();ctx.strokeStyle=overlay.color;ctx.lineWidth=1.9;ctx.beginPath();
   let active=false;
   for(const {i} of g.visC){
    const v=values[i];
    if(!valid(v)){active=false;continue;}
    if(!active){ctx.moveTo(g.X(i),g.Y(Number(v)));active=true;}
    else ctx.lineTo(g.X(i),g.Y(Number(v)));
   }
   ctx.stroke();ctx.restore();
  }
  const candleWidth=clamp(g.plotW/g.count*.62,1.5,13);
  for(const {row,i} of g.visC){
   const x=g.X(i),positive=row.close>=row.open;
   ctx.strokeStyle=positive?'#147d58':'#cb4a45';
   ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1;
   ctx.beginPath();ctx.moveTo(x,g.Y(row.high));ctx.lineTo(x,g.Y(row.low));ctx.stroke();
   const top=g.Y(Math.max(row.open,row.close)),bottom=g.Y(Math.min(row.open,row.close));
   ctx.fillRect(x-candleWidth/2,top,candleWidth,Math.max(1,bottom-top));
  }
  if(g.visP.length){
   ctx.save();ctx.strokeStyle='#2860d2';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();
   const anchor=series.length-1;
   const visibleAnchor=series.length&&anchor>=g.start&&anchor<=g.end;
   if(visibleAnchor)ctx.moveTo(g.X(anchor),g.Y(series.at(-1).close));
   g.visP.forEach((z,i)=>i||visibleAnchor?ctx.lineTo(g.X(z.i),g.Y(z.p.price)):ctx.moveTo(g.X(z.i),g.Y(z.p.price)));
   ctx.stroke();ctx.restore();
   for(const z of g.visP){
    ctx.fillStyle='#2860d2';ctx.beginPath();ctx.arc(g.X(z.i),g.Y(z.p.price),3,0,Math.PI*2);ctx.fill();
   }
  }
  // The current ticker is an independent, labelled quote line, never an
  // invented OHLC update and never a historical training observation.
  if(currentLive!==null&&currentLive>=g.min&&currentLive<=g.max){
   const y=g.Y(currentLive);ctx.save();ctx.strokeStyle='#ab6f14';ctx.lineWidth=1;
   ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(g.pad.l,y);ctx.lineTo(g.w-g.pad.r,y);ctx.stroke();ctx.restore();
   ctx.fillStyle='#fef1d4';ctx.fillRect(g.w-g.pad.r,y-10,g.pad.r,20);
   ctx.fillStyle='#725016';ctx.textAlign='left';ctx.font='12px system-ui';
   ctx.fillText(smart(currentLive),g.w-g.pad.r+6,y);
  }
  if(cross&&cross.x>=g.pad.l&&cross.x<=g.w-g.pad.r&&cross.y>=g.pad.t&&cross.y<=g.h-g.pad.b){
   ctx.save();ctx.setLineDash([3,4]);ctx.strokeStyle='#8b939e';ctx.lineWidth=1;
   ctx.beginPath();ctx.moveTo(cross.x,g.pad.t);ctx.lineTo(cross.x,g.h-g.pad.b);
   ctx.moveTo(g.pad.l,cross.y);ctx.lineTo(g.w-g.pad.r,cross.y);ctx.stroke();ctx.restore();
  }
 },[geom,series,currentLive,cross,indicatorSeries,selectedIndicators]);

 useEffect(()=>{
  let frame=requestAnimationFrame(draw);
  return()=>cancelAnimationFrame(frame);
 },[draw]);

 const zoom=useCallback(direction=>{
  const capacity=Math.max(1,series.length+maxFuture);
  setView(v=>{
   const minCount=Math.min(18,capacity),maxCount=Math.max(18,capacity);
   const next=clamp(Math.round(v.count*(direction>0?1.15:.85)),minCount,maxCount);
   return {...v,count:next,end:clamp(v.end??totalMax,Math.min(next-1,totalMax),totalMax)};
  });
 },[series.length,maxFuture,totalMax]);

 // Explicit passive:false fixes the React delegated onWheel/preventDefault
 // warning while preserving intentional chart zoom without page-scroll conflict.
 const zoomRef=useRef(zoom);
 useEffect(()=>{zoomRef.current=zoom},[zoom]);
 useEffect(()=>{
  const node=canvasRef.current;
  if(!node)return;
  const onWheel=e=>{
   if(!e.cancelable)return;
   e.preventDefault();
   zoomRef.current(e.deltaY>0?1:-1);
  };
  node.addEventListener('wheel',onWheel,{passive:false});
  return()=>node.removeEventListener('wheel',onWheel);
 },[]);

 const onPointerDown=e=>{
  if(e.pointerType==='touch')return;
  const rect=e.currentTarget.getBoundingClientRect();
  dragRef.current={pointerId:e.pointerId,x:e.clientX-rect.left,end:view.end??totalMax};
  e.currentTarget.setPointerCapture?.(e.pointerId);
 };
 const onPointerMove=e=>{
  const rect=e.currentTarget.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
  if(dragRef.current){
   const drag=dragRef.current;
   const bars=Math.round(-(x-drag.x)/(geom.plotW/geom.count));
   const minEnd=Math.min(Math.max(0,geom.count-1),totalMax);
   setView(v=>({...v,end:clamp(drag.end+bars,minEnd,totalMax)}));
   return;
  }
  setCross({x,y,near:nearest(x)});
 };
 const stopDrag=e=>{
  if(dragRef.current&&e.currentTarget.hasPointerCapture?.(dragRef.current.pointerId)){
   e.currentTarget.releasePointerCapture?.(dragRef.current.pointerId);
  }
  dragRef.current=null;
 };
 const fit=()=>setView({count:Math.max(1,series.length+maxFuture),end:totalMax});
 const latest=()=>setView(v=>({...v,end:totalMax}));
 const tooltip=cross?.near;
 const inspected=tooltip?.kind==='observed'?tooltip.row:series.at(-1);
 return <div ref={hostRef} style={{height:'100%',width:'100%',minWidth:0,position:'relative',userSelect:'none'}}>
  <canvas ref={canvasRef} aria-label="Historical candlestick chart, independently labelled live quote and validated forecast"
   style={{display:'block',width:'100%',height:'100%',touchAction:'pan-y',cursor:'crosshair'}}
   onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDrag}
   onPointerCancel={stopDrag} onPointerLeave={()=>{if(!dragRef.current)setCross(null)}}/>
  <div className="chartIndicatorMenu">
   <details><summary className="btn">Indicators ({selectedIndicators.length})</summary>
    <div className="indicatorMenuList">
     <p>Choose overlays. They use published completed candles only.</p>
     {CHART_OVERLAYS.map(option=><label key={option.id}><input type="checkbox" disabled={!indicatorSeries[option.id]?.some(valid)} checked={selectedIndicators.includes(option.id)}
      onChange={e=>{const checked=e.currentTarget.checked;setSelectedIndicators(old=>checked?[...old.filter(x=>x!==option.id),option.id]:old.filter(x=>x!==option.id));}}/>
      <span style={{display:'inline-block',width:13,height:3,background:option.color}}/>{option.label}{!indicatorSeries[option.id]?.some(valid)?' · expand history to enable':''}</label>)}
    </div>
   </details>
  </div>
  {(tooltip||inspected)&&<div className="marketChartReadout">
   {tooltip?.kind!=='forecast'?<>
    <b>{tooltip?'Observed':'Latest completed bar'} · {new Date(inspected.time*1000).toLocaleString()}</b>
    <div className="chartOHLC">
     <span>Open <strong>{smart(inspected.open)}</strong></span>
     <span>High <strong>{smart(inspected.high)}</strong></span>
     <span>Low <strong>{smart(inspected.low)}</strong></span>
     <span>Close <strong>{smart(inspected.close)}</strong></span>
     <span>Traded volume <strong>{smart(inspected.volume)}</strong></span>
    </div>
   </>:<><b>Forecast checkpoint</b><div>Projected price {smart(tooltip.row.price)} · Probability of rising {valid(tooltip.row.pUp)?Math.round(tooltip.row.pUp*100)+'%':'unavailable'}</div></>}
  </div>}
  <div style={{position:'absolute',right:10,top:9,zIndex:4,display:'flex',gap:5}}>
   <button type="button" className="btn" onClick={()=>zoom(-1)} aria-label="Zoom in chart">+</button>
   <button type="button" className="btn" onClick={()=>zoom(1)} aria-label="Zoom out chart">−</button>
   <button type="button" className="btn" onClick={fit}>Fit</button>
   <button type="button" className="btn" onClick={latest}>Latest</button>
  </div>
  <div style={{position:'absolute',left:12,bottom:32,fontSize:10,color:'#5e6773',pointerEvents:'none'}}>
   Published candles · quote separate · indicators use past data · drag to pan · wheel to zoom
  </div>
 </div>;
}
