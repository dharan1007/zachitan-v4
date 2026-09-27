// Dedicated-host durable evidence log; NEVER run this on ephemeral Vercel storage.
// The log is append-only with per-event SHA-256 chaining and fsync. The original
// issuance is never mutated. A chain hash detects accidental corruption but does
// NOT establish externally anchored, tamper-proof compliance evidence.
import {openSync,closeSync,readFileSync,writeSync,fsyncSync,existsSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {issueAndSettleLedger} from './live-ledger.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const ZERO='0'.repeat(64);
export function readDurableLedger(file) {
 if(!isAbsolute(file)||!existsSync(dirname(file)))throw Error('Specify an absolute ledger file on an existing persistent volume.');
 if(!existsSync(file))return {events:[],rows:[],head:ZERO};
 const source=readFileSync(file,'utf8');
 if(source&&!source.endsWith('\n'))throw Error('Truncated journal: refusing to invent, erase or silently repair evidence.');
 const events=[],index=new Map();
 let head=ZERO;
 for(const line of source.split('\n').filter(Boolean)){
  let record;
  try{record=JSON.parse(line)}catch{throw Error('Corrupt journal JSON; fail closed.')}
  if(!Number.isSafeInteger(record?.sequence)||record.sequence!==events.length+1||record.previous!==head)throw Error('Journal sequence/hash-chain mismatch.');
  const expected=hash(record.sequence+'|'+record.previous+'|'+JSON.stringify(record.event));
  if(expected!==record.hash)throw Error('Journal payload mismatch.');
  const event=record.event;
  if(event?.type==='ISSUE'){
   if(!event.row?.id||event.row.status!=='PENDING'||index.has(event.row.id))throw Error('Duplicate/invalid original issuance');
   index.set(event.row.id,event.row);
  }else if(event?.type==='SETTLE'){
   const original=index.get(event.id);
   if(!original||original.status!=='PENDING'||!event.settlement||event.settlement.status!=='SETTLED')
    throw Error('Duplicate/invalid settlement');
   if(event.settlement.id!==original.id||JSON.stringify(event.settlement.predicted)!==JSON.stringify(original.predicted))
    throw Error('Settlement attempted to replace an original forecast');
   index.set(event.id,event.settlement);
  }else throw Error('Unknown audit event type');
  events.push(record);head=record.hash;
 }
 return {events,rows:[...index.values()],head};
}
export function persistDurableSnapshot(file,snapshot,issuedAt=null){
 if(process.env.VERCEL)throw Error('Durable ledger requires a dedicated persistent process; Vercel local files are ephemeral.');
 const state=readDurableLedger(file),before=new Map(state.rows.map(r=>[r.id,r]));
 // Keep each symbol/interval isolated: the browser's 300-row convenience cap
 // must not starve another instrument's pending outcome.
 const relevant=state.rows.filter(r=>r.provider===snapshot?.provider&&r.symbol===snapshot?.symbol&&r.interval===snapshot?.meta?.interval);
 const after=issueAndSettleLedger(relevant,snapshot,issuedAt);
 // A settlement and a new next-bar issuance are distinct, auditable events.
 const changed=after.filter(r=>!before.has(r.id)||before.get(r.id).status!==r.status);
 const events=changed.map(row=>before.has(row.id)
  ?{type:'SETTLE',id:row.id,settlement:row}
  :{type:'ISSUE',row});
 // Already seen records can never be silently modified through another path.
 for(const row of after){
  const original=before.get(row.id);
  if(original?.status==='SETTLED'&&JSON.stringify(original)!==JSON.stringify(row))
   throw Error('Settled market evidence is immutable');
 }
 let head=state.head,sequence=state.events.length;
 const fd=openSync(file,'a',0o600);
 try{
  for(const event of events){
   const record={sequence:++sequence,previous:head,event};
   record.hash=hash(record.sequence+'|'+record.previous+'|'+JSON.stringify(event));
   const encoded=JSON.stringify(record)+'\n';
   const bytes=Buffer.from(encoded);
   let offset=0;
   while(offset<bytes.length)offset+=writeSync(fd,bytes,offset,bytes.length-offset);
   fsyncSync(fd);head=record.hash;
  }
 }finally{closeSync(fd)}
 return {issued:events.filter(e=>e.type==='ISSUE').length,settled:events.filter(e=>e.type==='SETTLE').length,
  records:state.rows.length+events.filter(e=>e.type==='ISSUE').length,head};
}
