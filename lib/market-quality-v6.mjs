export function marketQualityV6(candles, meta, provider, session, integrity) {
  const newest = candles.at(-1)?.time || 0;
  const stale = Math.max(0, Date.now() / 1000 - newest);
  const steps = candles.slice(-80).map((x, i, a) => i ? x.time - a[i - 1].time : null).filter(x => x > 0 && Number.isFinite(x)).sort((a, b) => a - b);
  const step = steps.length ? steps[Math.floor(steps.length / 2)] : 86400;
  const dailyLike = step >= 20 * 3600 || ['amfi', 'ecb'].includes(provider);
  const sourceClosed = provider === 'yahoo' && session?.state !== 'REGULAR';
  const grace = dailyLike ? 4 * 86400 : step * 2;
  const freshness = sourceClosed ? null : Math.max(0, 100 - Math.max(0, stale - grace) / Math.max(1, dailyLike ? 8 * 86400 : step * 20) * 100);
  return {
    rows: candles.length,
    newest: newest ? new Date(newest * 1000).toISOString() : null,
    staleSeconds: Math.round(stale),
    freshnessScore: freshness == null ? null : Math.round(Math.min(100, freshness)),
    freshnessStatus: sourceClosed ? 'market-closed-last-observation' : dailyLike ? 'reference-cadence' : 'live-cadence-check',
    timing: meta.marketState || 'source-dependent',
    integrity,
  };
}
