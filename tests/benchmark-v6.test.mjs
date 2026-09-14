import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('real-market benchmark evaluates untouched holdout qualification', () => {
  const source = readFileSync(new URL('../scripts/benchmark.mjs', import.meta.url), 'utf8');
  assert.match(source, /evaluatePublicationHoldout/);
  assert.match(source, /holdoutPointSkillVsNoChange/);
  assert.match(source, /holdoutBrierSkillVs50/);
  assert.match(source, /driftDetected/);
  assert.match(source, /holdoutQualifiedRate/);
  assert.match(source, /schemaVersion:\s*3/);
});

test('broad accuracy gate requires untouched holdout evidence', () => {
  const source = readFileSync(new URL('../scripts/benchmark.mjs', import.meta.url), 'utf8');
  assert.match(source, /minimumHoldoutQualifiedRate/);
  assert.match(source, /minimumMedianHoldoutPointSkill/);
  assert.match(source, /minimumMedianHoldoutBrierSkill/);
  assert.match(source, /aggregate\.holdoutQualifiedRate/);
});
