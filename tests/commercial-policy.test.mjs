import assert from 'node:assert/strict';
import test from 'node:test';

const originalMode = process.env.ZACHITAN_RUNTIME_MODE;
const originalApproved = process.env.ZACHITAN_COMMERCIAL_APPROVED_SOURCES;

test.afterEach(() => {
  if (originalMode === undefined) delete process.env.ZACHITAN_RUNTIME_MODE;
  else process.env.ZACHITAN_RUNTIME_MODE = originalMode;
  if (originalApproved === undefined) delete process.env.ZACHITAN_COMMERCIAL_APPROVED_SOURCES;
  else process.env.ZACHITAN_COMMERCIAL_APPROVED_SOURCES = originalApproved;
});

test('research mode is the safe default for existing behavior', async () => {
  delete process.env.ZACHITAN_RUNTIME_MODE;
  const { runtimeMode, providerFetchAllowed } = await import('../lib/commercial-policy.js');
  assert.equal(runtimeMode(), 'research');
  assert.equal(providerFetchAllowed('yahoo'), true);
});

test('commercial mode blocks unapproved provider-backed acquisition', async () => {
  process.env.ZACHITAN_RUNTIME_MODE = 'commercial';
  delete process.env.ZACHITAN_COMMERCIAL_APPROVED_SOURCES;
  const { assertProviderFetchAllowed, providerFetchAllowed } = await import('../lib/commercial-policy.js');
  assert.equal(providerFetchAllowed('yahoo'), false);
  assert.throws(() => assertProviderFetchAllowed('yahoo'), /commercial mode/i);
});

test('commercial mode permits only explicitly approved sources', async () => {
  process.env.ZACHITAN_RUNTIME_MODE = 'commercial';
  process.env.ZACHITAN_COMMERCIAL_APPROVED_SOURCES = 'internal-feed,customer-feed';
  const { providerFetchAllowed } = await import('../lib/commercial-policy.js');
  assert.equal(providerFetchAllowed('internal-feed'), true);
  assert.equal(providerFetchAllowed('yahoo'), false);
});

test('commercial capabilities disclose product boundary', async () => {
  process.env.ZACHITAN_RUNTIME_MODE = 'commercial';
  const { commercialCapabilities } = await import('../lib/commercial-policy.js');
  const caps = commercialCapabilities();
  assert.equal(caps.runtimeMode, 'commercial');
  assert.equal(caps.byod, 'available');
  assert.equal(caps.investmentAdvice, 'not_provided');
});

function validRecords(count = 80) {
  const start = Date.parse('2025-01-01T00:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + i * 0.1;
    return {
      time: new Date(start + i * 86400000).toISOString(),
      open: close - 0.1,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000 + i,
    };
  });
}

test('BYOD normalization returns chronological user-supplied observations', async () => {
  const { normalizeUserSeries } = await import('../lib/byod.js');
  const result = normalizeUserSeries(validRecords());
  assert.equal(result.records.length, 80);
  assert.equal(result.sourceKind, 'user_supplied');
  assert.equal(result.records[0].close, 100);
});

test('BYOD normalization rejects duplicate timestamps', async () => {
  const { normalizeUserSeries } = await import('../lib/byod.js');
  const rows = validRecords();
  rows[1].time = rows[0].time;
  assert.throws(() => normalizeUserSeries(rows), /duplicate/i);
});

test('BYOD normalization rejects missing OHLC values', async () => {
  const { normalizeUserSeries } = await import('../lib/byod.js');
  const rows = validRecords();
  delete rows[0].close;
  assert.throws(() => normalizeUserSeries(rows), /required/i);
});

test('BYOD normalization rejects insufficient history', async () => {
  const { normalizeUserSeries } = await import('../lib/byod.js');
  assert.throws(() => normalizeUserSeries(validRecords(79)), /at least 80/i);
});
