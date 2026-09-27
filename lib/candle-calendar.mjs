// Market-observation chronology. A calendar gap is not automatically a missing trade.
// Never manufacture a zero-volume or synthetic candle to "complete" a series.
export const INTERVAL_SECONDS=Object.freeze({
  '1m':60,'2m':120,'5m':300,'15m':900,'30m':1800,
  '1h':3600,'60m':3600,'6h':21600,'1d':86400,'1wk':604800,
});
const DAY=86400;
const num=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
function localDay(sec,timezone){
 const d=new Date(sec*1000);
 try {
  return new Intl.DateTimeFormat('en-CA',{timeZone:timezone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
 } catch {return d.toISOString().slice(0,10);}
}
export function classifyGap(prev,next,{provider='',interval='1d',timezone='UTC'}={}){
 const from=num(prev?.time),to=num(next?.time),step=INTERVAL_SECONDS[interval]??null;
 if(from==null||to==null||to<=from||step==null)
  return {kind:'unknown',seconds:null,missing:0,label:'Timing unverified'};
 const delta=to-from;
 if(delta===step)return {kind:'adjacent',seconds:delta,missing:0,label:'Next scheduled observation'};
 const continuous=provider==='coinbase';
 if(continuous){
  const missing=delta%step===0?Math.max(0,Math.round(delta/step)-1):null;
  return {kind:'missing',seconds:delta,missing,
   label:missing===null?'Irregular publisher timestamp':
     missing+' unobserved interval'+(missing===1?'':'s')+' · no prices inferred'};
 }
 const differentDay=localDay(from,timezone)!==localDay(to,timezone);
 if(provider==='yahoo'&&differentDay)
  return {kind:'session-boundary',seconds:delta,missing:null,
   label:'Trading-session boundary / closure; published days only'};
 if(provider==='amfi'||provider==='ecb')
  return {kind:'publication-boundary',seconds:delta,missing:null,
   label:'Reference publication spacing; no intraday candles'};
 return {kind:'unverified',seconds:delta,missing:null,
  label:'Unexpected spacing; source or exchange calendar verification required'};
}
export function auditSpacing(candles=[],context={}){
 const counts={adjacent:0,missing:0,'session-boundary':0,
  'publication-boundary':0,unverified:0,unknown:0};
 const missingSlots=[];
 let previous=null;
 for(const candle of candles){
  if(previous){
   const detail=classifyGap(previous,candle,context);
   counts[detail.kind]=(counts[detail.kind]??0)+1;
   if(detail.kind==='missing')missingSlots.push({after:previous.time,before:candle.time,missing:detail.missing});
  }
  previous=candle;
 }
 return {counts,missingSlots:missingSlots.slice(-60),totalObserved:candles.length,
  firstObserved:candles[0]?.time??null,lastObserved:candles.at(-1)?.time??null,
  method:'Observed published timestamps only; exchange closures and missing crypto intervals are separately identified.'};
}
