import test from 'node:test';
import assert from 'node:assert/strict';
import {issueAndSettleLedger,ledgerMetrics} from '../lib/live-ledger.mjs';

const BASE=Date.parse('2026-09-27T11:50:00Z')/1000;
const ISSUE1='2026-09-27T11:55:05Z',ISSUE2='2026-09-27T12:00:05Z';
function sample(offset,close=100){return {time:BASE+offset,open:close,high:close*1.01,low:close*.99,close,volume:12}}
function snapshot(rows,forecast={open:101,high:102,low:99,close:100.5,volume:10,range:3,body:.5}){
 return {provider:'coinbase',symbol:'BTC-USD',meta:{interval:'5m'},
  session:{state:'OPEN'},quality:{integrity:{critical:false}},
  asOf:'2026-09-27T11:55:00Z',snapshot:{id:'market-data-sha-abc'},provenance:{provider:'Coinbase'},
  candles:rows,nextBar:{available:true,latestCompletedTime:rows.at(-1).time,forecast}};
}
test('first actual issued forecast keeps its original target and source identity',()=>{
 const x=issueAndSettleLedger([],snapshot([sample(0)]),ISSUE1);
 assert.equal(x.length,1);assert.equal(x[0].status,'PENDING');
 assert.equal(x[0].predicted.close,100.5);assert.equal(x[0].sourceIdentity,'market-data-sha-abc');
 const altered=snapshot([sample(0)],{open:200,high:220,low:120,close:210,volume:50});
 const y=issueAndSettleLedger(x,altered,'2026-09-27T11:56:00Z');
 assert.equal(y.length,1);assert.equal(y[0].predicted.close,100.5);
 assert.equal(y[0].issuedAt,ISSUE1);
});
test('next adjacent completed source bar settles earlier issuance without manual verification',()=>{
 const x=issueAndSettleLedger([],snapshot([sample(0)]),ISSUE1);
 const second=snapshot([sample(0),sample(300,102)]);second.asOf='2026-09-27T12:00:00Z';
 const y=issueAndSettleLedger(x,second,ISSUE2);
 assert.equal(y.length,2);assert.equal(y[0].status,'SETTLED');assert.equal(y[0].observed.close,102);
 assert.equal(y[0].actualTime,BASE+300);assert.ok(y[0].absErrorPct.close>0);
 assert.equal(y[1].status,'PENDING');
 const k=ledgerMetrics(y,'coinbase','BTC-USD','5m');
 assert.equal(k.issued,2);assert.equal(k.settled,1);assert.equal(k.pending,1);
});
test('historical replay, stale source data and failed market integrity never issue live records',()=>{
 const d=snapshot([sample(0)]);
 d.nextBar.latestCompletedTime=BASE+300;
 assert.equal(issueAndSettleLedger([],d,ISSUE1).length,0);
 d.nextBar.latestCompletedTime=BASE;
 d.quality.integrity.critical=true;
 assert.equal(issueAndSettleLedger([],d,ISSUE1).length,0);
 d.quality.integrity.critical=false;
 d.meta.referenceValueOnly=true;
 assert.equal(issueAndSettleLedger([],d,ISSUE1).length,0);
 d.meta.referenceValueOnly=false;
 d.nextBar.available=false;
 assert.equal(issueAndSettleLedger([],d,ISSUE1).length,0);
 d.nextBar.available=true;
 assert.equal(issueAndSettleLedger([],d,'2026-09-27T13:00:00Z').length,0);
 assert.equal(issueAndSettleLedger([],d,'2026-09-27T11:52:00Z').length,0);
});
test('two instruments cannot settle from one another source history',()=>{
 const existing=issueAndSettleLedger([],snapshot([sample(0)]),ISSUE1);
 const incorrect=snapshot([sample(0),sample(300)]);
 incorrect.symbol='ETH-USD';
 incorrect.asOf='2026-09-27T12:00:00Z';
 const result=issueAndSettleLedger(existing,incorrect,ISSUE2);
 assert.equal(result[0].status,'PENDING');
 assert.equal(result[1].symbol,'ETH-USD');
});
test('a corrected source cannot rewrite already settled original observed outcome',()=>{
 const x=issueAndSettleLedger([],snapshot([sample(0)]),ISSUE1);
 const second=snapshot([sample(0),sample(300,102)]);second.asOf='2026-09-27T12:00:00Z';
 const y=issueAndSettleLedger(x,second,ISSUE2);
 const corrected=snapshot([sample(0),sample(300,105)]);corrected.asOf='2026-09-27T12:00:00Z';
 const z=issueAndSettleLedger(y,corrected,ISSUE2);
 assert.equal(z[0].observed.close,102);
 assert.equal(z[0].predicted.close,100.5);
});
test('missing intermediate crypto bars cannot masquerade as one next five-minute bar',()=>{
 const x=issueAndSettleLedger([],snapshot([sample(0)]),ISSUE1);
 const z=issueAndSettleLedger(x,snapshot([sample(0),sample(600,105)]),'2026-09-27T12:05:05Z');
 assert.equal(z[0].status,'PENDING');
 assert.equal(z[0].observed,null);
});
test('a bar missing its issuance origin in a truncated chart cannot settle that record',()=>{
 const x=issueAndSettleLedger([],snapshot([sample(0)]),ISSUE1);
 const z=issueAndSettleLedger(x,snapshot([sample(300),sample(600,105)]),'2026-09-27T12:05:05Z');
 assert.equal(z[0].status,'PENDING');
});
