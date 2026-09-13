# Zachitan v5 Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a safer, lower-cost, empirically gated Zachitan forecast pipeline with an adaptive deterministic ensemble, candidate-level validation, cleaner Market Lab UX, and verifiable production deployment provenance.

**Architecture:** Preserve the existing provider and analogue-distribution layers, but place a small candidate ensemble above the point forecast. Candidate weights come from chronological past-only validation, publication remains guarded by integrity/session/regime/skill checks, and expensive analysis is reused until market state changes.

**Tech Stack:** Next.js 16, React 19, Node 24, Node test runner, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-13-zachitan-v5-production-design.md`

## Global Constraints

- Zero paid infrastructure.
- No numeric target without positive chronological baseline skill and valid session/data/regime gates.
- No news/event feature in the predictor without a measured ablation gain.
- No trade execution or personalized investment advice.
- No deployment-complete claim until production returns the expected release and commit SHA.

---

### Task 1: Candidate Forecast Ensemble

**Files:**
- Modify: `lib/forecast.mjs`
- Modify: `tests/forecast.test.mjs`

**Interfaces:**
- Produce `candidateForecasts(candles, horizon)` returning `{ noChange, momentum, regime, analogue }` log-return candidates.
- Produce `ensembleForecast(candles, horizon, validation)` returning center return, candidate weights, disagreement and candidate diagnostics.
- `forecast()` remains the public forecast interface and incorporates the ensemble center while retaining empirical analogue uncertainty ranges.

- [ ] Add failing tests proving the ensemble center is finite, weights sum to 1, no-change remains available, and the ensemble shrinks toward zero when candidate disagreement is high.
- [ ] Run `npm test` and confirm the new tests fail for the missing ensemble behavior.
- [ ] Implement deterministic momentum and regime/trend candidates using only information available at the forecast origin.
- [ ] Implement past-only candidate weighting from rolling candidate absolute errors with exponential error weighting and a no-change floor.
- [ ] Integrate the ensemble point center into `forecast()` without changing empirical range construction.
- [ ] Run `npm test` and confirm all forecast tests pass.

### Task 2: Ensemble Validation and Benchmark Comparison

**Files:**
- Modify: `lib/forecast.mjs`
- Modify: `scripts/benchmark.mjs`
- Modify: `tests/forecast.test.mjs`

**Interfaces:**
- `validate()` adds `ensembleSkillVsNoChange`, `legacyAnalogueSkillVsNoChange`, `candidateMae`, and `ensembleDirectionAccuracy` while preserving existing fields.
- Benchmark rows include legacy analogue, ensemble, no-change, and momentum comparisons.

- [ ] Add failing tests showing ensemble and legacy metrics are separately reported and validation origins remain chronological/non-overlapping.
- [ ] Run the test suite and confirm failure for missing metrics.
- [ ] Record candidate and ensemble errors at each walk-forward origin without using future data for weights.
- [ ] Update the broad benchmark gate to use ensemble skill while retaining the legacy results for regression comparison.
- [ ] Run `npm test` and the benchmark workflow on the branch; broad-accuracy claims remain disabled unless aggregate gates actually pass.

### Task 3: Publication Policy, Integrity and Session Semantics

**Files:**
- Modify: `lib/market-integrity.mjs`
- Modify: `app/api/data/route.js`
- Create/modify: `tests/market-integrity.test.mjs`

**Interfaces:**
- `applySessionForecastPolicy()` receives forecast + normalized integrity + session state and returns a reasoned publication state.
- API market response exposes `publication`, `integrity`, `session`, `analysisIdentity`, and forecast candidate diagnostics.

- [ ] Add failing tests for critical-integrity abstention, closed/pre/post Yahoo abstention, reference-only sources, and publishable continuous crypto.
- [ ] Run tests and confirm failures.
- [ ] Make integrity/session gates authoritative before serializing numeric forecast targets.
- [ ] Add stable analysis identity from provider/symbol/interval/range/horizon/latest candle.
- [ ] Keep observation-index timestamps where exchange calendar certainty is unavailable.
- [ ] Run tests and build.

### Task 4: Runtime and Search Cost Controls

**Files:**
- Modify: `app/api/data/route.js`
- Modify: `lib/http.mjs`
- Modify: `lib/providers/yahoo.mjs`
- Modify: `app/components/AssetSearch.js`
- Modify: `app/components/MarketLab.js`

**Interfaces:**
- Analysis cache is keyed by exact analysis identity and is reused until the latest normalized candle changes.
- Search remote fan-out starts at 2 characters and uses a >=300 ms debounce.
- Coinbase uses WebSocket for live price and no periodic Vercel market-function polling.

- [ ] Add or preserve tests/contracts that prevent provider interface drift.
- [ ] Ensure identical upstream requests coalesce and Yahoo chart/search TTLs reflect source cadence.
- [ ] Ensure background refresh is session-aware and disabled when closed or hidden.
- [ ] Tighten CDN cache headers by source cadence without caching personalized state.
- [ ] Run full tests and production build.

### Task 5: Market Lab Decision-First UX

**Files:**
- Modify: `app/components/MarketLab.js`
- Modify: `app/components/InteractiveChart.js`
- Modify: `app/globals.css`

**Interfaces:**
- Primary surface shows instrument, observed value, session, integrity and publication decision.
- Candidate diagnostics appear only in an advanced/model-details section.
- Numeric forecast path/overlay renders only for `PUBLISHABLE` state.

- [ ] Refactor the top of Market Lab into a compact decision summary.
- [ ] Present abstention reasons in plain language without showing a hidden target.
- [ ] Keep validation, technicals, options and microstructure behind progressive disclosure.
- [ ] Ensure chart receives no forecast path when target publication is withheld.
- [ ] Run production build to catch JSX/CSS regressions.

### Task 6: Release Governance and Deployment Provenance

**Files:**
- Modify: `app/api/data/route.js`
- Modify: `package.json`
- Modify: `RELEASE_NOTES.md`
- Modify: `.github/workflows/verify.yml`
- Modify: `.github/workflows/benchmark.yml`

**Interfaces:**
- Health returns `version`, `commitSha`, and `releaseState`.
- Release version becomes `5.0.0-beta.1`.

- [ ] Add health/release tests or assertions where practical.
- [ ] Expose commit SHA from `VERCEL_GIT_COMMIT_SHA`/`GITHUB_SHA` with a safe `unknown` fallback.
- [ ] Run `npm test`, `npm run build`, and branch benchmark.
- [ ] Open PR and inspect changed files; merge only with green verification and benchmark execution.
- [ ] Verify the merge SHA with GitHub Actions.
- [ ] Deploy production from the exact merged source using the connected Vercel project if possible.
- [ ] Verify public production health returns `5.0.0-beta.1` and the merged SHA; smoke-test search, crypto market, and Yahoo market semantics; inspect Vercel runtime/build errors.
- [ ] If the Vercel connector cannot bind/deploy the exact Git source, leave the verified code merged and report deployment as blocked rather than claiming success.

## Self-review

The plan covers every design requirement: adaptive ensemble, chronological validation, publication gating, integrity/session semantics, cost controls, decision-first UI, benchmark governance, and deployment provenance. There are no placeholder implementation steps. Existing interfaces are preserved where compatibility matters, and all new public fields are additive.
