# Zachitan forecasting accuracy and cost contract

Status: experimental. Not independently certified as consistently accurate, profitable, continuously online, or production-ready for investment decisions.

## Scope and corrections

The existing V6 multi-observation close-return ensemble retains walk-forward and untouched holdout checks. Live publication now reuses the pre-holdout weights and probability calibration actually evaluated on the holdout, rather than silently refitting on later outcomes. The numeric center and displayed uncertainty bands move together; failed qualifications mask numeric bands.

An independent ONE-next-completed-observation model forecasts opening gap, high, low, closing return, and traded volume separately. It also derives full candle size (high minus low) and body size (absolute close minus open), and scores both derived quantities against their previous-candle baseline. This is not the same horizon as the selectable multi-bar forecast. Traded volume is not order size. Only completed real source observations enter fitting, adjustment, and evaluation. Each forecast preserves high >= max(open, close) and low <= min(open, close). Volume is null when unavailable, never fabricated as zero.

Causal nearest-neighbor projections are blended towards a per-field no-change baseline, based on earlier matured prediction errors. The historical backtest uses up to 128 eligible evaluation origins plus 40 earlier warm-up origins, reports dated reconstructed predicted-versus-observed records, and scores every returned eligible origin. For 24/7 crypto, absent time slots are excluded from next-interval scoring rather than silently treating a much later candle as the next interval. More distant periods require additional licensed or available historical candles; unavailable dates are never backfilled with invented observations. Adjustments only use outcomes that were known when the corresponding projection was made. An experimental model may shrink to a baseline or show negative skill; no improvement is guaranteed.

## Statistical definitions

Per variable, displayed aggregate MAE percentage is 100 times (exp(mean(abs(log(actual/predicted)))) minus 1). The naive baseline is evaluated on the identical eligible observations. Skill is 1 minus model mean absolute log error divided by baseline mean absolute log error. Negative skill means the model underperformed. Null means insufficient evidence or an undefined denominator. The historical table now reports arithmetic mean absolute percentage error (MAPE): 100 times mean(abs(predicted/actual minus 1)), excluding zero/invalid actuals. The row-level absolute percentage error uses the identical per-record expression, and the error-history graph plots it for each completed observation. Log-error skill is a separate statistic and must not be conflated with arithmetic MAPE.

Naive next open/close use the last completed close; naive high/low use previous high/low, and naive volume uses last reported volume. Empirical 80%-labelled bounds use the 10th and 90th quantiles of previously matured residuals and are unavailable below 20 residuals. Actual coverage and sample counts are displayed: no finite-sample coverage guarantee is implied for nonstationary, serially dependent returns.

The user interface states clearly that the displayed rows are reproducible historical walk-forward RECONSTRUCTIONS, not an archived as-issued ledger. Every response sets asIssuedLiveRecord to false. Unit tests use deterministic constructed fixtures only inside tests, never as displayed market observations or real accuracy claims.

AMFI NAV and ECB reference rates are published point values, not venue-observed open/high/low/volume. Their flat OHLC representation is identified as a visualization proxy. CSV export contains reference values only, and their next-OHLCV estimates are withheld. Missing Yahoo volume remains null. Real commercial market-data licensing remains a separate requirement.

## Resource constraints and execution

No background worker, Vercel cron schedule, added Edge Function, or model-training daemon is introduced. Coinbase's existing WebSocket carries live price ticks; completed-bar forecasts and reconstructed accuracy refresh through an existing cached Vercel HTTP endpoint at most every five minutes while the corresponding browser page remains open and visible, or every fifteen minutes for the daily Coinbase view. Stock polling remains constrained by trading session; daily NAV/ECB sources are not polled.

Identical concurrent frontend GETs coalesce; obsolete requests abort on symbol or timeframe changes. Exchange book/trades move to a separately requested optional endpoint. Existing CDN response-cache headers and the fifteen-minute in-memory analysis cache reduce repeated work. Analysis cache identity now incorporates a digest of every source OHLCV row, including corrections.

The in-memory cache and rate counter are NOT persistent across Vercel instances. Arbitrarily high traffic or diversified uncached requests can still incur platform usage; there is NO asserted absolute cap on account spend or function usage. Consult the Vercel Usage dashboard and applicable account billing controls.

## Conditions for a real as-issued continuously running system

A true, independently auditable live accuracy ledger requires a dedicated, authorized durable data store (none was identified for Zachitan among the connected projects), an event scheduler or independently provisioned upstream stream processor, and immutable records of each original issuance: instrument, interval, origin close, input digest, version, all targets and bands, prediction deadline, source and receipt timestamps. Finalize observations only after the source publishes a completed candle. Deduplicate issuance and settlement, keep revisions as versioned events, and never overwrite an original miss with an improved retrospective forecast.

Before claiming production forecasting skill, freeze candidate selection, test a genuinely untouched future period, use larger independent samples, quantify uncertainty and post-selection effects, stratify by market regime and session, and validate corporate actions, futures rolls, symbol delistings, input-publication time, delayed feeds, source entitlements and cross-market transfer. If trading P&L is eventually claimed, separately evaluate fees, slippage, spread and executable liquidity. No point model is guaranteed to beat the baseline.

Reference standards and source links: Vercel Cron Jobs usage and pricing; Vercel Spend Management; Rob Hyndman rolling scaled forecast accuracy; peer-reviewed literature on purged financial time-series validation. This branch should not be represented as a verified always-on financial forecasting service until these conditions are met.

## Cross-asset screen qualification

The daily cross-asset watchlist uses a fixed, transparent 20/60-bar trend and 20-bar momentum rule. Nonoverlapping completed-bar evaluations enter at the next published open and exit after five market-observation sessions. Only the final 40% chronological evaluation tail determines the historical sample gate (minimum 20 applicable signals, lower approximate Wilson win-rate bound over 50%, positive gross mean return and no detected recent hit-rate collapse). Its first 60% is never included in this reported holdout gate. This split is *not* a genuinely externally untouched, post-development test; parameter selection and cross-market screening can still create selection bias. It is not evidence of profitability after fees. Market-time, transaction costs, position execution, licensed third-party forecasts and real institutional verdicts are still unverified.


## Independent durable worker implementation

A standalone, **not deployed** Node process is supplied at scripts/forecast-worker.mjs. It is deliberately forbidden to run on ephemeral Vercel storage. It polls completed Coinbase native intervals from a separate persistent host, uses the real provider observations, and writes an append-only fsynced event journal through lib/durable-live-ledger.mjs. The original ISSUE event is preserved; SETTLE is another event with the observed next candle. Idempotent IDs prevent double-counting. Records form a SHA-256 event hash chain and fail closed on corruption/truncated writes; a self-contained hash chain without an independently retained external head is **not** a tamper-proof compliance record. A single-process lock prevents accidental concurrent issuers. The worker is configured for up to four Coinbase symbols and four supported native intervals.

Operational prerequisites, not claimed to exist: provision a dedicated always-running non-Vercel machine or suitable free/paid service, a **persistent** mounted volume whose parent directory already exists, an external supervisor that restarts after crashes, upstream quota and connectivity monitoring, a versioned access-controlled read API to expose verified events to the website, and a genuinely future post-selection qualification run. There is no currently authorized dedicated Zachitan durable DB or host connected to this project. A browser does not implement a 24/7 worker; deploying the React site alone does not start this process.

Example, on a provisioned durable host only:

    ZACHITAN_LEDGER_PATH=/persistent/volume/zachitan/events.jsonl \
    ZACHITAN_WORKER_SYMBOLS=BTC-USD \
    ZACHITAN_WORKER_INTERVALS=5m \
    node scripts/forecast-worker.mjs

No GitHub Actions, GitHub cron, Vercel cron, Vercel Edge Function or Vercel HTTP requests are needed by this separate worker. Its own host uptime and market-data requests are not free by definition; check actual hosting and provider quotas. It currently supports Coinbase source-native OHLCV only. Never represent Yahoo/ECB/AMFI reference values or unlicensed delayed prices as independently settled, tradable intraday candles. The existing website still shows a distinct browser-local issuance history; the worker journal is **not yet connected to the dashboard**.

Expanded historical reconstruction: at most 128 selected eligible next-observation checks, plus a calibration warm-up, are returned by the existing market endpoint. Its displayed range is limited by actual provider history. Expanding the test window increases CPU work; the additional worker does not remove backend costs of users requesting uncached model computations. The extended history is still a reconstruction, not as-issued evidence or an observed trading-profit backtest.
