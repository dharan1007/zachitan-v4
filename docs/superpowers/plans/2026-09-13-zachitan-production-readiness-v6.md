# Zachitan Production Readiness + V6 Accuracy Program

> **For agentic workers:** execute each task with tests before implementation. Do not publish broad accuracy claims unless an untouched holdout passes the stated gates.

**Goal:** Make Zachitan operationally production-ready as a selective market-research system while improving measurable forecasting skill without leakage or fabricated certainty.

**Architecture:** Separate display history from model evidence history, precompute immutable model snapshots, enforce publication gates using untouched evaluation data, and fail closed whenever data/session/model integrity is uncertain. Production release must be exact-SHA reproducible and gated by tests, builds, benchmarks, provider smoke tests, and provenance checks.

**Tech Stack:** Next.js 16, React 19, Node 24, Vercel, GitHub Actions, public research providers, provider-free BYOD commercial mode.

## Global constraints

- No claim of 100% future-price accuracy.
- Never expose a numeric target for `RESEARCH_ONLY` or `ABSTAIN`.
- No future-leaking features or validation.
- Chart range must not determine model evidence history.
- No invented exchange timestamps, prices, bars, corporate actions, or provider substitutions.
- Production deployment must report its exact Git SHA.
- Commercial mode must remain provider-free unless explicit data rights are added.

## Release blockers

- [ ] Wire `modelHistoryPlan` and `sliceDisplayCandles` into `/api/data` so forecasting uses `modelCandles` and UI receives only `displayCandles`.
- [ ] Remove chart range from model analysis cache identity.
- [ ] Run full unit/contract tests plus research and commercial builds.
- [ ] Run benchmark and preserve negative results without tuning against the benchmark.
- [ ] Merge only after all required checks pass.
- [ ] Deploy exact merged SHA and smoke-test health, search, Yahoo closed-session behavior, Yahoo capability clamping, Coinbase 24/7 behavior, research-only target withholding, and commercial fail-closed behavior.

## Production-hardening program

- [ ] Add immutable train/calibration/validation/publication-holdout evaluation contracts.
- [ ] Add per-asset-class, timeframe, and horizon scorecards; publication is qualified per combination, never globally.
- [ ] Add rolling drift detection and automatically demote degraded combinations to `ABSTAIN`.
- [ ] Add interval-coverage diagnostics and confidence intervals around skill metrics.
- [ ] Add corporate-action normalization for equities and explicit adjusted/unadjusted provenance.
- [ ] Add authoritative exchange calendars before emitting exchange-bound forecast dates.
- [ ] Persist or precompute model snapshots keyed by instrument, timeframe, horizon, model version, and observation cutoff so browser requests do not rerun expensive validation unnecessarily.
- [ ] Add structured production telemetry for provider errors, cache hits, validation latency, publication/abstention counts, integrity failures, and session gating.
- [ ] Add provider smoke matrix and contract tests for every supported interval/range combination.
- [ ] Enable protected-release governance when repository administration is available: required verify + benchmark checks and no unverified direct production pushes.
- [ ] Establish permanent GitHub-to-Vercel deployment authorization when account-level Git/Vercel credentials can be configured.

## Release acceptance

A release is production-ready only when all automated tests/builds pass, the benchmark executes without broad unsupported claims, provider smoke tests pass or fail closed, production health reports the exact merged SHA, numeric forecasts are withheld whenever gates fail, and no known critical correctness/security defect remains open.