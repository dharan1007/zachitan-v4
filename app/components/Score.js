export default function Score({value,title='Evidence score',copy='How much usable historical evidence supports this forecast.'}){
 const available=Number.isFinite(Number(value));
 const v=available?Math.max(0,Math.min(100,Math.round(Number(value)))):null;
 return <div className="scoreBox"><div className="scoreRing" style={{background:available?`conic-gradient(#111 ${v*3.6}deg,#ecece7 0)`:'#ecece7',border:0}}><div style={{width:62,height:62,borderRadius:'50%',background:'#fff',display:'grid',placeItems:'center'}}><b>{available?v:'N/A'}</b></div></div><div><h3>{title}</h3><p>{copy}</p></div></div>
}
