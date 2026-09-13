# Zachitan v4.2.0-beta.1 — Prediction Integrity and Runtime Efficiency

Release candidate date: 2026-09-13
Status: verification candidate

This release is a correctness-first response to observed false precision, jump sensitivity, off-hours forecasting, broken/duplicated market points, noisy search/UI behavior, and excessive Vercel Hobby runtime consumption. It intentionally prefers abstention over publishing a numeric target that has not passed session, regime, and walk-forward skill gates.

## Forecast publication gates

- Added robust terminal-regime diagnostics using recent return dispersion, ATR scale, absolute move size, and volume context.
- Extreme out-of-distribution jumps now force `ABSTAIN`; Zachitan keeps uncertainty evidence but withholds the center price and point path.
- A forecast with measured non-positive point or probability skill versus naïve baselines now forces `ABSTAIN` instead of displaying a target anyway.
- Forecast output now distinguishes `PUBLISHABLE`, `RESEARCH_ONLY`, and `ABSTAIN` decision states.
- Yahoo-backed instruments are forecastable only when the upstream market state is `REGULAR`; `PRE`, `POST`, `CLOSED`, or unverified sessions do not publish a current target.
- Coinbase remains 24/7 forecastable, with live price transport handled directly by its WebSocket.

## Market-data integrity

- Added deterministic candle normalization before indicators, validation, and forecasting.
- Invalid OHLC rows are rejected, duplicate timestamps are collapsed, and out-of-order rows are sorted chronologically.
- API responses now expose integrity diagnostics including input/clean row counts, rejected rows, duplicates, ordering defects, median step, and large gaps.
- Freshness scoring no longer labels a known closed Yahoo session as if it were an actively stale live session.

## Runtime and Vercel efficiency

- Removed 15-second Coinbase and unconditional 45-second traditional-market API polling from Market Lab.
- Coinbase price updates remain live through the venue WebSocket without repeated Vercel market-function executions.
- Yahoo polling is now session-aware and, while `REGULAR`, no more frequent than two minutes for intraday snapshots; closed sessions stop background polling.
- Yahoo chart snapshots now use warm-runtime TTL caching, and search caching was increased.
- Expensive interactive forecast/validation results are cached by instrument, timeframe, horizon, and latest candle identity.
- Interactive validation is capped at 36 non-overlapping origins; the independent real-market benchmark retains its 60-origin research setting.
- Market/search/world/news/filing CDN TTLs were increased according to how quickly their source data can legitimately change.
- Per-client API limits were tightened to reduce accidental or abusive function amplification.

## Search and interface

- Search results now rank exact ticker matches first, then symbol prefixes, name prefixes, and partial matches.
- One-character remote search fan-out is suppressed and browser debounce was increased to reduce provider and function churn.
- Market Lab now leads with instrument search, session state, forecast publication state, and data integrity.
- Quick-market presets, model validation, technical indicators, microstructure, and options evidence are progressively disclosed instead of competing for attention on first load.
- Numeric forecast overlays and forward checkpoint tables are shown only for `PUBLISHABLE` forecasts.

## Verification governance

- Added tests proving that extreme terminal jumps and measured negative skill withhold numeric targets.
- Added tests for candle normalization, Yahoo off-session gating, Coinbase no-poll WebSocket policy, and session-based target suppression.
- Real-market benchmark workflow now runs for forecast/data changes on pull requests and on `master`, in addition to the weekly schedule.
- Broad claims that Zachitan can accurately predict markets remain prohibited unless the multi-asset benchmark and later untouched-holdout validation justify them.

---

# Zachitan v4.1.0-beta.1 — Audit Hardening Release

Release candidate date: 2026-08-15
Status: verification candidate

This release is a direct remediation of the August 15 product/engineering audit. It does not claim that Zachitan has universally demonstrated market-prediction accuracy. Its purpose is to make the product operationally reliable, scientifically honest, baseline-aware, testable, and deployable.

## Critical runtime repairs

- Restored the AMFI provider contract and removed the module/interface mismatch that could prevent the central API route from loading.
- Restored the ECB dispatcher contract.
- Added explicit provider-contract verification at API module load plus contract tests.
- Added compatible HTTP transport exports, identical-request coalescing, bounded retry of retryable upstream failures, and API abuse limits.
- Rebuilt MarketLab request lifecycle with stable dependencies, one in-flight request, cancellation, visibility-aware polling, and cleanup.
- Removed obsolete `unpack.cjs` encrypted-shard bootstrap and shard checksum manifest that were associated with the prior Vercel `cipher hash mismatch` build failure.

## Forecast science and truthfulness

- Removed the previous calibration formula that treated 50% directional accuracy as the ideal direction component.
- Calibration is now unavailable (`N/A`) when it has not been measured.
- Walk-forward origins are separated by at least the forecast horizon to reduce overlapping-target leakage.
- Historical analogue selection is diversified in time.
- Effective evidence is reduced using horizon-sized temporal weight clusters.
- Added unchanged-price baseline error, MASE-like ratio, error skill versus unchanged price, momentum-direction baseline, Brier score/skill, log loss, selective performance, interval coverage, and interval width.
- Forecasts expose one of three model states: insufficient validation, validated positive local skill, or validated without positive baseline skill.
- High-looking evidence scores are no longer presented as substitutes for actual validation skill.
- Flat-market RSI now returns neutral 50 rather than 100.
- Traditional-market forecast checkpoints avoid fabricated closed-session wall-clock precision.

## Research utility

- News retrieval now clusters near-duplicate stories, reports distinct-source breadth, and identifies multi-source clusters as corroboration context without treating repetition as truth or predictive signal.
- SEC filing compliance gate remains explicit.
- World/physical/cyber evidence and Coinbase microstructure remain separate from the price forecast until incremental target-specific predictive value is demonstrated.

## Recurring-investment analytics

- XIRR remains based on dated contribution cash flows.
- Maximum drawdown is now calculated on the underlying NAV/price rather than raw contributed portfolio value, preventing later contributions from masking underlying losses.
- Recurring-investment mathematics moved into a tested library module.

## Verification and release governance

- Expanded test coverage from the original forecast shape checks to forecast semantics, baseline-relative validation, temporal non-overlap, calibration availability, provider contracts, flat-market RSI, SIP/XIRR/drawdown behavior, and news clustering/source diversity.
- Added GitHub Actions verification that runs the full test suite and a Next.js production build.
- Added `README.md`, `VALIDATION_PROTOCOL.md`, and `AUDIT_REMEDIATION.md`.
- Public methodology now describes the actual inspectable engine rather than implying public implementation details are proprietary/hidden.

## Remaining gates before production certification

- GitHub Actions must pass on the final PR/merge commit.
- Vercel must complete a clean production build from the repository without the removed shard bootstrap.
- Production health and representative API routes must be smoke-tested.
- Broad claims that Zachitan accurately predicts markets remain prohibited until the independent multi-asset untouched-holdout protocol is completed.

---

# Zachitan v4.0.0-beta.1 — Previous Research Beta

Release date: 2026-08-08

The previous beta introduced multi-asset data adapters, the empirical forecast UI, native chart, world/evidence feeds, news/filings research, watchlists, recurring-investment simulation, methodology, source ledger, and explicit degraded/gated provider states. v4.1 supersedes its verification and calibration semantics.
