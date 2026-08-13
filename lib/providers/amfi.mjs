import { cachedFetchText, cachedFetchJson, provenance } from '../http.mjs';

const LATEST = 'https://www.amfiindia.com/spages/NAVAll.txt';
const HIST = 'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx';
const MFAPI = 'https://api.mfapi.in/mf';
let latestCache = { at: 0, rows: [] };

function parseNavText(text) {
  const rows = [];
  let amc = '';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.includes(';')) { if (!/^Scheme Code/i.test(line)) amc = line; continue; }
    const p = line.split(';');
    if (p.length < 6 || !/^\d+$/.test(p[0])) continue;
    const code = p[0];
    const name = p[3];
    const nav = Number(p[4]);
    const date = p[5];
    if (!code || !name || !Number.isFinite(nav)) continue;
    rows.push({ code, name, nav, date, amc });
  }
  return rows;
}

async function latestRows() {
  if (Date.now() - latestCache.at < 30 * 60 * 1000 && latestCache.rows.length) return latestCache.rows;
  const text = await cachedFetchText(LATEST, { ttlMs: 30 * 60 * 1000, timeoutMs: 9000 });
  const rows = parseNavText(text);
  latestCache = { at: Date.now(), rows };
  return rows;
}

export async function searchAmfi(query, limit = 12) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const rows = await latestRows();
  return rows.filter(r => `${r.name} ${r.amc} ${r.code}`.toLowerCase().includes(q)).slice(0, limit).map(r => ({
    symbol: `AMFI:${r.code}`, displaySymbol: r.code, name: r.name, exchange: 'AMFI', type: 'mutualfund', provider: 'amfi', nav: r.nav, navDate: r.date, amc: r.amc,
  }));
}

function ddMonYyyy(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getUTCDate()).padStart(2,'0')}-${m[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

function parseHist(text, code) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const p = raw.split(';');
    if (p[0] !== code || p.length < 8) continue;
    const nav = Number(p[4]);
    const ts = Date.parse(p[7]);
    if (Number.isFinite(nav) && nav > 0 && Number.isFinite(ts)) out.push({ time: Math.floor(ts / 1000), open: nav, high: nav, low: nav, close: nav, volume: 0 });
  }
  return out;
}

async function officialRecentHistory(code, days) {
  // AMFI's history export is an all-schemes report. Keep this path for shorter windows only;
  // larger requests are prohibitively expensive in a serverless interaction.
  if (days > 370) return [];
  const end = new Date();
  const chunks = [];
  for (let offset = 0; offset < days; offset += 89) {
    const to = new Date(end.getTime() - offset * 86400_000);
    const from = new Date(end.getTime() - Math.min(days, offset + 88) * 86400_000);
    const url = `${HIST}?frmdt=${encodeURIComponent(ddMonYyyy(from))}&todt=${encodeURIComponent(ddMonYyyy(to))}`;
    chunks.push(url);
  }
  const parts = await Promise.allSettled(chunks.map(url => cachedFetchText(url, { ttlMs: 12 * 60 * 60 * 1000, timeoutMs: 5000 })));
  const rows = [];
  for (const p of parts) if (p.status === 'fulfilled') rows.push(...parseHist(p.value, code));
  return [...new Map(rows.map(x => [x.time, x])).values()].sort((a,b) => a.time - b.time);
}

function parseMfapiDate(s) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s || '').trim());
  if (!m) return NaN;
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) / 1000;
}

async function mirroredHistory(code, days) {
  const j = await cachedFetchJson(`${MFAPI}/${encodeURIComponent(code)}`, { ttlMs: 12 * 60 * 60 * 1000, timeoutMs: 9000 });
  const cutoff = Date.now()/1000 - Math.max(180, days) * 86400;
  const rows = (Array.isArray(j?.data) ? j.data : []).map(r => {
    const nav = Number(r.nav), time = parseMfapiDate(r.date);
    return { time, open: nav, high: nav, low: nav, close: nav, volume: 0 };
  }).filter(x => Number.isFinite(x.time) && x.time >= cutoff && Number.isFinite(x.close) && x.close > 0)
    .sort((a,b) => a.time - b.time);
  return { rows, meta: j?.meta || null };
}

export async function amfiHistory(symbol, { days = 3650 } = {}) {
  const code = String(symbol || '').replace(/^AMFI:/i, '').trim();
  if (!/^\d+$/.test(code)) throw new Error('AMFI symbol must be AMFI:<scheme-code>');
  const latest = await latestRows();
  const meta = latest.find(x => x.code === code);
  if (!meta) throw new Error('AMFI scheme code not found in the latest official NAV file');

  let candles = await officialRecentHistory(code, days).catch(() => []);
  let historySource = 'AMFI official NAV history export';
  let mirrorMeta = null;
  if (candles.length < 60 || days > 370) {
    const mirrored = await mirroredHistory(code, days);
    if (mirrored.rows.length > candles.length) {
      candles = mirrored.rows;
      mirrorMeta = mirrored.meta;
      historySource = 'MFAPI historical mirror, cross-checked to AMFI latest NAV';
    }
  }
  if (candles.length < 30) throw new Error('Too little mutual-fund NAV history was available from the connected sources');

  const last = candles.at(-1);
  const officialNav = Number(meta.nav);
  const latestCrossCheck = Number.isFinite(officialNav) && last?.close ? {
    officialNav,
    officialDate: meta.date,
    historicalLastNav: last.close,
    absoluteDifference: Math.abs(officialNav - last.close),
    withinTolerance: Math.abs(officialNav - last.close) <= Math.max(0.01, officialNav * 0.001),
  } : null;

  return {
    symbol: `AMFI:${code}`, name: meta.name, assetClass: 'mutualfund', currency: 'INR', exchange: 'AMFI', current: officialNav,
    candles,
    sourceTiming: 'Official AMFI NAV is end-of-day. Historical series may use the MFAPI public mirror when the official all-schemes export is too slow for an interactive request.',
    latestCrossCheck,
    mirrorMeta,
    provenance: provenance({
      provider: historySource,
      family: 'Indian mutual fund NAV',
      endpoint: historySource.startsWith('MFAPI') ? `api.mfapi.in/mf/${code}` : 'DownloadNAVHistoryReport_Po.aspx',
      rights: historySource.startsWith('MFAPI') ? 'Public MFAPI mirror; latest NAV independently cross-checked against AMFI official NAVAll.txt' : 'Official AMFI publication',
      cadence: 'End-of-day NAV',
    }),
  };
}
