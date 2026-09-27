// Exchange-local completed-period detection for Yahoo daily/weekly history.
// A time-stamped current-session bar is not a settled daily/weekly OHLC.
function dateParts(epochSeconds,timezone) {
 if(!Number.isFinite(epochSeconds)||!Number.isFinite(new Date(epochSeconds*1000).getTime()))return null;
 try{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(epochSeconds*1000));
  const n=Object.fromEntries(parts.filter(x=>['year','month','day'].includes(x.type)).map(x=>[x.type,Number(x.value)]));
  return Number.isInteger(n.year)&&Number.isInteger(n.month)&&Number.isInteger(n.day)?n:null;
 }catch{return null}
}
function localPeriodKey(epochSeconds,timezone,interval){
 const d=dateParts(epochSeconds,timezone);
 if(!d)return null;
 const ordinal=Date.UTC(d.year,d.month-1,d.day);
 if(interval==='1d')return ordinal;
 if(interval==='1wk')return ordinal-((new Date(ordinal).getUTCDay()+6)%7)*86400*1000;
 return null;
}
export function isActiveUnfinishedYahooBar({barTime,nowSeconds=Date.now()/1000,interval,timezone,marketState}={}){
 if(String(marketState).toUpperCase()!=='REGULAR')return false;
 if(!['1d','1wk'].includes(interval))return false;
 const current=localPeriodKey(Number(nowSeconds),timezone,interval);
 const bar=localPeriodKey(Number(barTime),timezone,interval);
 // Ambiguous local dates are unqualified rather than assumed completed.
 return current!==null&&bar!==null&&bar===current;
}
