import test from 'node:test';
import assert from 'node:assert/strict';
import {OPPORTUNITY_UNIVERSE,evaluateOpportunity,wilsonLower} from '../lib/opportunity-screen.mjs';
function candles(n=525,rate=.0018){
 let price=100;
 const out=[];
 for(let i=0;i<n;i++){
  const open=price,close=open*Math.exp(rate);
  out.push({time:1700000000+i*86400,open,close,high:Math.max(open,close)*1.003,
   low:Math.min(open,close)*.997,volume:2000});
  price=close;
 }
 return out;
}
test('group source work is bounded to three curated symbols and covers stocks forex and indices',()=>{
 assert.ok(Object.values(OPPORTUNITY_UNIVERSE).every(entries=>entries.length<=3));
 for(const k of ['India','Technology','Energy','Financials','Healthcare','Forex','India indices','US indices','Crypto','Commodities'])assert.ok(OPPORTUNITY_UNIVERSE[k].length);
});
test('no model result when daily history is too short',()=>{
 const r=evaluateOpportunity(candles(90),{symbol:'TEST'});
 assert.equal(r.available,false);assert.match(r.reason,/insufficient/i);
});
test('trend result scores only matured five-session next-open outcomes, not future incomplete bars',()=>{
 const rows=candles();
 const r=evaluateOpportunity(rows,{symbol:'TEST',name:'Test',assetClass:'stock',currency:'USD',source:'test'});
 assert.equal(r.available,true);
 assert.equal(r.currentSignal,'UP');
 assert.ok(r.testedSignalChecks>=20);
 assert.ok(r.historicalWinRate>0.5);
 assert.ok(r.wilsonLower95<=r.heldoutWinRate);
 assert.ok(r.heldoutChecks>=20);
 assert.ok(r.heldoutChecks<r.testedSignalChecks);
 assert.ok(Number.isFinite(r.heldoutMeanGrossReturnPct));
 assert.equal(r.institutionalConsensus,'NOT_CONNECTED');
 assert.ok(r.lastCompletedTime===rows.at(-1).time);
 assert.equal(r.historicalHorizonDays,5);
 assert.ok(r.referenceStop<r.referenceEntry);
 assert.ok(r.referenceTarget>r.referenceEntry);
});
test('unqualified historical model cannot be represented as a reliable profitable trade',()=>{
 const x=candles(160);
 const r=evaluateOpportunity(x,{symbol:'TEST',assetClass:'stock'});
 assert.equal(r.qualified,false);
 assert.ok(['UNQUALIFIED','NO_SIGNAL'].includes(r.status));
});
test('index cannot be presented as an executable share or direct contract',()=>{
 const r=evaluateOpportunity(candles(),{symbol:'^TEST',assetClass:'index'});
 assert.equal(r.tradable,false);
});
test('confidence calculation is sample-sensitive and does not invent certainty',()=>{
 assert.equal(wilsonLower(0,0),null);
 assert.ok(wilsonLower(3,5)<wilsonLower(300,500));
 assert.ok(wilsonLower(20,20)<1);
});
test('future daily bars do not influence a prefix-only historical screen',()=>{
 const rows=candles(500),before=evaluateOpportunity(rows.slice(0,495),{symbol:'TEST'});
 const changed=rows.map(x=>({...x}));
 changed[499]={...changed[499],close:5000,high:5100,low:95};
 const after=evaluateOpportunity(changed.slice(0,495),{symbol:'TEST'});
 assert.deepEqual(after,before);
});
