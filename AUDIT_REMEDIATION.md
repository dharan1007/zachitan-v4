# Zachitan v4.1 Audit Remediation Register

This register maps the August 15, 2026 product audit findings to concrete code changes and remaining limitations.

| Audit finding | v4.1 remediation | Status |
|---|---|---|
| AMFI provider imported HTTP exports that did not exist | HTTP compatibility exports restored; AMFI rewritten against the canonical transport API | Fixed |
| API dispatcher called `amfi.search/history` while provider exported different names | Explicit AMFI `search` and `history` contract implemented | Fixed |
| API dispatcher expected `ecb.fx` while provider exported only `ecbPair` | Explicit ECB `fx` contract implemented | Fixed |
| Provider drift could ship without being detected | `provider-contracts.mjs` plus module-load contract tests and CI gate | Fixed |
| Calibration direction component rewarded 50% accuracy and penalized 100% | Removed; calibration now uses baseline-relative point skill, Brier skill, interval coverage and sample sufficiency | Fixed |
| Missing validation produced a numeric calibration score | Calibration now returns `null`; UI renders `N/A` | Fixed |
| Walk-forward checks could overlap heavily | Validation origins separated by at least the forecast horizon | Fixed |
| Effective sample size ignored temporal dependence | Historical neighbours diversified in time; block/dependence-adjusted ESS added | Fixed/partial |
| No naïve baseline comparison | Unchanged-price point baseline and momentum/50-50 probability references added | Fixed |
| Tests checked numeric shape but not scientific semantics | Expanded tests cover baseline metrics, non-overlap, calibration availability, provider contracts, RSI flat market, SIP risk and news clustering | Fixed |
| Flat market RSI returned 100 | Flat gain/loss window returns neutral RSI 50 | Fixed |
| Traditional-market forecast timestamps could land in closed sessions | Continuous crypto gets wall-clock estimates; daily/reference data use weekday estimates; non-continuous intraday forecasts can remain observation-indexed | Fixed/partial; exchange-holiday calendars remain future work |
| MarketLab request lifecycle could repeatedly retrigger | Stable callback dependencies, one in-flight request, cancellation, visibility-aware polling and cleanup | Fixed |
| API had no basic abuse protection/coalescing | In-flight upstream coalescing, retryable-error retry policy and per-action request limits added | Fixed |
| SIP drawdown was contaminated by contributions | Drawdown measured on underlying price/NAV; XIRR retains dated contribution cash flows | Fixed |
| News was retrieval-only | Deterministic near-duplicate story clustering and source-diversity/corroboration context added | Improved; not a causal/predictive NLP engine |
| Public methodology said implementation details were hidden although repo was public | Methodology rewritten to describe inspectable engine and actual limitations | Fixed |
| Release verification relied on 8 unit tests and prior build statements | GitHub Actions now gates on full tests plus production `next build` | Fixed |
| Obsolete encrypted shard bootstrap caused `cipher hash mismatch` deployment failures | `unpack.cjs` and obsolete shard checksum manifest removed from repository | Fixed in repository; production deployment still must be re-verified |
| Production was paused/unavailable | Requires successful post-merge Vercel deployment and endpoint smoke check | Release gate pending |
| Broad forecast accuracy was not demonstrated | `VALIDATION_PROTOCOL.md` defines a multi-asset untouched-holdout acceptance gate; UI explicitly reports when local baseline skill is absent | Claim discipline fixed; broad predictive skill still scientifically unproven |

## Remaining release gates

The following cannot be truthfully marked complete until verified against the merged production build:

1. GitHub Actions tests pass on the final branch/PR.
2. Next.js production build passes on Vercel without the removed shard bootstrap.
3. Production `/api/data?action=health` returns HTTP 200.
4. Representative Coinbase and Yahoo market requests return structured real data.
5. Search returns without AMFI module/interface exceptions.
6. AMFI/ECB routes are smoke-tested against live upstream availability.
7. World and news endpoints return independent degraded states rather than page-wide failure.
8. Broad claims of forecasting accuracy remain prohibited until the independent multi-asset holdout protocol is completed.
