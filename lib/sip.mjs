const YEAR_MS = 365.25 * 86400000;

export function xnpv(rate, cash) {
  if (rate <= -0.999 || !cash?.length) return Infinity;
  const t0 = cash[0].date;
  return cash.reduce((s, x) => s + x.value / Math.pow(1 + rate, (x.date - t0) / YEAR_MS), 0);
}

export function xirr(cash) {
  if (!Array.isArray(cash) || cash.length < 2) return null;
  let lo = -0.99, hi = 10, flo = xnpv(lo, cash), fhi = xnpv(hi, cash);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 120; i++) {
    const m = (lo + hi) / 2, f = xnpv(m, cash);
    if (Math.abs(f) < 1e-9) return m;
    if (flo * f <= 0) { hi = m; fhi = f; }
    else { lo = m; flo = f; }
  }
  return (lo + hi) / 2;
}

export function simulateRecurring(candles, amount) {
  const rows = (candles || []).filter(x => x.close > 0 && Number.isFinite(+x.time)).sort((a, b) => a.time - b.time);
  if (rows.length < 60 || !(amount > 0)) return null;

  const buys = [], seen = new Set();
  let units = 0, invested = 0;
  for (const c of rows) {
    const d = new Date(c.time * 1000), key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bought = amount / c.close;
    units += bought;
    invested += amount;
    buys.push({ time: c.time, price: c.close, units: bought, totalUnits: units, invested });
  }
  if (!buys.length) return null;

  const last = rows.at(-1), value = units * last.close;
  const cash = buys.map(b => ({ date: b.time * 1000, value: -amount }));
  cash.push({ date: last.time * 1000, value });
  const irr = xirr(cash);

  let pricePeak = 0, underlyingMaxDrawdown = 0;
  const timeline = [];
  for (const c of rows) {
    const active = buys.filter(b => b.time <= c.time);
    if (!active.length) continue;
    const totalUnits = active.at(-1).totalUnits;
    timeline.push({ time: c.time, value: totalUnits * c.close });
    pricePeak = Math.max(pricePeak, c.close);
    if (pricePeak > 0) underlyingMaxDrawdown = Math.min(underlyingMaxDrawdown, c.close / pricePeak - 1);
  }

  return {
    invested,
    value,
    gain: value / invested - 1,
    irr,
    underlyingMaxDrawdown,
    units,
    purchases: buys.length,
    lastPrice: last.close,
    start: buys[0].time,
    end: last.time,
    buys,
    timeline,
  };
}
