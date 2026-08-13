'use client';
import {useMemo,useState} from 'react';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const level=(v,a=30,b=60)=>v>=b?'High':v>=a?'Medium':'Low';

export default function Playground(){
 const [price,setPrice]=useState(0),[vol,setVol]=useState(0),[liq,setLiq]=useState(0),[rates,setRates]=useState(0),[event,setEvent]=useState(0);
 const z=useMemo(()=>({
  ZI:Math.round(clamp(price*2.1-rates*.35-event*.15,-100,100)),
  ZS:Math.round(clamp(Math.abs(price)*.65+Math.abs(vol)*.8+Math.abs(event)*.65,0,100)),
  ZC:Math.round(clamp(72-Math.abs(vol)*.3-Math.abs(event)*.25-Math.abs(liq)*.2,0,100)),
  ZT:Math.round(clamp(Math.abs(liq)*1.1+Math.abs(vol)*.35,0,100)),
  ZF:Math.round(clamp(Math.abs(vol)*.75+Math.abs(liq)*.55+Math.abs(rates)*.3+Math.abs(event)*.45,0,100))
 }),[price,vol,liq,rates,event]);
 const scenario=Math.round(clamp(50+price*.18-rates*.08-event*.05-liq*.04,0,100));
 const reset=()=>{setPrice(0);setVol(0);setLiq(0);setRates(0);setEvent(0)};
 const controls=[
  {name:'Price shock',value:price,set:setPrice,min:-20,max:20,unit:'%',help:'Hypothetical immediate repricing of the selected market.'},
  {name:'Volatility regime',value:vol,set:setVol,min:-50,max:50,unit:'',help:'Moves the scenario from calmer conditions toward more unstable price variation.'},
  {name:'Liquidity stress',value:liq,set:setLiq,min:0,max:80,unit:'',help:'Represents harder execution, thinner depth and greater market-friction pressure.'},
  {name:'Rate shock',value:rates,set:setRates,min:-50,max:50,unit:' bp',help:'A hypothetical change in the interest-rate backdrop, expressed in basis points.'},
  {name:'Event pressure',value:event,set:setEvent,min:0,max:80,unit:'',help:'Adds non-price event pressure such as policy, geopolitical or company-specific disruption.'}
 ];
 const states=[
  {code:'ZI',name:'Directional pressure',value:z.ZI,help:'Net push of this sandbox scenario. Positive is upward, negative is downward.'},
  {code:'ZS',name:'Surprise load',value:z.ZS,help:'How unusual or disruptive the combined scenario has become.'},
  {code:'ZC',name:'Evidence confidence',value:z.ZC,help:'How much confidence remains in comparable evidence as conditions become more extreme.'},
  {code:'ZT',name:'Transmission stress',value:z.ZT,help:'How strongly liquidity and volatility stress may impair normal market transmission.'},
  {code:'ZF',name:'Fragility load',value:z.ZF,help:'A compact view of how vulnerable the scenario is to additional shocks.'}
 ];
 const direction=price>2?'Upward':price<-2?'Downward':'Mostly neutral';
 const narrative=`The scenario is ${direction.toLowerCase()}, with ${level(z.ZS).toLowerCase()} surprise pressure and ${level(z.ZF).toLowerCase()} fragility. Evidence confidence is ${z.ZC}/100. These values explain sensitivity only; they are not a market forecast.`;
 return <div className="playgroundLayout">
  <section className="card pad playgroundControls"><div className="playgroundIntro"><p className="eyebrow">Limited public controls</p><h3>Change assumptions. Read the consequences.</h3><p>This sandbox is intentionally simplified. It demonstrates relationships between shock, uncertainty, evidence and stress without exposing Zachitan's production transformations or weights.</p></div>
   <div className="scenarioControls">{controls.map(c=><div className="sliderRow" key={c.name}><label><span>{c.name}</span><b>{c.value>0?'+':''}{c.value}{c.unit}</b></label><input type="range" min={c.min} max={c.max} value={c.value} onChange={e=>c.set(+e.target.value)} aria-label={c.name}/><small className="sliderHelp">{c.help}</small></div>)}</div>
   <div className="playgroundActions"><button className="btn" onClick={reset}>Reset scenario</button><span>Only five public scenario controls are exposed.</span></div>
  </section>
  <section className="card pad playgroundOutput"><div className="scenarioHeadline"><div><p className="eyebrow">Scenario response</p><h3>{direction} pressure, {level(z.ZS).toLowerCase()} uncertainty load</h3></div><div className="balanceBadge"><span>Illustrative balance</span><b>{scenario}/100</b><small>Not a probability</small></div></div>
   <p className="scenarioNarrative">{narrative}</p>
   <div className="stateTiles">{states.map(x=><div className="stateTile" key={x.code}><div className="stateTitle"><span>{x.name}</span><code>{x.code}</code></div><b>{x.value}</b><small>{x.help}</small></div>)}</div>
   <div className="scenarioReadout"><div><span>Directional state</span><b>{direction}</b></div><div><span>Uncertainty pressure</span><b>{level(z.ZS)}</b></div><div><span>Evidence confidence</span><b>{z.ZC}/100</b></div><div><span>Transmission stress</span><b>{z.ZT}/100</b></div><div><span>Fragility</span><b>{z.ZF}/100</b></div></div>
   <div className="infoPanel"><b>What this means</b><p>A stronger directional story does not automatically mean a more reliable forecast. In this sandbox, larger shocks can simultaneously increase movement pressure, widen uncertainty and reduce confidence in comparable evidence. The production forecast is built from observed historical outcomes and validation, not from these slider values.</p></div>
  </section>
 </div>
}
