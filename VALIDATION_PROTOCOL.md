# Zachitan Forecast Validation Protocol

This document defines the minimum evidence required before Zachitan may describe a forecast model as having demonstrated predictive skill.

## 1. Evaluation principle

A forecast is useful only if it improves on an appropriate simple alternative out of sample. Producing a plausible numeric target is not evidence of predictive value.

## 2. Chronological isolation

- Training/analogue data must precede each evaluated forecast origin.
- Validation origins must be separated by at least the forecast horizon when terminal outcomes would otherwise overlap.
- A final untouched holdout period must be reserved for release-level benchmark claims.
- Hyperparameter changes after viewing holdout results invalidate that holdout for future claims.

## 3. Mandatory baselines

At minimum evaluate against:

1. unchanged price / zero-return forecast;
2. simple horizon momentum direction;
3. historical-drift forecast;
4. a simple statistical reference model when a benchmark dataset is being used for publication.

The product may expose an experimental forecast when it does not beat these baselines, but it must state that positive predictive skill is not demonstrated on that validation window.

## 4. Required metrics

### Point forecast

- mean absolute log error;
- median absolute percentage-like error derived from log error;
- MASE-like ratio versus unchanged price;
- skill score versus unchanged price.

### Direction and probability

- directional accuracy;
- simple momentum-direction baseline accuracy;
- Brier score;
- Brier skill versus a 50/50 probability baseline;
- log loss;
- selective accuracy and selective coverage for high-confidence calls.

### Intervals

For 50%, 80%, and 90% bands report:

- empirical out-of-sample coverage;
- mean interval width relative to price;
- number of validation observations for which the band was available.

High nominal bands such as 95% or 99% must be withheld when effective evidence is insufficient.

## 5. Dependence control

Financial bars are serially correlated and adjacent analogue examples can share most of the same future path. Zachitan therefore:

- diversifies selected historical neighbours by time;
- reports raw weighted effective sample size;
- clusters weights over horizon-sized temporal blocks;
- uses the lower dependence-adjusted effective sample size for evidence thresholds;
- separates validation origins by at least the forecast horizon.

These controls reduce, but do not eliminate, dependence. Published research claims require stronger block-bootstrap or comparable uncertainty analysis.

## 6. Release-level benchmark universe

Before any broad claim of forecast accuracy, evaluate a fixed multi-asset universe containing at least:

- large-cap U.S. equities;
- Indian equities / NIFTY-linked instruments;
- broad U.S. and Indian indices;
- gold and crude-oil futures or licensed equivalent histories;
- major FX pairs including USD/INR;
- BTC and ETH;
- representative mutual-fund/NAV series only on horizons appropriate to end-of-day NAV data.

Evaluate multiple horizons and multiple market regimes: rising, falling, sideways, high volatility, and low volatility.

## 7. Claim gate

Zachitan may not state or imply that the forecasting engine is “accurate”, “high accuracy”, or reliably predicts markets merely because:

- unit tests pass;
- a historical chart visually resembles later prices;
- direction accuracy exceeds 50% in one instrument/window;
- an evidence or calibration ring is high;
- an in-sample or overlapping backtest looks strong.

A broad predictive-skill claim requires reproducible, untouched out-of-sample evidence across the benchmark universe with uncertainty around the reported skill.

## 8. Current product semantics

- `evidenceScore`: availability/diversity of comparable historical evidence after concentration and temporal-dependence penalties. Not probability of correctness.
- `calibrationScore`: summary of measured out-of-sample error skill, probability skill, interval coverage, and validation sample sufficiency. `N/A` if validation is unavailable.
- `modelStatus=validated-positive-skill`: both point-error skill versus unchanged price and Brier skill versus 50/50 are positive on the displayed validation window. This is local evidence, not a universal claim.
- `modelStatus=validated-no-positive-skill`: the model produced a forecast but did not clear the local baseline-skill gate.
- `modelStatus=insufficient-validation`: the system lacks enough independent chronological checks to score forecast skill.
