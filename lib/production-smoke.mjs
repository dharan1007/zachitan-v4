import assert from 'node:assert/strict';

export function assertTargetWithheldUnlessPublishable(payload) {
  const state = payload?.publication?.state || payload?.forecast?.decisionState;
  if (state === 'PUBLISHABLE') return;
  assert.equal(payload?.forecast?.center ?? null, null, `${state || 'non-publishable'} forecast exposed a numeric center`);
  for (const point of payload?.forecast?.points || []) {
    assert.equal(point?.price ?? null, null, `${state || 'non-publishable'} forecast exposed a numeric point price`);
  }
}

export function validateHealth(payload, expectedSha = '') {
  assert.equal(payload?.ok, true, 'health did not report ok=true');
  assert.match(String(payload?.version || ''), /^5\./, 'production is not on the v5 release line');
  assert.match(String(payload?.commitSha || ''), /^[0-9a-f]{40}$/i, 'health commit SHA is missing or malformed');
  if (expectedSha) assert.equal(payload.commitSha, expectedSha, 'production SHA does not match expected SHA');
}

export function validateExactSearch(payload) {
  assert.equal(payload?.ok, true, 'search did not report ok=true');
  assert.equal(payload?.results?.[0]?.symbol, 'AAPL', 'exact AAPL search is not ranked first');
}

export function validateYahooCapabilityMarket(payload) {
  assert.equal(payload?.ok, true, 'Yahoo capability smoke did not report ok=true');
  assert.equal(payload?.provider, 'yahoo');
  assert.ok(Number(payload?.compute?.modelRows) >= Number(payload?.compute?.displayRows), 'Yahoo model history is shorter than display history');
  assertTargetWithheldUnlessPublishable(payload);
  if (payload?.session?.forecastAllowed === false) {
    assert.notEqual(payload?.publication?.state, 'PUBLISHABLE', 'closed/unverified Yahoo session published a forecast');
  }
}

export function validateCoinbaseMarket(payload) {
  assert.equal(payload?.ok, true, 'Coinbase smoke did not report ok=true');
  assert.equal(payload?.provider, 'coinbase');
  assert.equal(payload?.session?.state, 'OPEN', 'Coinbase session is not OPEN');
  assert.equal(payload?.quote?.previousClose ?? null, null, 'Coinbase intraday data must not pretend the preceding bar is a previous session close');
  assert.ok(Number(payload?.compute?.modelRows) >= Number(payload?.compute?.displayRows), 'Coinbase model history is shorter than display history');
  assert.ok(Number(payload?.compute?.modelRows) >= 300, 'Coinbase model evidence window is unexpectedly short');
  assertTargetWithheldUnlessPublishable(payload);
}

async function fetchJson(fetchImpl, url, label) {
  const response = await fetchImpl(url, { headers: { 'user-agent': 'ZachitanProductionSmoke/1.0' }, signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error(`${label} returned non-JSON status ${response.status}`); }
  assert.ok(response.ok, `${label} returned HTTP ${response.status}: ${payload?.error || text.slice(0, 200)}`);
  return payload;
}

export async function runProductionSmoke({ baseUrl = 'https://zachitan.vercel.app', expectedSha = '', fetchImpl = fetch } = {}) {
  const base = String(baseUrl).replace(/\/$/, '');
  const health = await fetchJson(fetchImpl, `${base}/api/data?action=health`, 'health');
  validateHealth(health, expectedSha);

  const search = await fetchJson(fetchImpl, `${base}/api/data?action=search&q=AAPL`, 'search');
  validateExactSearch(search);

  const yahoo = await fetchJson(fetchImpl, `${base}/api/data?action=market&provider=yahoo&symbol=AAPL&interval=30m&range=3mo&horizon=12`, 'Yahoo market');
  validateYahooCapabilityMarket(yahoo);

  const coinbase = await fetchJson(fetchImpl, `${base}/api/data?action=market&provider=coinbase&symbol=BTC-USD&interval=5m&range=1d&horizon=12`, 'Coinbase market');
  validateCoinbaseMarket(coinbase);

  const commercial = await fetchImpl(`${base}/commercial`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  assert.equal(commercial.status, 404, `research production unexpectedly exposes /commercial with HTTP ${commercial.status}`);

  return {
    ok: true,
    version: health.version,
    commitSha: health.commitSha,
    yahooState: yahoo?.publication?.state || null,
    coinbaseState: coinbase?.publication?.state || null,
    checkedAt: new Date().toISOString(),
  };
}
