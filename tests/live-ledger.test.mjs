import test from 'node:test';
import assert from 'node:assert/strict';
import {issueAndSettleLedger,ledgerMetrics} from '../lib/live-ledger.mjs';

const BASE=Date.parse('2026-09-27T11:50:00Z')/1000;
const ISSUED='2026-09-27T11:55:05Z',SETTLE='2026-09-27T12:05:05Z';
function sample(offset,close=100){
 return {time:BASE+offset,open:close,high:close*1.01,low:close*.99,close,volume:12};
}
function snapshot(rows,forecast={open:101,high:102,low:99,close:100.5,volume:10,range:3,body:.5}){
 return {provider:'coinbase',symbol:'BTC-USD',meta:{interval:'5m'},
  session:{state:'OPEN'},quality:{integrity:{critical:false}},
  asOf:new Date((rows.at(-1).time+300)*1000).toISOString(),
  snapshot:{id:'source-sha-original'},provenance:{provider:'Coinbase'},
  candles:rows,nextBar:{available:true,horizonObservations:2,latestCompletedTime:rows.at(-1).time,forecast}};
}
test('source-open prediction is issued only before not-yet-open target, with immutable original values',()=>{
 const x=issueAndSettleLedger([],snapshot([sample(0)]),ISSUED);
 assert.equal(x.length,1);assert.equal(x[0].status,'PENDING');
 assert.equal(x[0].horizonObservations,2);
 assert.equal(x[0].expectedTime,BASE+600);
 assert.equal(x[0].predicted.close,100.5);assert.equal(x[0].sourceIdentity,'source-sha-original');
 const altered=snapshot([sample(0)],{open:200,high:220,low:120,close:210,volume:50});
 const y=issueAndSettleLedger(x,altered,'2026-09-27T11:56:00Z');
 assert.equal(y.length,1);assert.equal(y[0].predicted.close,100.5);assert.equal(y[0].issuedAt,ISSUED);
});
test('an intermediate bar cannot settle a two-step prediction; the actual completed target does',()=>{
 const x=issueAndSettleLedger([],snapshot([sample(0)]),ISSUED);
 const next=snapshot([sample(0),sample(300,102)]);
 const inProgress=issueAndSettleLedger(x,next,'2026-09-27T12:00:05Z');
 assert.equal(inProgress[0].status,'PENDING');
 const matured=snapshot([sample(0),sample(300,102),sample(600,104)]);
 const result=issueAndSettleLedger(inProgress,matured,SETTLE);
 assert.equal(result[0].status,'SETTLED');assert.equal(result[0].actualTime,BASE+600);
 assert.equal(result[0].observed.close,104);assert.equal(result[0].predicted.close,100.5);
 assert.ok(result[0].absErrorPct.close>0);
 const k=ledgerMetrics(result,'coinbase','BTC-USD','5m');
 assert.equal(k.settled,1);assert.equal(k.pending,2);
});
test('stale sources, already-open targets and integrity failures cannot masquerade as live',()=>{
 const d=snapshot([sample(0)]);
 d.nextBar.latestCompletedTime=BASE+300;assert.equal(issueAndSettleLedger([],d,ISSUED).length,0);
 d.nextBar.latestCompletedTime=BASE;d.quality.integrity.critical=true;
 assert.equal(issueAndSettleLedger([],d,ISSUED).length,0);
 d.quality.integrity.critical=false;d.meta.referenceValueOnly=true;
 assert.equal(issueAndSettleLedger([],d,ISSUED).length,0);
 d.meta.referenceValueOnly=false;d.nextBar.available=false;
 assert.equal(issueAndSettleLedger([],d,ISSUED).length,0);
 d.nextBar.available=true;
 assert.equal(issueAndSettleLedger([],d,'2026-09-27T12:00:00Z').length,0);
 assert.equal(issueAndSettleLedger([],d,'2026-09-27T13:00:00Z').length,0);
 assert.equal(issueAndSettleLedger([],d,'2026-09-27T11:52:00Z').length,0);
});
test('another product cannot settle existing BTC forecast',()=>{
 const existing=issueAndSettleLedger([],snapshot([sample(0)]),ISSUED);
 const other=snapshot([sample(0),sample(300),sample(600)]);
 other.symbol='ETH-USD';
 const x=issueAndSettleLedger(existing,other,SETTLE);
 assert.equal(x[0].status,'PENDING');assert.equal(x[0].symbol,'BTC-USD');
 assert.equal(x.at(-1).symbol,'ETH-USD');
});
test('revised publisher history never changes a previously settled forecast or original observation',()=>{
 const existing=issueAndSettleLedger([],snapshot([sample(0)]),ISSUED);
 const settled=issueAndSettleLedger(existing,snapshot([sample(0),sample(300),sample(600,104)]),SETTLE);
 const revision=issueAndSettleLedger(settled,snapshot([sample(0),sample(300),sample(600,125)]),SETTLE);
 assert.equal(revision[0].observed.close,104);
 assert.equal(revision[0].predicted.close,100.5);
});
test('missing intermediate crypto bars do not become synthetic two-step outcomes',()=>{
 const x=issueAndSettleLedger([],snapshot([sample(0)]),ISSUED);
 const after=snapshot([sample(0),sample(600,105)]);
 const result=issueAndSettleLedger(x,after,SETTLE);
 assert.equal(result[0].status,'PENDING');assert.equal(result[0].observed,null);
});
test('truncated source history cannot settle a target without its source origin',()=>{
 const x=issueAndSettleLedger([],snapshot([sample(0)]),ISSUED);
 const result=issueAndSettleLedger(x,snapshot([sample(300),sample(600,105)]),SETTLE);
 assert.equal(result[0].status,'PENDING');
});
