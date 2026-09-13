import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../app/api/data/route.js', import.meta.url), 'utf8');

test('market API separates model evidence history from displayed chart history', () => {
  assert.match(route, /modelHistoryPlan/);
  assert.match(route, /sliceDisplayCandles/);
  assert.match(route, /modelCandles/);
  assert.match(route, /displayCandles/);
  assert.match(route, /analyzeMarket\([^\n]*modelCandles/);
  assert.match(route, /candles:\s*displayCandles/);
  assert.match(route, /modelRows/);
  assert.match(route, /displayRows/);
});

test('analysis cache identity is not keyed by the user display range', () => {
  const fn = route.match(/function analysisKey\([\s\S]*?\n}\n/);
  assert.ok(fn, 'analysisKey function must exist');
  assert.doesNotMatch(fn[0], /\brange\b/);
});
