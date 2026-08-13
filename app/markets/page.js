import MarketLab from '@/app/components/MarketLab';
import SipLab from '@/app/components/SipLab';
import Footer from '@/app/components/Footer';
export default function Markets(){return <div className="page"><div className="sectionHead"><div><p className="eyebrow">Multi-asset research lab</p><h2>Markets, funds, FX, futures and options</h2></div><p>One research surface with source timing, numeric forecasts, evidence, validation and explicit gaps. Use the interactive chart to pan, zoom and change observation size or history.</p></div><MarketLab/><SipLab/><Footer/></div>}
