import { fetchJson } from '../http.mjs';
const BASE = 'https://api.exchange.coinbase.com';
export const provenance = { provider: 'Coinbase Exchange', family: 'crypto market', cadence: 'live / exchange-native', synthetic: false, rights: 'Public market-data endpoints; Coinbase terms apply' };
export function safeProduct(v='BTC-USD') { const s=String(v).toUpperCase(); return /^[A-Z0-9]{2,15}-[A-Z0-9]{2,15}$/.test(s) ? s : null; }
export async function searchProducts(q='') {
  const rows = await fetchJson(`${BASE}/products`, { ttlMs: 15 * 60_000, cacheKey: 'coinbase-products' });
  const term = q.toUpperCase();
  return rows.filter(x=>x.status==='online'&&!x.trading_disabled).map(x=>({symbol:x.id,name:x.display_name||x.id,assetClass:'crypto',exchange:'Coinbase',currency:x.quote_currency,provider:'coinbase'})).filter(x=>!term||x.symbol.includes(term)||x.name.toUpperCase().includes(term)).slice(0,20);
}
export async function ticker(product) {
  const p=safeProduct(product); if(!p) throw new Error('Invalid Coinbase product');
  const d=await fetchJson(`${BASE}/products/${encodeURIComponent(p)}/ticker`,{timeoutMs:7000});
  return {symbol:p,price:+d.price,bid:+d.bid,ask:+d.ask,volume:+d.volume,time:d.time||new Date().toISOString(),currency:p.split('-').at(-1),exchange:'Coinbase Exchange',marketState:'open'};
}
export async function book(product) {
  const p=safeProduct(product); if(!p) throw new Error('Invalid Coinbase product');
  const d=await fetchJson(`${BASE}/products/${encodeURIComponent(p)}/book?level=2`,{timeoutMs:7000});
  return {bids:(d.bids||[]).slice(0,50).map(([price,size,orders])=>({price:+price,size:+size,orders:+orders||0})),asks:(d.asks||[]).slice(0,50).map(([price,size,orders])=>({price:+price,size:+size,orders:+orders||0})),sequence:d.sequence};
}
export async function trades(product) {
  const p=safeProduct(product); if(!p) throw new Error('Invalid Coinbase product');
  const d=await fetchJson(`${BASE}/products/${encodeURIComponent(p)}/trades?limit=200`,{timeoutMs:7000});
  return (d||[]).map(x=>({id:x.trade_id,time:x.time,price:+x.price,size:+x.size,makerSide:x.side}));
}
export async function candles(product, granularity=300, limit=1200) {
  const p=safeProduct(product); if(!p) throw new Error('Invalid Coinbase product');
  const allowed=new Set([60,300,900,3600,21600,86400]); if(!allowed.has(+granularity)) granularity=300;
  const wanted=Math.min(1200,Math.max(180,+limit||1200)); const maxChunk=300;
  const end=Math.floor(Date.now()/(granularity*1000))*granularity; const jobs=[]; let remaining=wanted, chunkEnd=end;
  while(remaining>0){const size=Math.min(maxChunk,remaining);const start=chunkEnd-granularity*(size-1);const u=new URL(`${BASE}/products/${encodeURIComponent(p)}/candles`);u.searchParams.set('granularity',String(granularity));u.searchParams.set('start',new Date(start*1000).toISOString());u.searchParams.set('end',new Date(chunkEnd*1000).toISOString());jobs.push(fetchJson(u.toString(),{timeoutMs:9000}));remaining-=size;chunkEnd=start-granularity;}
  const chunks=await Promise.all(jobs); const by=new Map();
  for(const rows of chunks) for(const row of Array.isArray(rows)?rows:[]){const [time,low,high,open,close,volume]=row;const c={time:+time,low:+low,high:+high,open:+open,close:+close,volume:+volume};if(Object.values(c).every(Number.isFinite)&&c.low<=Math.min(c.open,c.close)&&c.high>=Math.max(c.open,c.close))by.set(c.time,c);}
  return [...by.values()].sort((a,b)=>a.time-b.time).slice(-wanted);
}
