export const num=(v,d=2)=>Number.isFinite(+v)?Number(v).toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
export const smart=v=>{const n=+v;if(!Number.isFinite(n))return'—';const d=Math.abs(n)<1?5:Math.abs(n)<100?3:2;return n.toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d})};
export const pct=(v,d=1)=>Number.isFinite(+v)?`${(+v*100).toFixed(d)}%`:'—';
export const date=v=>v?new Date((typeof v==='number'&&v<1e12)?v*1000:v).toLocaleString():'—';
export const shortDate=v=>v?new Date((typeof v==='number'&&v<1e12)?v*1000:v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'2-digit'}):'—';
export const signedPct=v=>Number.isFinite(+v)?`${+v>=0?'+':''}${(+v*100).toFixed(2)}%`:'—';
