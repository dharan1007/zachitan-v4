import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../app/api/data/route.js', import.meta.url), 'utf8');
const market = fs.readFileSync(new URL('../lib/market-data-v6.mjs', import.meta.url), 'utf8');
const analysis = fs.readFileSync(new URL('../lib/analysis-engine-v6.mjs', import.meta.url), 'utf8');

test('Next route delegates to the production v6 market handler', () => {
  assert.match(route, /market-api-v6\.mjs/);
  assert.match(route, /handleGet/);
});

test('v6 market pipeline separates model evidence history from displayed chart history', () => {
  assert.match(market, /modelCandles/);
  assert.match(market, /displayCandles/);
  assert.match(market, /sliceDisplayCandles/);
  assert.match(market, /analyzeV6\([^\n]*modelCandles/);
  assert.match(market, /candles:\s*displayCandles/);
  assert.match(market, /modelRows/);
  assert.match(market, /displayRows/);
});

test('v6 analysis cache identity is not keyed by the user display range', () => {
  const fn = analysis.match(/function keyFor\([\s\S]*?\n}\n/);
  assert.ok(fn, 'v6 analysis key function must exist');
  assert.doesNotMatch(fn[0], /\brange\b/);
});
