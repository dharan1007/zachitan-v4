import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {persistDurableSnapshot,readDurableLedger} from '../lib/durable-live-ledger.mjs';

const BASE=Date.parse('2026-09-27T11:50:00Z')/1000;
const time1='2026-09-27T11:55:05Z',time2='2026-09-27T12:00:05Z';
const sample=(n,close=100)=>({time:BASE+n,open:close,high:close+2,low:close-2,close,volume:20});
function snapshot(bars,{asOf='2026-09-27T11:55:00Z',visible=null}={}){
 return {provider:'coinbase',symbol:'BTC-USD',meta:{interval:'5m'},session:{state:'REGULAR'},
  quality:{integrity:{critical:false}},asOf,provenance:{provider:'Coinbase'},
  snapshot:{id:'a-real-input-digest-for-this-deterministic-test-fixture'},
  candles:visible||bars,ledgerCandles:bars,nextBar:{available:true,latestCompletedTime:bars.at(-1).time,
   forecast:{open:101,high:103,low:99,close:100.5,volume:22,range:4,body:0.5}}};
}
function fileFor(t){const dir=mkdtempSync(join(tmpdir(),'zachitan-ledger-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return join(dir,'ledger.jsonl')}

test('original issuance is append-only, deduplicated and verified when replayed',t=>{
 const file=fileFor(t),source=snapshot([sample(0)]);
 assert.equal(readDurableLedger(file).events.length,0);
 const first=persistDurableSnapshot(file,source,time1);
 assert.equal(first.issued,1);
 assert.equal(first.settled,0);
 const repeat=persistDurableSnapshot(file,source,time1);
 assert.equal(repeat.issued,0);
 const state=readDurableLedger(file);
 assert.equal(state.events.length,1);
 assert.equal(state.rows[0].predicted.close,100.5);
 assert.equal(state.head,first.head);
});

test('a separately published next real bar settles the earlier forecast without rewriting it',t=>{
 const file=fileFor(t),first=snapshot([sample(0)]);
 persistDurableSnapshot(file,first,time1);
 const second=snapshot([sample(0),sample(300,102)],{
  asOf:'2026-09-27T12:00:00Z',visible:[sample(300,102)],
 });
 const updated=persistDurableSnapshot(file,second,time2);
 assert.equal(updated.settled,1);
 assert.equal(updated.issued,1);
 const journal=readDurableLedger(file);
 assert.equal(journal.events.length,3);
 assert.equal(journal.rows[0].status,'SETTLED');
 assert.equal(journal.rows[0].predicted.close,100.5);
 assert.equal(journal.rows[0].observed.close,102);
 assert.ok(journal.rows[0].absErrorPct.close>0);
 assert.equal(persistDurableSnapshot(file,second,time2).settled,0);
});

test('a tampered forecast or truncated last event stops evidence processing',t=>{
 const file=fileFor(t);
 persistDurableSnapshot(file,snapshot([sample(0)]),time1);
 const source=readFileSync(file,'utf8');
 writeFileSync(file,source.replace('"close":100.5','"close":999'));
 assert.throws(()=>readDurableLedger(file),/payload mismatch/i);
 writeFileSync(file,source.slice(0,-1));
 assert.throws(()=>readDurableLedger(file),/Truncated journal/i);
});

test('non-absolute storage and absent persistent directory are rejected',()=>{
 assert.throws(()=>readDurableLedger('./relative.txt'),/absolute ledger/i);
 assert.throws(()=>readDurableLedger('/definitely-not-present-zachitan/x/journal.jsonl'),/absolute ledger/i);
});
