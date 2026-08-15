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
