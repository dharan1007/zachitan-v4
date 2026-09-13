import { notFound } from 'next/navigation';
import Footer from '@/app/components/Footer';

const commercialMode = process.env.ZACHITAN_RUNTIME_MODE === 'commercial';
const onboardingUrl = process.env.NEXT_PUBLIC_ZACHITAN_ONBOARDING_URL || 'https://tally.so/r/OD6BP8?utm_source=zachitan&utm_campaign=workspace';
const bundleUrl = process.env.NEXT_PUBLIC_ZACHITAN_BUNDLE_URL || 'https://tally.so/r/OD6BP8?utm_source=zachitan&utm_campaign=bundle';

export const metadata = {
  title: 'Zachitan Research Workspace',
  description: 'Commercial research workspace for customer-supplied data, evidence and provenance.',
};

export default function Page(){
  if (!commercialMode) notFound();
  return <div className="page overviewPage">
  <section className="overviewHero">
    <div className="card heroMain overviewLead">
      <p className="eyebrow">Zachitan founding workspace</p>
      <h1 className="heroTitle">Research workflow built around data you are authorized to use.</h1>
      <p className="heroCopy">The commercial build focuses on customer-supplied datasets, evidence organization, provenance and reproducible research. Its general third-party provider route is disabled, so the product is not silently redistributing research feeds from the public beta.</p>
      <div className="pillRow heroActions"><a className="btn primary" href={onboardingUrl}>Founding workspace · ₹2,999</a><a className="btn" href={bundleUrl}>Zachitan + Stanius · ₹9,999</a><a className="btn" href="/legal/data-rights">Data rights</a></div>
    </div>
    <aside className="card overviewVisual"><div className="visualTop"><span>COMMERCIAL CONTRACT</span><b>BYOD → evidence → research</b></div><p className="visualNote">No brokerage, order routing, personalized buy/sell/hold calls, guaranteed returns or guaranteed future prices.</p></aside>
  </section>

  <section className="section"><div className="sectionHead"><div><p className="eyebrow">Founding deliverable</p><h2>What the first customers actually receive</h2></div><p>Start with a service-backed workspace rather than paying for complex subscription infrastructure before demand exists.</p></div><div className="grid3">
    <div className="card pad"><h3>BYOD setup</h3><p className="bodycopy">Normalize customer-supplied market histories through the provider-free BYOD endpoint and preserve source metadata.</p></div>
    <div className="card pad"><h3>Research workspace</h3><p className="bodycopy">Use Zachitan's evidence, provenance, comparison, watchlist and research surfaces where the underlying data is permitted for the intended use.</p></div>
    <div className="card pad"><h3>Stanius handoff</h3><p className="bodycopy">Move forecasting or strategy questions into Stanius when they need quantitative validation, baseline comparison and uncertainty diagnostics.</p></div>
  </div></section>

  <section className="section"><div className="card pad"><p className="eyebrow">Commercial boundary</p><h3>Software access is not a promise of investment performance.</h3><p className="bodycopy">Forecasting remains experimental research functionality. The paid value proposition is research workflow, data handling, provenance and validation—not security-specific paid trading calls. Customers remain responsible for the rights to data they upload or connect.</p></div></section>
  <Footer/>
</div>}
