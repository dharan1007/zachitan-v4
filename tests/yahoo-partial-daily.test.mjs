import test from 'node:test';
import assert from 'node:assert/strict';
import {isUnfinishedYahooDailyBar} from '../lib/market-data-v6.mjs';
const sec=s=>Date.parse(s)/1000;

test('current exchange-local daily bar remains unfinished during US regular session',()=>{
 const now=sec('2026-09-25T14:35:00Z');
 const meta={marketState:'REGULAR',timezone:'America/New_York'};
 assert.equal(isUnfinishedYahooDailyBar(sec('2026-09-25T04:00:00Z'),meta,now),true);
 assert.equal(isUnfinishedYahooDailyBar(sec('2026-09-24T04:00:00Z'),meta,now),false);
 assert.equal(isUnfinishedYahooDailyBar(sec('2026-09-25T04:00:00Z'),{...meta,marketState:'POST'},now),false);
});
test('Indian local trading date is determined by the exchange timezone, not UTC midnight',()=>{
 const meta={marketState:'REGULAR',timezone:'Asia/Kolkata'};
 const now=sec('2026-09-25T06:00:00Z');
 assert.equal(isUnfinishedYahooDailyBar(sec('2026-09-24T19:00:00Z'),meta,now),true);
 assert.equal(isUnfinishedYahooDailyBar(sec('2026-09-24T03:00:00Z'),meta,now),false);
});
test('missing source timestamp and closed sessions cannot remove a valid completed bar',()=>{
 assert.equal(isUnfinishedYahooDailyBar(null,{marketState:'REGULAR',timezone:'UTC'},sec('2026-09-25T12:00:00Z')),false);
 assert.equal(isUnfinishedYahooDailyBar(sec('2026-09-25T00:00:00Z'),{marketState:'CLOSED',timezone:'UTC'},sec('2026-09-25T12:00:00Z')),false);
});
