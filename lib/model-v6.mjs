import { forecastV5 } from './model-v5.mjs';

function withoutTargets(value, state, status, reason = null) {
  return {
    ...value,
    center: null,
    ranges: Object.fromEntries([50, 80, 90, 95, 99].map(k => [k, null])),
    decisionState: state,
    modelStatus: status,
    abstainReason: state === 'ABSTAIN' ? reason : null,
    points: (value.points || []).map(point => ({ ...point, price: null, change: null, ranges: { 50: null, 80: null, 90: null } })),
  };
}

export function forecastV6(candles, horizon = 12, validation = null, qualification = null) {
  // Publication must use exactly the pre-holdout weights and probability fit
  // that were scored on the untouched chronological holdout, not a model
  // re-fit on that holdout's outcomes.
  const fittedValidation = qualification?.trainingValidation?.available
    ? qualification.trainingValidation : validation;
  const base = forecastV5(candles, horizon, fittedValidation);
  if (!base?.available) return base;
  const value = { ...base, pointModel: 'adaptive-ensemble-v1-holdout-gated', publicationQualification: qualification || null };
  if (base.decisionState === 'ABSTAIN') return value;
  if (!qualification?.available) return withoutTargets(value, 'RESEARCH_ONLY', 'holdout-qualification-insufficient');
  if (!qualification.qualified) return withoutTargets(value, 'ABSTAIN', qualification?.drift?.detected ? 'holdout-drift-abstain' : 'holdout-unqualified-abstain', qualification.reason || 'Holdout qualification failed.');
  if (base.decisionState !== 'PUBLISHABLE') return withoutTargets(value, 'RESEARCH_ONLY', base.modelStatus || 'validation-insufficient');
  return { ...value, modelStatus: 'validated-positive-skill-holdout-qualified', abstainReason: null };
}
