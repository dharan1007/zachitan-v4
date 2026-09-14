import assert from 'node:assert/strict';

export function assertTargetWithheldUnlessPublishable(payload) {
  const state = payload?.publication?.state || payload?.forecast?.decisionState;
  if (state === 'PUBLISHABLE') {
    assert.equal(payload?.qualification?.available, true, 'publishable forecast has no untouched holdout evidence');
    assert.equal(payload?.qualification?.qualified, true, 'publishable forecast did not pass untouched holdout qualification');
    assert.equal(payload?.qualification?.drift?.detected ?? false, false, 'publishable forecast has active holdout drift');
    return;
  }
  assert.equal(payload?.forecast?.center ?? null, null, `${state || 'non-publishable'} forecast exposed a numeric center`);
  for (const point of payload?.forecast?.points || []) {
    assert.equal(point?.price ?? null, null, `${state || 'non-publishable'} forecast exposed a numeric point price`);
  }
}

export function validateHealth(payload, expectedSha = '') {
  assert.equal(payload?.ok, true, 'health did not report ok=true');
  assert.match(String(payload?.version || ''), /^6\./, 'production is not on the v6 release line');
  assert.match(String(payload?.commitSha || ''), /^[0-9a-f]{40}$/i, 'health commit SHA is missing or malformed');
  assert.match(String(payload?.truthContract || ''), /holdout|qualification|drift/i, 'health does not disclose the v6 holdout truth contract');
  if (expectedSha) assert.equal(payload.commitSha, expectedSha, 'production SHA does not match expected SHA');
}

export function validateExactSearch(payload) {
  assert.equal(payload?.ok, true, 'search did not report ok=true');
  assert.equal(payload?.results?.[0]?.symbol, 'AAPL', 'exact AAPL search is not ranked first');
}

function validateQualification(payload) {
  assert.ok(payload?.qualification && typeof payload.qualification === 'object', 'v6 qualification evidence is missing');
  assert.ok(['QUALIFIED', 'UNQUALIFIED', 'INSUFFICIENT'].includes(payload.qualification.state), 'unknown v6 qualification state');
  assert.equal(payload?.publication?.qualificationState, payload.qualification.state, 'publication and qualification states disagree');
  assert.equal(Number(payload?.compute?.holdoutChecks || 0), Number(payload?.qualification?.checks || 0), 'holdout check count disagrees with qualification evidence');
}

export function validateYahooCapabilityMarket(payload) {
  assert.equal(payload?.ok, true, 'Yahoo capability smoke did not report ok=true');
  assert.equal(payload?.provider, 'yahoo');
  assert.ok(Number(payload?.compute?.modelRows) >= Number(payload?.compute?.displayRows), 'Yahoo model history is shorter than display history');
  validateQualification(payload);
  const integrity = payload?.quality?.integrity;
  assert.ok(Number.isFinite(Number(integrity?.largeGapCount)), 'Yahoo integrity did not report unexpected gap count');
  assert.ok(Number.isFinite(Number(integrity?.expectedClosureGapCount)), 'Yahoo integrity did not report expected exchange-closure gap count');
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
  assert.ok(Number(payload?.compute?.modelRows) >= Math.min(840, Number(payload?.compute?.targetValidationRows || 840)), 'Coinbase V6 evidence window is unexpectedly short');
  validateQualification(payload);
  assertTargetWithheldUnlessPublishable(payload);
}

async function fetchJson(fetchImpl, url, label) {
  const response = await fetchImpl(url, { headers: { 'user-agent': 'ZachitanProductionSmoke/2.0' }, signal: AbortSignal.timeout(30_000) });
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
    yahooQualification: yahoo?.qualification?.state || null,
    coinbaseState: coinbase?.publication?.state || null,
    coinbaseQualification: coinbase?.qualification?.state || null,
    checkedAt: new Date().toISOString(),
  };
}
