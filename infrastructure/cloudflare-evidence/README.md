# Independent scheduled evidence service

Status in this repository: **IMPLEMENTATION ONLY / NOT DEPLOYED**. Never mark it "always running" until the deployed Worker confirms scheduler activity and genuine settled outcomes.

Cloudflare Cron + a dedicated D1 database operate without GitHub Actions, Vercel Cron, Vercel Edge Functions, or an open browser. Cloudflare Free has finite invocation CPU and database limits. This initial independent model covers Coinbase Exchange 5-minute BTC-USD and ETH-USD only. It forecasts the NEXT NOT-YET-OPEN candle, deliberately skipping the currently in-progress one: a 10-minute (two 5-minute source-bar) target beyond the last completed source origin. It is not a one-bar forecast. Other markets, instruments, horizons and trading calendars require separately verifiable coverage. Do not claim that this initial deployment evaluates all asset classes.

## Account-specific prerequisites
The currently connected tools do not provide the user's Cloudflare project, D1 database, Worker deployment credentials or project-specific environment configuration. Do not attach this service to a database from another production application.

On a machine signed into the authorized Cloudflare account, from this folder:
1. Run npx wrangler d1 create zachitan-independent-evidence. Copy the ACTUAL returned database ID into wrangler.toml; do not invent one.
2. Run npx wrangler d1 execute zachitan-independent-evidence --remote --file=./schema.sql.
3. Check SITE_ORIGIN is the real public Zachitan origin. Review data rights and security.
4. Run npx wrangler deploy and record the real returned https://...workers.dev origin.
5. After at least two completed five-minute observation periods, check GET /health and GET /v1/report?symbol=BTC-USD. Confirm actuallyRunning is true and earlier issued forecasts have genuinely matured.
6. Set the frontend public environment variable NEXT_PUBLIC_ZACHITAN_EVIDENCE_URL to that EXACT worker origin, and deploy the frontend. It calls Cloudflare directly and uses no extra Vercel API call for independent audit reads.

Each forecast has a deterministic ID, source, original as-issued targets, separate baseline, source timestamp, model version and outcome timestamp. Only the scheduled handler writes. A genuine publisher candle at exactly the predeclared two-five-minute-step target slot can settle it. If the venue omits that interval, it is UNOBSERVED_GAP; no synthetic price or trade volume is substituted. Replayed API requests do not issue forecasts.

This small edge model differs explicitly from the V6/analogue model displayed on the main market page. It chooses per-field adjustments only using previously settled forecasts. Until enough actually settled results are available, it publishes a labelled naive baseline for measurement, never a claim of positive skill. No bank consensus or broker order recommendation is manufactured.

## Resource envelope
One schedule every five minutes, at most two upstream instrument reads per run, at most two monitored products. Roughly 288 scheduled invocations/day and at most 576 five-minute issuances/day, excluding failures and missing publisher intervals. Cloudflare Workers Free advertises 10ms CPU/invocation and 100k requests/day; D1 Free has 5M read and 100k written rows/day. Deployment MUST measure actual CPU usage before relying on the free tier. If resources fail, last successful run ages out and the health endpoint reports that scheduled processing is NOT currently healthy. There is no guarantee of perpetually free service or guaranteed published predictions.

Public GET responses reveal evidence, not credentials; only Cloudflare's scheduled handler can write. Before public launch configure Cloudflare WAF/rate protection and review privacy and exchange licensing. No user-specific trades, accounts, orders or personal financial data are stored.
