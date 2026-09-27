#!/usr/bin/env node
// Optional dedicated-host 24/7 worker. It NEVER uses GitHub Actions, Vercel
// cron, a Vercel Edge Function, or Vercel API calls. It must run on a permanent
// host with a persistent mounted ledger volume and a supervisor.
// Coinbase only until independently entitled live data sources are provisioned.
import {openSync,closeSync,unlinkSync,writeSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {buildMarketDataV6} from '../lib/market-data-v6.mjs';
import {persistDurableSnapshot,readDurableLedger} from '../lib/durable-live-ledger.mjs';
import {safeProduct} from '../lib/providers/coinbase.mjs';

const steps={'1m':60,'5m':300,'15m':900,'1h':3600,'6h':21600,'1d':86400};
const ledger=process.env.ZACHITAN_LEDGER_PATH;
if(process.env.VERCEL||!ledger||!isAbsolute(ledger))throw Error('Requires a separate persistent host and ZACHITAN_LEDGER_PATH=/persistent/volume/ledger.jsonl');
readDurableLedger(ledger);
const symbols=(process.env.ZACHITAN_WORKER_SYMBOLS||'BTC-USD').split(',').map(s=>s.trim().toUpperCase());
const intervals=(process.env.ZACHITAN_WORKER_INTERVALS||'5m').split(',').map(s=>s.trim());
if(!symbols.length||symbols.length>4||symbols.some(s=>safeProduct(s)!==s))throw Error('Configure 1–4 valid Coinbase instrument IDs.');
if(!intervals.length||intervals.length>4||intervals.some(i=>!steps[i]))throw Error('Configure 1–4 exchange-native intervals.');
// Refuse multiple writers instead of silently producing duplicate issuance.
const lock=ledger+'.lock';const lockHandle=openSync(lock,'wx',0o600);
writeSync(lockHandle,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()})+'\n');
const done=new Map();
let running=false,stopped=false;
async function poll(){
 if(stopped||running)return;
 running=true;
 try{
  for(const interval of intervals)for(const symbol of symbols){
   if(stopped)break;
   const name=symbol+'|'+interval;
   // Recheck after each actual interval closes. A fifteen-second publication
   // grace avoids asking for a still-forming OHLC candle as settled evidence.
   const completedWindow=Math.floor((Date.now()-15000)/(steps[interval]*1000));
   if(done.get(name)===completedWindow)continue;
   try{
    const source=await buildMarketDataV6({provider:'coinbase',symbol,interval,range:'5d',horizon:1});
    if(!source.nextBar?.available)throw Error(source.nextBar?.reason||'No eligible completed candle.');
    const result=persistDurableSnapshot(ledger,source);
    done.set(name,completedWindow);
    process.stdout.write(JSON.stringify({at:new Date().toISOString(),provider:'coinbase',symbol,interval,
     latestCompletedTime:source.nextBar.latestCompletedTime,issued:result.issued,
     settled:result.settled,totalIssued:result.records,head:result.head})+'\n');
   }catch(error){
    process.stderr.write(JSON.stringify({at:new Date().toISOString(),symbol,interval,
     status:'SOURCE_OR_EVIDENCE_FAILED',error:error.message})+'\n');
    // Do not advance cursor: retry on next minute, but still refuse to issue
    // if the source has already become too late for the following outcome.
   }
  }
 }finally{running=false}
}
const timer=setInterval(poll,60000);
function stop(){stopped=true;clearInterval(timer);if(!running){closeSync(lockHandle);unlinkSync(lock);process.exit(0)}}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
process.stdout.write(JSON.stringify({startedAt:new Date().toISOString(),mode:'independent_host',
 instruments:symbols,intervals,ledger,readiness:'requires externally running host; no Vercel deployment'})+'\n');
await poll();
