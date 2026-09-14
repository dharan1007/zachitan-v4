import test from 'node:test';
import assert from 'node:assert/strict';
import { targetValidationRows, modelHistoryPlan } from '../lib/model-history.mjs';

test('v6 evidence target leaves room for pre-holdout training and untouched checks', () => {
  assert.ok(targetValidationRows(12) >= 840);
  const plan = modelHistoryPlan({ provider: 'coinbase', interval: '5m', range: '1d', horizon: 12, displayBars: 288 });
  assert.ok(plan.modelBars >= 840);
  assert.ok(plan.modelBars <= 1200);
  assert.equal(plan.historyLimited, false);
});
