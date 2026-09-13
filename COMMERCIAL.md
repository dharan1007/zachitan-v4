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

## Founding offers

The commercial workspace page supports public-safe onboarding links through:

- `NEXT_PUBLIC_ZACHITAN_ONBOARDING_URL`
- `NEXT_PUBLIC_ZACHITAN_BUNDLE_URL`

When those values are absent, the page falls back to contact-based onboarding. Do not commit payment-processor secrets.

## Hosting boundary

The existing Vercel Hobby project remains a research/demo deployment. Do not use that Hobby deployment as the paid production service. Use a hosting plan and data sources whose terms permit the final commercial use, or deliver the initial workspace locally/self-hosted.

## Product boundary

The commercial offer is research-workflow software: BYOD handling, evidence/provenance, research organization, exports and validation handoff. It does not include brokerage, order routing, personalized buy/sell/hold calls, guaranteed prices, or guaranteed returns.
