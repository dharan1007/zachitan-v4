export default function SourceStatus({provider,state='CONNECTED',label}){
 const icon=state==='CONNECTED'?'●':state==='DEGRADED'?'△':state==='CHECKING'?'◌':state==='GATED'?'○':'○';
 return <span className={`sourcePill ${state}`}>{icon} {label||provider}</span>
}
