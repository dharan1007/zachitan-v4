import MarketLab from '@/app/components/MarketLab';
import SipLab from '@/app/components/SipLab';
import Footer from '@/app/components/Footer';

export default function Markets(){return <div className="page">
 <div className="sectionHead"><div><p className="eyebrow">Multi-asset research lab · V6 qualification</p><h2>Markets, funds, FX, futures and options</h2></div><p>Observed data stays separate from experimental forecasts. Numeric targets publish only after chronological walk-forward checks and a later untouched holdout both beat their naïve baselines, with no active recent-skill drift; otherwise the target is withheld.</p></div>
 <div className="notice" style={{marginBottom:16}}><b>V6 publication contract.</b> The untouched holdout is not used to tune model weights or probability calibration. A weak, insufficient, or drifting holdout forces research-only or abstain behavior rather than a numeric target.</div>
 <MarketLab/><SipLab/><Footer/>
 </div>}
