import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../app/api/data/route.js', import.meta.url), 'utf8');
const handler = fs.readFileSync(new URL('../lib/market-api-v5.mjs', import.meta.url), 'utf8');

test('Next route delegates to the production v5 market handler', () => {
  assert.match(route, /market-api-v5\.mjs/);
  assert.match(route, /handleGet/);
});

test('market API separates model evidence history from displayed chart history', () => {
  assert.match(handler, /modelHistoryPlan/);
  assert.match(handler, /sliceDisplayCandles/);
  assert.match(handler, /modelCandles/);
  assert.match(handler, /displayCandles/);
  assert.match(handler, /analyzeMarket\([^\n]*modelCandles/);
  assert.match(handler, /candles:\s*displayCandles/);
  assert.match(handler, /modelRows/);
  assert.match(handler, /displayRows/);
});

test('analysis cache identity is not keyed by the user display range', () => {
  const fn = handler.match(/function analysisKey\([\s\S]*?\n}\n/);
  assert.ok(fn, 'analysisKey function must exist');
  assert.doesNotMatch(fn[0], /\brange\b/);
});
