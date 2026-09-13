# Zachitan Commercial Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe Zachitan into a commercial-safe research workspace with fail-closed source policy, BYOD workflow, explicit commercial capability metadata, and stronger legal/data-rights boundaries.

**Architecture:** Centralize runtime policy in a small library module consumed by API routes and UI. In commercial mode, provider-backed routes are blocked unless explicitly approved; user-supplied data remains usable through a dedicated BYOD contract. The homepage/commercial page emphasizes provenance, research workflow, and validation instead of monetizing security-specific predictions.

**Tech Stack:** Next.js 16, React 19, Node 24, native Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-13-commercial-hardening-design.md`

## Global Constraints

- `research` preserves the current research experience.
- `commercial` fails closed for non-approved server-side market-data redistribution.
- BYOD/customer-licensed data is the default commercial data path.
- No payment secrets are committed; purchase/onboarding URLs are environment configuration only.
- Existing `npm test` and `npm run build` remain green.
- No individualized recommendations, execution, profit guarantees, or unsupported forecast-accuracy claims.

---

### Task 1: Commercial runtime/source policy

**Files:**
- Create: `lib/commercial-policy.js`
- Create: `tests/commercial-policy.test.mjs`
- Modify provider-facing API route helpers under `app/api/**`
- Create: `app/api/commercial-capabilities/route.js`

**Interfaces:**
- Produces: `runtimeMode()`, `providerFetchAllowed(sourceId)`, `assertProviderFetchAllowed(sourceId)`, `commercialCapabilities()`

- [ ] Write failing tests for default research mode, commercial-mode provider blocking, approved-source override behavior, and capability metadata.
- [ ] Run `npm test` and confirm the new tests fail for missing policy code.
- [ ] Implement policy module with explicit environment-driven approved source list.
- [ ] Wire provider-facing routes through the policy at a shared boundary rather than scattering checks through UI code.
- [ ] Add the capability endpoint and confirm targeted/full tests pass.

### Task 2: BYOD research contract

**Files:**
- Create: `lib/byod.js`
- Extend: `tests/commercial-policy.test.mjs`
- Create: `app/api/byod/analyze/route.js`

**Interfaces:**
- Produces: `normalizeUserSeries(records)` returning chronological normalized observations and validation metadata.

- [ ] Add failing tests for valid data, missing OHLC keys, invalid numbers, duplicate timestamps, and insufficient rows.
- [ ] Implement deterministic normalization without external network access.
- [ ] Add an API route that returns normalized research metadata and never calls a provider.
- [ ] Include `sourceKind: user_supplied`, user data-rights responsibility, and non-advice language in response metadata.
- [ ] Run full tests.

### Task 3: Commercial research-workspace UI

**Files:**
- Create: `app/commercial/page.js`
- Create: `app/commercial/CommercialWorkspace.js` only if client interactivity is required
- Modify: `app/page.js`
- Modify: `app/components/Footer` implementation
- Modify: `app/globals.css`

**Interfaces:**
- Route: `/commercial`

- [ ] Add a route/source-contract test that verifies commercial copy does not claim guaranteed accuracy/profit and includes BYOD/provenance/data-rights language.
- [ ] Build a focused landing/workspace surface for Founding Research Workspace access and Stanius validation handoff.
- [ ] Keep existing research pages intact.
- [ ] Expose configured onboarding/payment URL only when provided through public-safe environment configuration; otherwise show a manual-contact/founding-access state.
- [ ] Run tests and build.

### Task 4: Legal/data-rights hardening

**Files:**
- Modify: `app/legal/terms/page.js`
- Modify: `app/legal/privacy/page.js`
- Modify: `app/legal/beta/page.js`
- Create: `app/legal/data-rights/page.js`
- Create: `app/legal/commercial-license/page.js`

- [ ] Add tests or static assertions for data-rights responsibility, non-advice language, refund/service-delivery disclosure, and absence of contradictory guarantee language.
- [ ] Update legal surfaces to distinguish research software access from regulated advice/recommendations.
- [ ] State that customer-uploaded/connected data must be lawfully obtained and licensed for the customer's intended use.
- [ ] Run full verification.

### Task 5: Deployment truth and pull request

**Files:**
- Modify: `README.md`
- Modify: `RELEASE_NOTES.md`

- [ ] Document that the Vercel Hobby deployment is research/demo only and not the paid commercial production host.
- [ ] Document self-hosted/static/client-heavy commercial delivery options and required runtime environment variables.
- [ ] Run `npm run verify` in CI/release checks.
- [ ] Open a pull request from the isolated commercial-hardening branch and inspect deployment/build status before merge.
