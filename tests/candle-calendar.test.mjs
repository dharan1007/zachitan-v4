import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyGap,auditSpacing} from '../lib/candle-calendar.mjs';
const r=(time)=>({time,open:1,high:1,low:1,close:1});
test('continuous crypto missing intervals are reported not synthesized',()=>{
 const gaps=auditSpacing([r(1000),r(1300),r(1900)],{provider:'coinbase',interval:'5m'});
 assert.equal(gaps.totalObserved,3);
 assert.equal(gaps.counts.adjacent,1);
 assert.equal(gaps.counts.missing,1);
 assert.equal(gaps.missingSlots[0].missing,1);
});
test('weekend daily stock gap is a market boundary, not invented missing stock prices',()=>{
 const friday=Date.parse('2026-09-25T20:00:00Z')/1000;
 const monday=Date.parse('2026-09-28T20:00:00Z')/1000;
 const x=classifyGap(r(friday),r(monday),{provider:'yahoo',interval:'1d',timezone:'America/New_York'});
 assert.equal(x.kind,'session-boundary');assert.equal(x.missing,null);
});
test('unverified timestamps cannot be called consecutive candles',()=>{
 assert.equal(classifyGap(r(1000),r(1000),{provider:'coinbase',interval:'5m'}).kind,'unknown');
});
