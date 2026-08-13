# Zachitan v4.0.0-beta.1 — Release Notes

Release date: 2026-08-08
Status: Public research beta

## What changed from v0.3.x

Zachitan v4 replaces the single-purpose crypto lab with a multi-asset research workspace and expands the world-state, evidence, validation, legal, and user-workflow surfaces.

### Multi-asset research
- Crypto: public Coinbase Exchange market feed, with live WebSocket updates where supported.
- Stocks, ETFs, indices, futures, FX and publisher-covered funds: broad chart/search transport through Yahoo publisher endpoints with explicit delayed/EOD/best-effort provenance.
- Indian mutual funds: latest NAV cross-check against AMFI's official NAV feed. Long historical series can use the MFAPI public mirror as transport when AMFI's all-scheme historical export is impractical; provenance exposes this distinction.
- ECB FX: official historical euro reference-rate CSV and cross-rate derivation. These are reference rates, not executable dealer quotes.
- Options: best-effort chain retrieval. If the public publisher path is unavailable, the product returns a DEGRADED state and no contracts rather than inventing strikes, greeks or prices.

### Forecast UX
- Numeric forecast center plus probability intervals.
- Five forward checkpoints with projected center, change, probability-up and interval information.
- Evidence and calibration scores.
- Effective historical sample size.
- Chronological walk-forward validation when sufficient history exists.
- Support/resistance and breakout/tail-risk context.
- High-confidence bands are withheld when evidence is insufficient.

### Native chart
- First-party canvas candlestick renderer.
- Drag-to-pan and wheel/pinch-style zoom behavior.
- Crosshair and OHLC inspection.
- Range and candle/timeframe controls.
- Fit/latest controls.
- Forecast path and interval band.
- Five forward checkpoint markers.
- Coinbase live current-candle update support.
- No TradingView embed is required for the native market research chart.

### World and evidence layer
- Open-Meteo weather.
- USGS earthquakes.
- NASA EONET natural events.
- World Bank indicators.
- U.S. Treasury yield curve.
- NIST NVD newly published CVEs.
- CISA Known Exploited Vulnerabilities.
- NOAA SWPC geomagnetic / solar-wind evidence.
- Fixed the prior NOAA solar-wind client shape error that caused `.join is not a function`.

### Research workflow
- Markets screen.
- World screen.
- News / filings research screen.
- Local watchlist with export.
- Limited public playground for scenario sensitivity.
- Public methodology explanation without publishing proprietary equations, weights or transforms.
- Source ledger.
- Local profile/preferences.
- Privacy, Terms and Beta/Research disclosures.

### Failure behavior
- SEC automated EDGAR access is GATED until a real operator contact is configured.
- News uses source fallback behavior and exposes degraded state instead of ordinary page-breaking 502s.
- Missing licensed exchange entitlements remain explicitly gated.
- No synthetic live prices are substituted for unavailable data.

## Verification
- Forecasting/unit suite: 8/8 passing at release freeze.
- Next.js production compiler previously verified all application routes for the v4 tree on Vercel.
- Public release remains a research beta; forecast outputs are uncertain and are not guarantees, execution instructions, or individualized financial advice.
