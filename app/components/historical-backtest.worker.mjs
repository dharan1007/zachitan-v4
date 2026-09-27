import {auditNextBar} from '../../lib/next-bar-audit.mjs';
// Dedicated browser worker. Never opens a connection or triggers a server job.
self.onmessage=event=>{
 const {candles,depth,provider,interval,requestId}=event.data||{};
 try {
  const result=auditNextBar(candles,{maxChecks:depth,provenance:provider,interval});
  self.postMessage({requestId,result});
 } catch(e){
  self.postMessage({requestId,error:String(e?.message||e)});
 }
};
