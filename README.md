# Zachitan v4.1 Research Beta

Zachitan is a source-first, multi-asset market research terminal. It combines real provider data, transparent provenance, experimental empirical forecasts, walk-forward validation, world-state evidence, news clustering, filings research, watchlists, and recurring-investment analysis.

## What Zachitan is

- A research terminal for crypto, stocks, ETFs, indices, futures, FX, mutual funds, options where public upstream access permits, and supporting world/evidence feeds.
- A provenance-first system: observed, inferred, experimental, degraded, gated, and unavailable states remain separate.
- An experimental empirical forecasting engine based on comparable historical market states and their later outcomes.
- A validation-first product: forecast outputs expose whether they beat simple baselines on the currently available chronological validation window.

## What Zachitan is not

- It is not a guaranteed price predictor.
- It does not claim that an evidence score is forecast accuracy.
- It does not fabricate live quotes, option chains, filings, intraday NAVs, or missing licensed data.
- News, macro, physical events, cyber data, and microstructure are not silently injected into a price model until target-specific incremental predictive value is demonstrated.
- It does not execute trades or provide individualized financial advice.

## Forecast methodology

The current public engine is intentionally inspectable because this repository is public. The model:

1. validates chronological OHLC observations;
2. constructs a market-state feature vector from returns, volatility, RSI, moving-average distance, ATR, volume anomaly, and rolling range position;
3. robustly scales historical states;
4. finds historically similar regimes;
5. diversifies neighbours in time so adjacent, highly dependent observations do not dominate;
6. weights outcomes by similarity and recency;
7. reduces effective sample size for temporal clustering;
8. builds weighted empirical future-return distributions;
9. reports a center path, directional probability, and uncertainty intervals;
10. validates historical forecasts only against observations that occurred later.

### Validation outputs

Validation origins are separated by at least the forecast horizon to reduce overlapping-target leakage. The API reports:

- mean/median forecast error;
- MASE-like error ratio against an unchanged-price baseline;
- error skill versus unchanged price;
- direction accuracy;
- momentum-direction baseline accuracy;
- Brier score and Brier skill versus a 50/50 probability baseline;
- log loss;
- selective high-confidence accuracy/coverage;
- empirical 50/80/90% interval coverage and mean width.

A forecast with no positive baseline skill is explicitly labelled as such. Calibration is `N/A` when there is insufficient validation; Zachitan does not manufacture a numeric fallback score.

## Data providers

| Provider | Use | Timing / limitation |
|---|---|---|
| Coinbase Exchange | Crypto ticker, candles, book, trades | Exchange-native public market data |
| Yahoo Finance public endpoints | Stocks, ETFs, indices, futures, FX, funds, best-effort options | May be delayed; undocumented publisher transport; not an exchange entitlement |
| AMFI | Indian mutual-fund latest NAV and recent official history | End-of-day NAV |
| MFAPI | Long historical Indian mutual-fund transport | Mirror; latest value cross-checked to AMFI |
| ECB | Official FX reference rates | Business-day reference rate, not executable dealer quote |
| Open-Meteo | Weather context | Forecast/model source |
| World Bank | Macro/development data | Slow-moving official/compiled series |
| U.S. Treasury | Treasury yield curve | Business-day official data |
| USGS / NASA EONET | Earth and natural-event context | Event feeds |
| NIST NVD / CISA KEV | Cyber-risk evidence | Government/public feeds |
| NOAA SWPC | Space-weather evidence | Physical context only |
| SEC EDGAR | Company filings | Automated connector remains gated until a real operator contact is configured |

See the in-product source ledger for current provider state and rights notes.

## Reliability engineering

v4.1 adds explicit provider contracts so module/API interface drift fails tests instead of production. HTTP requests use timeouts, retry only retryable failures, coalesce identical in-flight upstream requests, and preserve source-specific caches. The public API has lightweight per-action abuse limits. Market polling uses one request at a time, cancellation, visibility awareness, and cleanup.

Forecast timestamps avoid false precision: continuous markets may receive estimated wall-clock checkpoints; daily/reference series use weekday business-day estimates; non-continuous intraday markets may remain observation-indexed instead of pretending overnight or closed-session bars exist.

## Tests and release gate

Run:

```bash
npm install
npm test
npm run build
```

or:

```bash
npm run verify
```

GitHub Actions runs the full test suite and production build on pushes and pull requests. Tests include forecast mathematics, non-overlapping validation, baseline-skill metrics, flat-market RSI behavior, provider contract/module loading, news clustering/source diversity, microstructure calculations, and recurring-investment/XIRR/drawdown semantics.

## Local development

Requires Node 24.x.

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

Optional environment variable:

```text
SEC_EDGAR_CONTACT="Your Name your-email@example.com"
```

Use a real operator identity if enabling automated SEC access.

## Release truth contract

A release is not considered healthy because the UI renders or a small unit suite passes. The minimum gate is:

1. provider contracts load;
2. all unit/analytics tests pass;
3. `next build` succeeds;
4. production health endpoint responds;
5. representative market/search/world/news routes return structured responses;
6. no forecast is marketed as accurate unless independent out-of-sample benchmark evidence supports that claim.

See `VALIDATION_PROTOCOL.md` for the research acceptance standard.
