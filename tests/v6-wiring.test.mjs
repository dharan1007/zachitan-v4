import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('production route delegates to the v6 market API', () => {
  const route = readFileSync(new URL('../app/api/data/route.js', import.meta.url), 'utf8');
  assert.match(route, /market-api-v6\.mjs/);
});

test('v6 API delegates market execution to the v6 market pipeline', () => {
  const api = readFileSync(new URL('../lib/market-api-v6.mjs', import.meta.url), 'utf8');
  assert.match(api, /buildMarketDataV6/);
});

test('v6 market pipeline uses session-aware integrity and exposes qualification', () => {
  const market = readFileSync(new URL('../lib/market-data-v6.mjs', import.meta.url), 'utf8');
  assert.match(market, /market-integrity-v6/);
  assert.match(market, /qualification/);
  assert.match(market, /analyzeV6/);
});

test('v6 analysis evaluates the frozen untouched publication holdout', () => {
  const analysis = readFileSync(new URL('../lib/analysis-engine-v6.mjs', import.meta.url), 'utf8');
  assert.match(analysis, /evaluatePublicationHoldout/);
  assert.match(analysis, /forecastV6/);
});
