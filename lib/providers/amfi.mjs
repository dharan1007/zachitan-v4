import { fetchText, fetchJson } from '../http.mjs';

const LATEST = 'https://www.amfiindia.com/spages/NAVAll.txt';
const HIST = 'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx';
const MFAPI = 'https://api.mfapi.in/mf';
let latestCache = { at: 0, rows: [] };

export const provenance = {
  provider: 'AMFI + MFAPI historical transport',
  family: 'Indian mutual fund NAV',
  cadence: 'End-of-day NAV',
  synthetic: false,
  rights: 'AMFI official publication; MFAPI mirror used only for long historical transport and cross-checked to official latest NAV.',
};

function parseNavText(text) {
  const rows = [];
  let amc = '';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.includes(';')) {
      if (!/^Scheme Code/i.test(line)) amc = line;
      continue;
    }
    const p = line.split(';');
    if (p.length < 6 || !/^\d+$/.test(p[0])) continue;
    const code = p[0], name = p[3], nav = Number(p[4]), date = p[5];
    if (code && name && Number.isFinite(nav)) rows.push({ code, name, nav, date, amc });
  }
  return rows;
}

async function latestRows() {
  if (Date.now() - latestCache.at < 30 * 60_000 && latestCache.rows.length) return latestCache.rows;
  const text = await fetchText(LATEST, { ttlMs: 30 * 60_000, timeoutMs: 9000 });
  const rows = parseNavText(text);
  if (!rows.length) throw new Error('AMFI latest NAV feed returned no usable schemes');
  latestCache = { at: Date.now(), rows };
  return rows;
}

export async function search(query, limit = 12) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const rows = await latestRows();
  return rows.filter(r => `${r.name} ${r.amc} ${r.code}`.toLowerCase().includes(q)).slice(0, limit).map(r => ({
    symbol: `AMFI:${r.code}`,
    displaySymbol: r.code,
    name: r.name,
    exchange: 'AMFI',
    assetClass: 'mutual_fund',
    provider: 'amfi',
    currency: 'INR',
    nav: r.nav,
    navDate: r.date,
    amc: r.amc,
  }));
}

export const searchAmfi = search;

function ddMonYyyy(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getUTCDate()).padStart(2, '0')}-${m[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

function parseHist(text, code) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const p = raw.split(';');
    if (p[0] !== code || p.length < 8) continue;
    const nav = Number(p[4]), ts = Date.parse(p[7]);
    if (Number.isFinite(nav) && nav > 0 && Number.isFinite(ts)) {
      out.push({ time: Math.floor(ts / 1000), open: nav, high: nav, low: nav, close: nav, volume: 0 });
    }
  }
  return out;
}

async function officialRecentHistory(code, days) {
  if (days > 370) return [];
  const end = new Date(), chunks = [];
  for (let offset = 0; offset < days; offset += 89) {
    const to = new Date(end.getTime() - offset * 86400_000);
    const from = new Date(end.getTime() - Math.min(days, offset + 88) * 86400_000);
    chunks.push(`${HIST}?frmdt=${encodeURIComponent(ddMonYyyy(from))}&todt=${encodeURIComponent(ddMonYyyy(to))}`);
  }
  const parts = await Promise.allSettled(chunks.map(url => fetchText(url, { ttlMs: 12 * 60 * 60_000, timeoutMs: 6000 })));
  const rows = [];
  for (const p of parts) if (p.status === 'fulfilled') rows.push(...parseHist(p.value, code));
  return [...new Map(rows.map(x => [x.time, x])).values()].sort((a, b) => a.time - b.time);
}

function parseMfapiDate(s) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s || '').trim());
  return m ? Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) / 1000 : NaN;
}

async function mirroredHistory(code, days) {
  const j = await fetchJson(`${MFAPI}/${encodeURIComponent(code)}`, { ttlMs: 12 * 60 * 60_000, timeoutMs: 9000 });
  const cutoff = Date.now() / 1000 - Math.max(180, days) * 86400;
  const rows = (Array.isArray(j?.data) ? j.data : []).map(r => {
    const nav = Number(r.nav), time = parseMfapiDate(r.date);
    return { time, open: nav, high: nav, low: nav, close: nav, volume: 0 };
  }).filter(x => Number.isFinite(x.time) && x.time >= cutoff && Number.isFinite(x.close) && x.close > 0)
    .sort((a, b) => a.time - b.time);
  return { rows, meta: j?.meta || null };
}

export async function amfiHistory(symbol, { days = 3650 } = {}) {
  const code = String(symbol || '').replace(/^AMFI:/i, '').trim();
  if (!/^\d+$/.test(code)) throw new Error('AMFI symbol must be AMFI:<scheme-code>');
  const latest = await latestRows();
  const scheme = latest.find(x => x.code === code);
  if (!scheme) throw new Error('AMFI scheme code not found in the latest official NAV file');

  let candles = await officialRecentHistory(code, days).catch(() => []);
  let historySource = 'AMFI official NAV history export', mirrorMeta = null;
  if (candles.length < 60 || days > 370) {
    const mirrored = await mirroredHistory(code, days);
    if (mirrored.rows.length > candles.length) {
      candles = mirrored.rows;
      mirrorMeta = mirrored.meta;
      historySource = 'MFAPI historical mirror, cross-checked to AMFI latest NAV';
    }
  }
  if (candles.length < 30) throw new Error('Too little mutual-fund NAV history was available from connected sources');

  const last = candles.at(-1), officialNav = Number(scheme.nav);
  const latestCrossCheck = Number.isFinite(officialNav) && last?.close ? {
    officialNav,
    officialDate: scheme.date,
    historicalLastNav: last.close,
    absoluteDifference: Math.abs(officialNav - last.close),
    withinTolerance: Math.abs(officialNav - last.close) <= Math.max(0.01, officialNav * 0.001),
  } : null;

  return {
    symbol: `AMFI:${code}`,
    name: scheme.name,
    assetClass: 'mutual_fund',
    currency: 'INR',
    exchange: 'AMFI',
    current: officialNav,
    candles,
    sourceTiming: 'Official AMFI NAV is end-of-day. Long history may use MFAPI transport and is cross-checked to AMFI latest NAV.',
    latestCrossCheck,
    mirrorMeta,
    provenance: {
      provider: historySource,
      family: 'Indian mutual fund NAV',
      synthetic: false,
      rights: historySource.startsWith('MFAPI') ? 'Public MFAPI mirror; latest NAV cross-checked against AMFI official NAVAll.txt' : 'Official AMFI publication',
      cadence: 'End-of-day NAV',
    },
  };
}

export async function history(symbol, days = 3650) {
  const d = await amfiHistory(symbol, { days });
  return {
    candles: d.candles,
    meta: {
      name: d.name,
      assetClass: d.assetClass,
      currency: d.currency,
      exchange: d.exchange,
      price: d.current,
      previousClose: d.candles.at(-2)?.close ?? null,
      marketState: 'end-of-day NAV',
      timezone: 'Asia/Kolkata',
      dataGranularity: '1d',
      interval: '1d',
      range: `${days}d requested`,
      sourceTiming: d.sourceTiming,
      latestCrossCheck: d.latestCrossCheck,
    },
    provenance: d.provenance,
  };
}
