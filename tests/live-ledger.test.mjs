import test from 'node:test';
import assert from 'node:assert/strict';
import {issueAndSettleLedger,ledgerMetrics} from '../lib/live-ledger.mjs';
function sample(time,close=100){return {time,open:close,high:close*1.01,low:close*.99,close,volume:12}}
function snapshot(rows,forecast={open:101,high:102,low:99,close:100.5,volume:10,range:3,body:.5}){
 return {provider:'coinbase',symbol:'BTC-USD',meta:{interval:'5m'},quality:{integrity:{critical:false}},
  asOf:'2026-09-27T12:00:00Z',snapshot:{id:'market-data-sha-abc'},provenance:{provider:'Coinbase'},
  candles:rows,nextBar:{available:true,latestCompletedTime:rows.at(-1).time,forecast}};
}
test('first actual issued forecast has immutable original target and source identity',()=>{
 const x=issueAndSettleLedger([],snapshot([sample(300)]),'2026-09-27T12:00:00Z');
 assert.equal(x.length,1);assert.equal(x[0].status,'PENDING');
 assert.equal(x[0].predicted.close,100.5);assert.equal(x[0].sourceIdentity,'market-data-sha-abc');
 const altered=snapshot([sample(300)],{open:200,high:220,low:120,close:210,volume:50});
 const y=issueAndSettleLedger(x,altered,'2026-09-27T12:02:00Z');
 assert.equal(y.length,1);assert.equal(y[0].predicted.close,100.5);
 assert.equal(y[0].issuedAt,'2026-09-27T12:00:00Z');
});
test('a new completed bar automatically settles earlier issued candle and logs a new one',()=>{
 const x=issueAndSettleLedger([],snapshot([sample(300)]));
 const y=issueAndSettleLedger(x,snapshot([sample(300),sample(600,102)]));
 assert.equal(y.length,2);assert.equal(y[0].status,'SETTLED');assert.equal(y[0].observed.close,102);
 assert.equal(y[0].actualTime,600);assert.ok(y[0].absErrorPct.close>0);
 assert.equal(y[1].status,'PENDING');
 const k=ledgerMetrics(y,'coinbase','BTC-USD','5m');
 assert.equal(k.issued,2);assert.equal(k.settled,1);assert.equal(k.pending,1);
});
test('quotes, historical reconstruction and failed source integrity never issue as-issued records',()=>{
 const d=snapshot([sample(300)]);
 d.nextBar.latestCompletedTime=600;
 assert.equal(issueAndSettleLedger([],d).length,0);
 d.nextBar.latestCompletedTime=300;
 d.quality.integrity.critical=true;
 assert.equal(issueAndSettleLedger([],d).length,0);
 d.quality.integrity.critical=false;
 d.meta.referenceValueOnly=true;
 assert.equal(issueAndSettleLedger([],d).length,0);
 d.meta.referenceValueOnly=false;
 d.nextBar.available=false;
 assert.equal(issueAndSettleLedger([],d).length,0);
});
test('prior symbols and intervals cannot settle from a different market',()=>{
 const existing=issueAndSettleLedger([],snapshot([sample(300)]));
 const incorrect=snapshot([sample(300),sample(600)],undefined);
 incorrect.symbol='ETH-USD';
 const result=issueAndSettleLedger(existing,incorrect);
 assert.equal(result[0].status,'PENDING');
 assert.equal(result[1].symbol,'ETH-USD');
});
test('a source correction cannot retrospectively overwrite the original settled outcome',()=>{
 const x=issueAndSettleLedger([],snapshot([sample(300)]));
 const y=issueAndSettleLedger(x,snapshot([sample(300),sample(600,102)]));
 const z=issueAndSettleLedger(y,snapshot([sample(300),sample(600,105)]));
 assert.equal(z[0].observed.close,102);
 assert.equal(z[0].predicted.close,100.5);
});
