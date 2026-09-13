import { RELEASE_VERSION } from '@/lib/release.mjs';

const commercialMode = process.env.ZACHITAN_RUNTIME_MODE === 'commercial';

export default function Footer(){return <footer className="footer"><span>Zachitan {RELEASE_VERSION} · experimental research platform</span><span>{commercialMode && <><a href="/commercial">Commercial workspace</a> · </>}<a href="/sources">Sources</a> · <a href="/methodology">Methodology</a> · <a href="/legal/data-rights">Data rights</a> · {commercialMode && <><a href="/legal/refunds">Refunds</a> · </>}<a href="/legal/privacy">Privacy</a> · <a href="/legal/terms">Terms</a> · <a href="/legal/beta">Beta disclosure</a></span></footer>}
