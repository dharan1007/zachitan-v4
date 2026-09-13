# Zachitan Commercial Hardening Design

## Goal
Turn Zachitan into a commercially usable research workspace without presenting paid security-specific predictions as investment recommendations, redistributing third-party market data without rights, or depending on paid infrastructure.

## Product boundary
Zachitan commercial mode is a research workspace for user-supplied or user-licensed data, evidence organization, provenance, watchlists, scenario analysis, and research exports. It is not a broker, execution venue, investment adviser, personalized recommendation service, or guaranteed prediction product.

## Runtime modes
Introduce explicit `research` and `commercial` modes.

- `research`: current public research behavior, subject to provider terms and labels.
- `commercial`: provider-backed server routes that rely on non-commercial or unclear redistribution rights fail closed unless an administrator explicitly enables an approved source. User-owned or user-licensed datasets remain allowed.

Runtime mode and source policy are exposed in a capability endpoint and visible in the UI.

## BYOD workspace
Commercial mode prioritizes imported datasets. The first release accepts normalized JSON/CSV-like data through a client-side or API contract, validates structure and chronology, and keeps source metadata supplied by the user. Zachitan must not imply that it has acquired redistribution rights for user data.

## Research workspace
Reframe the commercial UI around:

- evidence/provenance;
- saved research thesis and notes;
- user-supplied datasets;
- comparison and recurring-investment analytics;
- source-led research;
- export;
- optional handoff to Stanius for quantitative validation.

Prediction output remains experimental research and is not the commercial value proposition.

## Commercial capability and onboarding metadata
Add a machine-readable commercial capability definition describing what is available, blocked, manual, or experimental. Purchase/onboarding URLs are configured through environment variables; no processor secrets are committed.

## Legal/compliance surfaces
Strengthen existing legal pages and add a data-rights/commercial-license surface. Terms must explicitly distinguish software access from regulated research/advice and make the customer responsible for rights to uploaded datasets. No disclaimer may contradict product behavior.

## Frontend
Add a clear commercial-safe call-to-action for Research Workspace Setup / Founding access. The copy emphasizes provenance, workflow, user-owned data, and validation rather than profit or forecast accuracy. Existing research pages remain accessible in research mode.

## Deployment
The current Vercel Hobby project remains a non-commercial research/demo deployment. The commercial build is prepared to run as static/client-heavy output or on a commercially suitable host, while the first paid delivery can be self-hosted/manual to avoid paid infrastructure.

## Testing
Tests must verify policy decisions, commercial capability metadata, blocked provider routes in commercial mode, and accepted BYOD flow. Existing release checks (`npm test`, `npm run build`) must remain green.

## Non-goals
This release does not add brokerage, execution, individualized buy/sell/hold calls, automatic portfolio recommendations, licensed exchange redistribution, or unsupported claims of predictive superiority.
