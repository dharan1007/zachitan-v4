# Zachitan forecasting accuracy and cost contract

Status: experimental. Not independently certified as consistently accurate, profitable, continuously online, or production-ready for investment decisions.

## Scope and corrections

The existing V6 multi-observation close-return ensemble retains walk-forward and untouched holdout checks. Live publication now reuses the pre-holdout weights and probability calibration actually evaluated on the holdout, rather than silently refitting on later outcomes. The numeric center and displayed uncertainty bands move together; failed qualifications mask numeric bands.

A separate forthcoming-target-candle model forecasts opening gap, high, low, closing return, and traded volume. For equities it targets one next exchange observation; for continuous Coinbase crypto the target has been moved to a not-yet-open candle TWO native source observations beyond the last completed origin, because the intervening bar has already opened when its completion is first published. It also derives full candle size (high minus low) and body size (absolute close minus open), and scores both derived quantities against their previous-candle baseline. This is not the same horizon as the selectable multi-bar forecast. Traded volume is not order size. Only completed real source observations enter fitting, adjustment, and evaluation. Each forecast preserves high >= max(open, close) and low <= min(open, close). Volume is null when unavailable, never fabricated as zero.

Causal nearest-neighbor projections are blended towards a per-field no-change baseline, based on earlier matured prediction errors. The historical backtest uses up to 128 eligible evaluation origins plus 40 earlier warm-up origins, reports dated reconstructed predicted-versus-observed records, and scores every returned eligible origin. For 24/7 crypto, absent time slots are excluded from next-interval scoring rather than silently treating a much later candle as the next interval. More distant periods require additional licensed or available historical candles; unavailable dates are never backfilled with invented observations. Adjustments only use outcomes that were known when the corresponding projection was made. An experimental model may shrink to a baseline or show negative skill; no improvement is guaranteed.

## Statistical definitions

Per variable, displayed aggregate MAE percentage is 100 times (exp(mean(abs(log(actual/predicted)))) minus 1). The naive baseline is evaluated on the identical eligible observations. Skill is 1 minus model mean absolute log error divided by baseline mean absolute log error. Negative skill means the model underperformed. Null means insufficient evidence or an undefined denominator. The historical table now reports arithmetic mean absolute percentage error (MAPE): 100 times mean(abs(predicted/actual minus 1)), excluding zero/invalid actuals. The row-level absolute percentage error uses the identical per-record expression, and the error-history graph plots it for each completed observation. Log-error skill is a separate statistic and must not be conflated with arithmetic MAPE.

Naive next open/close use the last completed close; naive high/low use previous high/low, and naive volume uses last reported volume. Empirical 80%-labelled bounds use the 10th and 90th quantiles of previously matured residuals and are unavailable below 20 residuals. Actual coverage and sample counts are displayed: no finite-sample coverage guarantee is implied for nonstationary, serially dependent returns.

The user interface states clearly that the displayed rows are reproducible historical walk-forward RECONSTRUCTIONS, not an archived as-issued ledger. Every response sets asIssuedLiveRecord to false. Unit tests use deterministic constructed fixtures only inside tests, never as displayed market observations or real accuracy claims.

AMFI NAV and ECB reference rates are published point values, not venue-observed open/high/low/volume. Their flat OHLC representation is identified as a visualization proxy. CSV export contains reference values only, and their next-OHLCV estimates are withheld. Missing Yahoo volume remains null. Real commercial market-data licensing remains a separate requirement.

## Resource constraints and execution

No deployed background worker, Vercel cron schedule or added Vercel Edge Function is introduced. The newly written, separately scheduled Cloudflare/D1 source project is explicitly UNDEPLOYED, has no authorized database ID or cloud connection, and must not be advertised as already collecting live evidence. Coinbase's existing WebSocket carries live price ticks; completed-bar forecasts and reconstructed accuracy refresh through an existing cached Vercel HTTP endpoint at most every five minutes while the corresponding browser page remains open and visible, or every fifteen minutes for the daily Coinbase view. Stock polling remains constrained by trading session; daily NAV/ECB sources are not polled.

Identical concurrent frontend GETs coalesce; obsolete requests abort on symbol or timeframe changes. Exchange book/trades move to a separately requested optional endpoint. Existing CDN response-cache headers and the fifteen-minute in-memory analysis cache reduce repeated work. Analysis cache identity now incorporates a digest of every source OHLCV row, including corrections.

The in-memory cache and rate counter are NOT persistent across Vercel instances. Arbitrarily high traffic or diversified uncached requests can still incur platform usage; there is NO asserted absolute cap on account spend or function usage. Consult the Vercel Usage dashboard and applicable account billing controls.

## Conditions for a real as-issued continuously running system

A true, independently auditable live accuracy ledger requires a dedicated, authorized durable data store (none was identified for Zachitan among the connected projects), an event scheduler or independently provisioned upstream stream processor, and immutable records of each original issuance: instrument, interval, origin close, input digest, version, all targets and bands, prediction deadline, source and receipt timestamps. Finalize observations only after the source publishes a completed candle. Deduplicate issuance and settlement, keep revisions as versioned events, and never overwrite an original miss with an improved retrospective forecast.

Before claiming production forecasting skill, freeze candidate selection, test a genuinely untouched future period, use larger independent samples, quantify uncertainty and post-selection effects, stratify by market regime and session, and validate corporate actions, futures rolls, symbol delistings, input-publication time, delayed feeds, source entitlements and cross-market transfer. If trading P&L is eventually claimed, separately evaluate fees, slippage, spread and executable liquidity. No point model is guaranteed to beat the baseline.

Reference standards and source links: Vercel Cron Jobs usage and pricing; Vercel Spend Management; Rob Hyndman rolling scaled forecast accuracy; peer-reviewed literature on purged financial time-series validation. This branch should not be represented as a verified always-on financial forecasting service until these conditions are met.

## Cross-asset screen qualification

The daily cross-asset watchlist uses a fixed, transparent 20/60-bar trend and 20-bar momentum rule. Nonoverlapping completed-bar evaluations enter at the next published open and exit after five market-observation sessions. Only the final 40% chronological evaluation tail determines the historical sample gate (minimum 20 applicable signals, lower approximate Wilson win-rate bound over 50%, positive gross mean return and no detected recent hit-rate collapse). Its first 60% is never included in this reported holdout gate. This split is *not* a genuinely externally untouched, post-development test; parameter selection and cross-market screening can still create selection bias. It is not evidence of profitability after fees. Market-time, transaction costs, position execution, licensed third-party forecasts and real institutional verdicts are still unverified.


## September 27, 2026 no-Actions correction and autonomous evidence scope

A new independent development branch contains no GitHub Actions workflow invocation. Its source changes are **not** a verified production release. The last confirmed Vercel production deployment predates this work.

The source-candle table now includes date, observed OHLCV, historical replay values or actually issued browser-local forecast values, signed observed-minus-predicted close difference, and classified source gaps. Crypto missing intervals are distinct from stock-market session closures. Every reconstructed row says "Historical replay"; it is not claimed as an originally issued live forecast.

MACD uses properly initialized EMA after enough real observations. ATR uses Wilder smoothing. RSI, MACD, ATR and publisher-supplied volume have separate scales. The main chart uses appropriately scaled price overlays, and actual time-stamped backtest curves break across missing continuous-market candles. Future outcomes are never drawn before publisher confirmation.

The browser can request up to 1,100 retrospective source-observation checks from its own Web Worker without additional Vercel analysis requests. Source histories are still bounded; a deep replay cannot recreate unavailable days, holidays, candles or unlicensed data. The baseline and projected-price errors use the same eligible observation set; arithmetic MAPE and mean absolute log-error improvement are separately labelled.

The dedicated Cloudflare source implementation at infrastructure/cloudflare-evidence has a D1 schema with immutable issued-source/prediction columns, scheduled issuance, timestamped next-candle settlement, explicit unobserved data gaps and adaptation based strictly on earlier independently settled errors. **This is not deployed.** It is initially only for Coinbase BTC-USD and ETH-USD native five-minute bars and a pre-open target two source-bar intervals after the last completed origin (one in-progress interval is intentionally skipped). It is NOT the same fitted model as the V6 or browser analogue: numerical results from one must not be mixed into the other's hit rate. No other symbol or timeframe is silently advertised as autonomously verified.

Deployment requires the user's authorized Cloudflare Worker/D1 account, a real created database ID, measured quota consumption, a verified clock/cron run, market-data-rights approval, and a genuine successful first settlement. Native Vercel Hobby Cron cannot produce five-minute unattended audits, and Vercel source requests still consume finite Vercel Function invocations when uncached. No unlimited-free or guaranteed-accuracy claim is supported.
