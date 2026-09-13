import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYahooIntervalRange } from '../lib/providers/yahoo.mjs';

test('Yahoo five-minute requests clamp unsupported multi-month ranges', () => {
  assert.deepEqual(normalizeYahooIntervalRange('5m', '3mo'), {
    interval: '5m', range: '1mo', requestedRange: '3mo', rangeAdjusted: true,
  });
});

test('Yahoo one-minute history is capped conservatively at five days', () => {
  assert.deepEqual(normalizeYahooIntervalRange('1m', '1mo'), {
    interval: '1m', range: '5d', requestedRange: '1mo', rangeAdjusted: true,
  });
});

test('Yahoo hourly history is capped to a stable one-year window', () => {
  assert.deepEqual(normalizeYahooIntervalRange('1h', '5y'), {
    interval: '1h', range: '1y', requestedRange: '5y', rangeAdjusted: true,
  });
});

test('Yahoo daily history keeps long requested ranges unchanged', () => {
  assert.deepEqual(normalizeYahooIntervalRange('1d', '5y'), {
    interval: '1d', range: '5y', requestedRange: '5y', rangeAdjusted: false,
  });
});
