# Zachitan v5 Production Design

## Goal

Turn Zachitan from a research beta that can abstain safely into a production research terminal whose prediction publication, data integrity, model validation, cost profile, and deployment provenance are all explicitly controlled and measurable. The product must never claim or imply predictive accuracy that is not demonstrated by chronological out-of-sample evidence.

## Constraints

- Zero paid infrastructure is assumed; Vercel Hobby compatibility is mandatory.
- No trade execution or personalized investment advice.
- No numeric forecast may be shown merely because a model can produce one.
- Every published forecast must pass data-integrity, market-session, regime, evidence, and baseline-skill gates.
- Crypto remains 24/7; exchange-traded traditional assets must respect provider session state and calendar semantics.
- Upstream data must remain source-attributed; missing data stays missing.
- Expensive validation must not run on every browser refresh.
- All model changes require unit tests, chronological validation, and the cross-asset benchmark before merge.

## Architecture

### 1. Data boundary

All provider candles pass through a canonical normalization layer before indicators or models see them. The layer rejects invalid OHLC, sorts timestamps, collapses duplicate timestamps, reports gaps, and identifies suspicious discontinuities. Provider metadata is normalized into a session policy (`continuous`, `regular`, `reference-only`, `unknown`).

### 2. Forecast engine

Replace the single analogue point forecast as the only candidate with a small deterministic ensemble of candidate return forecasts:

- no-change baseline (zero return),
- volatility-adjusted momentum,
- trend/mean-reversion candidate selected from recent trend strength,
- historical analogue candidate from the existing engine.

Candidate weights are not constants. For every forecast origin, historical-only walk-forward scoring estimates recent candidate error. Only candidates with finite history receive weight; poorer candidates receive exponentially smaller weights. The ensemble point estimate is shrunk toward zero when model disagreement, weak evidence, or unstable regime is high.

The existing analogue distribution remains useful for empirical uncertainty, but the published center is the ensemble center. The model exposes candidate contributions and disagreement so the UI can explain why a target is or is not publishable.

### 3. Regime and jump handling

The existing jump diagnostic remains a hard abstention gate for extreme out-of-distribution moves. A second regime profile classifies volatility as low/normal/high and trend as trending/ranging using only past data. Candidate weights may adapt by regime, but no event/news feature is admitted into the price model without a benchmarked ablation proving incremental out-of-sample skill.

### 4. Publication policy

A numeric center/path is `PUBLISHABLE` only when all are true:

1. normalized data has sufficient clean observations and no critical integrity fault;
2. the source is in a forecastable market session;
3. no severe terminal jump/regime-break gate is active;
4. walk-forward validation is available;
5. ensemble point skill versus no-change is positive;
6. probability skill versus 50/50 is positive when a directional probability is displayed;
7. minimum publication checks and dependence-adjusted evidence are met.

Otherwise the product returns `RESEARCH_ONLY` or `ABSTAIN` with explicit reasons and withholds numeric target overlays.

### 5. Validation and holdout discipline

`validate()` remains chronological and non-overlapping. Add candidate-level and ensemble-level metrics so the product can prove whether the ensemble improves on both no-change and the legacy analogue model. The benchmark must compare:

- no-change,
- momentum,
- legacy analogue,
- ensemble.

The benchmark output records per-instrument/per-horizon results and aggregate gates. Broad accuracy claims remain disabled unless aggregate gates pass. The benchmark must not automatically modify model parameters.

### 6. Session and calendar semantics

Use authoritative provider market state wherever supplied. For forecast timestamps, never invent exchange-open times from a generic weekday function. Intraday traditional-asset forecasts remain observation-indexed unless an exchange calendar is explicitly known. Daily traditional-asset checkpoints may use business-day labels but must say holidays can differ. Reference-only series such as ECB/AMFI do not pretend to be live markets.

### 7. Serving and cost architecture

Browser requests should primarily retrieve cached snapshots. The server caches normalized market analysis by provider/symbol/interval/range/horizon/latest-candle identity. Validation/forecast computation is reused until the latest candle changes. Coinbase live prices remain direct WebSocket client updates; the full analytical snapshot is refreshed only on user request or a low-frequency cadence. Yahoo polling happens only during a `REGULAR` session.

Search must debounce, suppress one-character upstream fan-out, and rank exact symbols before prefixes and names. API responses use CDN TTLs appropriate to source cadence. Abuse/rate limiting remains conservative.

### 8. UI information architecture

The Market Lab first screen must answer, in order:

1. What instrument is this?
2. What is the latest observed price/reference value and session state?
3. Is the data healthy?
4. Is Zachitan publishing a forecast or abstaining, and why?
5. If publishable, what is the center, uncertainty and validation evidence?

Technical indicators, candidate diagnostics, validation internals, options, and microstructure are secondary progressive-disclosure sections. `ABSTAIN` is a first-class result, not an error state.

### 9. Deployment provenance

Production must expose a health payload containing release version and commit SHA. A deployment is considered complete only when the public production domain returns the expected release and SHA and representative `/api/data` requests succeed. Vercel must be wired to the GitHub repository or deployed from an exact file bundle; stale manual deployments are not acceptable.

## Verification

Before merge: full `npm test`, `npm run build`, real-market benchmark, and PR review of changed files. After merge: repeat CI on the merge SHA. After deployment: verify health version/SHA, one crypto market request, one Yahoo market request during the appropriate session semantics, one search request, and inspect runtime/build errors.

## Non-goals

- No claim of guaranteed prices or guaranteed alpha.
- No paid proprietary feed integration in this phase.
- No deep-learning model added merely for sophistication.
- No news/sentiment feature enters the predictor until an ablation proves incremental chronological out-of-sample value.
