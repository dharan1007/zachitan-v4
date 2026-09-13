# Zachitan Commercial Build

Zachitan intentionally separates the public research build from the paid/self-hosted commercial build.

## Public research build

The default `research` mode preserves the current source-first research terminal and provider integrations, subject to each provider's terms and availability.

## Commercial build

Build with:

```bash
ZACHITAN_RUNTIME_MODE=commercial npm run build
```

In this mode Next.js rewrites `/api/data` to `/api/commercial-blocked`, which returns HTTP 403. The commercial build therefore does not use Zachitan's built-in third-party provider aggregation route.

Commercial-safe routes include:

- `/commercial`
- `/api/commercial-capabilities`
- `/api/byod/analyze`
- `/legal/data-rights`

The customer supplies data they own or are authorized to use. Zachitan does not grant exchange, publisher, or market-data licenses.

## Founding offers and intake

The current zero-cost intake form is:

`https://tally.so/r/OD6BP8`

The commercial workspace uses it by default and records UTM parameters for workspace/bundle attribution. The default offers are:

- Zachitan research workspace setup — ₹2,999
- Zachitan + Stanius founding bundle — ₹9,999

The public-safe environment variables `NEXT_PUBLIC_ZACHITAN_ONBOARDING_URL` and `NEXT_PUBLIC_ZACHITAN_BUNDLE_URL` can replace those URLs later without changing application code. Do not commit payment-processor secrets.

Payment is intentionally not collected inside the application yet. Scope and data-rights fit are reviewed first, then a payment instruction/link can be sent manually. This avoids building billing infrastructure before demand is established.

## Hosting boundary

The existing Vercel Hobby project remains a research/demo deployment. Do not use that Hobby deployment as the paid production service. Use a hosting plan whose terms permit the final commercial use, or deliver the initial workspace locally/self-hosted.

## Product boundary

The commercial offer is research-workflow software: BYOD handling, evidence/provenance, research organization, exports and validation handoff. It does not include brokerage, order routing, personalized buy/sell/hold calls, guaranteed prices, or guaranteed returns.
