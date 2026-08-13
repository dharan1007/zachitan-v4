import { fetchJson, safeText } from '../http.mjs';
const SEARCH='https://query2.finance.yahoo.com/v1/finance/search';
const CHART='https://query1.finance.yahoo.com/v8/finance/chart';
export const provenance = { provider:'Yahoo Finance public chart feed', family:'multi-asset market', cadence:'instrument/exchange dependent; may be delayed', synthetic:false, rights:'Undocumented publisher endpoint; Yahoo terms apply. Not an exchange entitlement.' };
const quoteMap={EQUITY:'stock',ETF:'etf',MUTUALFUND:'mutual_fund',INDEX:'index',FUTURE:'future',CURRENCY:'forex',CRYPTOCURRENCY:'crypto',OPTION:'option'};
export function safeSymbol(v=''){const s=String(v).trim();return /^[A-Za-z0-9^=.\-]{1,40}$/.test(s)?s:null;}
export async function search(q=''){
  q=safeText(q,60); if(!q) return [];
  const u=new URL(SEARCH);u.searchParams.set('q',q);u.searchParams.set('quotesCount','18');u.searchParams.set('newsCount','0');u.searchParams.set('lang','en-US');u.searchParams.set('region','US');
  const d=await fetchJson(u.toString(),{timeoutMs:7000,ttlMs:60_000,cacheKey:`yf-search:${q.toLowerCase()}`});
  return (d.quotes||[]).filter(x=>x.symbol&&quoteMap[x.quoteType]).map(x=>({symbol:x.symbol,name:x.longname||x.shortname||x.symbol,assetClass:quoteMap[x.quoteType]||'market',exchange:x.exchDisp||x.exchange||'',currency:x.currency||'',provider:'yahoo'}));
}
function intervalRange(interval, range){
  const allowedIntervals=new Set(['1m','2m','5m','15m','30m','60m','90m','1h','1d','5d','1wk','1mo','3mo']);
  const allowedRanges=new Set(['1d','5d','1mo','3mo','6mo','1y','2y','5y','10y','ytd','max']);
  interval=allowedIntervals.has(interval)?interval:'1d'; range=allowedRanges.has(range)?range:'2y';
  const intraday=['1m','2m','5m','15m','30m','60m','90m','1h'].includes(interval);
  if(intraday && ['2y','5y','10y','max'].includes(range)) range= interval==='60m'||interval==='1h' ? '1y' : '1mo';
  if(['1m','2m'].includes(interval) && !['1d','5d'].includes(range)) range='5d';
  return {interval,range};
}
export async function chart(symbol, interval='1d', range='2y'){
  const s=safeSymbol(symbol); if(!s) throw new Error('Invalid market symbol');
  ({interval,range}=intervalRange(interval,range));
  const u=new URL(`${CHART}/${encodeURIComponent(s)}`);u.searchParams.set('interval',interval);u.searchParams.set('range',range);u.searchParams.set('includePrePost','false');u.searchParams.set('events','div,splits');
  const d=await fetchJson(u.toString(),{timeoutMs:9000}); const r=d?.chart?.result?.[0]; if(!r) throw new Error(d?.chart?.error?.description||'No market data returned');
  const q=r.indicators?.quote?.[0]||{},ts=r.timestamp||[]; const candles=[];
  for(let i=0;i<ts.length;i++){const c={time:+ts[i],open:+q.open?.[i],high:+q.high?.[i],low:+q.low?.[i],close:+q.close?.[i],volume:Number.isFinite(+q.volume?.[i])?+q.volume[i]:0};if([c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.close>0&&c.low<=Math.min(c.open,c.close)&&c.high>=Math.max(c.open,c.close))candles.push(c);}
  const m=r.meta||{};
  return {symbol:s,candles,meta:{name:m.longName||m.shortName||s,assetClass:quoteMap[m.instrumentType]||String(m.instrumentType||'market').toLowerCase(),currency:m.currency||'',exchange:m.fullExchangeName||m.exchangeName||'',price:+m.regularMarketPrice,previousClose:+m.chartPreviousClose||+m.previousClose,marketState:m.marketState||'',timezone:m.exchangeTimezoneName||m.timezone||'',gmtoffset:+m.gmtoffset||0,dataGranularity:m.dataGranularity||interval,range,interval,firstTradeDate:+m.firstTradeDate||null}};
}

async function yahooSession(){
  const ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
  const c=await fetch('https://fc.yahoo.com',{redirect:'manual',headers:{'User-Agent':ua,'Accept':'text/html,*/*'}}).catch(()=>null);
  const cookie=c?.headers?.getSetCookie?.().map(x=>x.split(';')[0]).join('; ') || c?.headers?.get('set-cookie')?.split(';')[0] || '';
  if(!cookie) throw new Error('Yahoo options session was not granted');
  const cr=await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb',{headers:{'User-Agent':ua,'Cookie':cookie}}); if(!cr.ok) throw new Error(`Options crumb ${cr.status}`); const crumb=(await cr.text()).trim(); if(!crumb||crumb.includes('<')) throw new Error('Invalid options crumb'); return {ua,cookie,crumb};
}
export async function options(underlying, expiration){
  const s=safeSymbol(underlying); if(!s) throw new Error('Invalid underlying');
  const {ua,cookie,crumb}=await yahooSession(); const u=new URL(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(s)}`);u.searchParams.set('crumb',crumb);if(expiration)u.searchParams.set('date',String(expiration));
  const r=await fetch(u,{headers:{'User-Agent':ua,'Cookie':cookie,'Accept':'application/json'}});if(!r.ok)throw new Error(`Options upstream ${r.status}`);const d=await r.json();const x=d?.optionChain?.result?.[0];if(!x)throw new Error(d?.optionChain?.error?.description||'No option chain returned');
  const opts=x.options?.[0]||{}; const slim=(a)=>(a||[]).slice(0,240).map(o=>({contractSymbol:o.contractSymbol,strike:+o.strike,lastPrice:+o.lastPrice,bid:+o.bid,ask:+o.ask,change:+o.change,percentChange:+o.percentChange,volume:+o.volume||0,openInterest:+o.openInterest||0,impliedVolatility:+o.impliedVolatility||null,inTheMoney:!!o.inTheMoney,lastTradeDate:+o.lastTradeDate,expiration:+o.expiration}));
  return {underlying:s,expirationDates:x.expirationDates||[],quote:x.quote||{},expiration:opts.expirationDate||expiration||null,calls:slim(opts.calls),puts:slim(opts.puts)};
}
