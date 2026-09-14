import test from 'node:test';
import assert from 'node:assert/strict';
import { buildYahooMeta } from '../lib/market-source-v6.mjs';

test('Yahoo V6 metadata distinguishes user-requested range from provider-effective model range', () => {
  const upstream = {
    name: 'Apple Inc.',
    range: '1mo',
    requestedRange: '1mo',
    rangeAdjusted: false,
    interval: '30m',
  };
  const meta = buildYahooMeta(upstream, {
    requestedRange: '3mo',
    effectiveInterval: '30m',
    effectiveModelRange: '1mo',
    historyLimited: true,
  });

  assert.equal(meta.requestedRange, '3mo');
  assert.equal(meta.range, '1mo');
  assert.equal(meta.modelRange, '1mo');
  assert.equal(meta.rangeAdjusted, true);
  assert.equal(meta.interval, '30m');
});

test('Yahoo V6 metadata keeps requested and effective range aligned when no clamp occurs', () => {
  const meta = buildYahooMeta({ range: '2y', requestedRange: '2y' }, {
    requestedRange: '1y',
    effectiveInterval: '1d',
    effectiveModelRange: '2y',
    historyLimited: false,
  });

  assert.equal(meta.requestedRange, '1y');
  assert.equal(meta.range, '1y');
  assert.equal(meta.modelRange, '2y');
  assert.equal(meta.rangeAdjusted, false);
});
