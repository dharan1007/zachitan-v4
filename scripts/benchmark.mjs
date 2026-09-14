import fs from 'node:fs/promises';
import path from 'node:path';
import * as yf from '../lib/providers/yahoo.mjs';
import * as cb from '../lib/providers/coinbase.mjs';
import { validateEnsemble } from '../lib/model-v5.mjs';
import { evaluatePublicationHoldout } from '../lib/model-holdout.mjs';

const universe = [
  { symbol: 'AAPL', name: 'Apple', assetClass: 'US equity', provider: 'yahoo' },
  { symbol: 'SPY', name: 'S&P 500 ETF', assetClass: 'US ETF', provider: 'yahoo' },
  { symbol: '^NSEI', name: 'NIFTY 50', assetClass: 'India index', provider: 'yahoo' },
  { symbol: 'GC=F', name: 'Gold futures', assetClass: 'commodity future', provider: 'yahoo' },
  { symbol: 'CL=F', name: 'Crude oil futures', assetClass: 'commodity future', provider: 'yahoo' },
  { symbol: 'USDINR=X', name: 'USD/INR', assetClass: 'FX', provider: 'yahoo' },
  { symbol: 'BTC-USD', name: 'Bitcoin', assetClass: 'crypto', provider: 'coinbase' },
  { symbol: 'ETH-USD', name: 'Ethereum', assetClass: 'crypto', provider: 'coinbase' },
];
const horizons = [5, 20];

async function history(x) {
  if (x.provider === 'coinbase') return cb.candles(x.symbol, 86400, 1200);
  return (await yf.chart(x.symbol, '1d', '5y')).candles;
}

function median(values) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}
function mean(values) {
  const xs = values.filter(Number.isFinite);
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

const rows = [];
for (const instrument of universe) {
  try {
    const candles = await history(instrument);
    for (const horizon of horizons) {
      const v = validateEnsemble(candles, horizon, 60);
      const q = evaluatePublicationHoldout(candles, horizon, { minimumChecks: 8, trainingChecks: 60 });
      rows.push({
        ...instrument,
        horizon,
        observations: candles.length,
        available: !!v.available,
        checks: v.checks ?? 0,
        nonOverlapping: v.nonOverlapping ?? null,
        maseNoChange: v.maseNoChange ?? null,
        ensembleSkillVsNoChange: v.ensembleSkillVsNoChange ?? null,
        legacyAnalogueSkillVsNoChange: v.legacyAnalogueSkillVsNoChange ?? null,
        ensembleDirectionAccuracy: v.ensembleDirectionAccuracy ?? null,
        candidateMae: v.candidateMae ?? null,
        finalWeights: v.finalWeights ?? null,
        brier: v.brier ?? null,
        brierSkillVs50: v.brierSkillVs50 ?? null,
        qualificationAvailable: !!q.available,
        qualificationState: q.state ?? 'INSUFFICIENT',
        qualified: !!q.qualified,
        holdoutChecks: q.checks ?? 0,
        holdoutPointSkillVsNoChange: q.pointSkillVsNoChange ?? null,
        holdoutBrierSkillVs50: q.brierSkillVs50 ?? null,
        holdoutDirectionAccuracy: q.directionAccuracy ?? null,
        holdoutPointSkill90: q.confidence?.pointSkill90 ?? null,
        holdoutBrierSkill90: q.confidence?.brierSkill90 ?? null,
        driftDetected: !!q.drift?.detected,
        qualificationReason: q.reason ?? null,
        reason: v.reason ?? null,
      });
    }
  } catch (error) {
    for (const horizon of horizons) rows.push({ ...instrument, horizon, available: false, checks: 0, qualificationAvailable: false, qualified: false, holdoutChecks: 0, error: error?.message || String(error) });
  }
}

const valid = rows.filter(x => x.available);
const holdoutValid = rows.filter(x => x.qualificationAvailable);
const uniqueInstruments = new Set(valid.map(x => x.symbol)).size;
const pointPositive = valid.filter(x => x.ensembleSkillVsNoChange > 0).length;
const probabilityPositive = valid.filter(x => x.brierSkillVs50 > 0).length;
const jointPositive = valid.filter(x => x.ensembleSkillVsNoChange > 0 && x.brierSkillVs50 > 0).length;
const ensembleBeatsLegacy = valid.filter(x => Number.isFinite(x.ensembleSkillVsNoChange) && Number.isFinite(x.legacyAnalogueSkillVsNoChange) && x.ensembleSkillVsNoChange > x.legacyAnalogueSkillVsNoChange).length;
const holdoutQualified = holdoutValid.filter(x => x.qualified).length;
const aggregate = {
  requestedCases: rows.length,
  validCases: valid.length,
  holdoutValidCases: holdoutValid.length,
  uniqueInstruments,
  medianEnsembleSkillVsNoChange: median(valid.map(x => x.ensembleSkillVsNoChange)),
  meanEnsembleSkillVsNoChange: mean(valid.map(x => x.ensembleSkillVsNoChange)),
  medianLegacyAnalogueSkillVsNoChange: median(valid.map(x => x.legacyAnalogueSkillVsNoChange)),
  ensembleBeatsLegacyRate: valid.length ? ensembleBeatsLegacy / valid.length : 0,
  medianBrierSkillVs50: median(valid.map(x => x.brierSkillVs50)),
  pointPositiveRate: valid.length ? pointPositive / valid.length : 0,
  probabilityPositiveRate: valid.length ? probabilityPositive / valid.length : 0,
  jointPositiveRate: valid.length ? jointPositive / valid.length : 0,
  medianDirectionAccuracy: median(valid.map(x => x.ensembleDirectionAccuracy)),
  holdoutQualifiedRate: holdoutValid.length ? holdoutQualified / holdoutValid.length : 0,
  medianHoldoutPointSkill: median(holdoutValid.map(x => x.holdoutPointSkillVsNoChange)),
  medianHoldoutBrierSkill: median(holdoutValid.map(x => x.holdoutBrierSkillVs50)),
  medianHoldoutDirectionAccuracy: median(holdoutValid.map(x => x.holdoutDirectionAccuracy)),
  driftDetectedRate: holdoutValid.length ? holdoutValid.filter(x => x.driftDetected).length / holdoutValid.length : 0,
};

const broadAccuracyGate = {
  minimumValidCases: 12,
  minimumUniqueInstruments: 6,
  minimumJointPositiveRate: 0.65,
  minimumMedianPointSkill: 0.02,
  minimumMedianBrierSkill: 0.01,
  minimumEnsembleBeatsLegacyRate: 0.55,
  minimumHoldoutQualifiedRate: 0.65,
  minimumMedianHoldoutPointSkill: 0.02,
  minimumMedianHoldoutBrierSkill: 0.01,
};
const broadAccuracyClaimAllowed =
  aggregate.validCases >= broadAccuracyGate.minimumValidCases &&
  aggregate.uniqueInstruments >= broadAccuracyGate.minimumUniqueInstruments &&
  aggregate.jointPositiveRate >= broadAccuracyGate.minimumJointPositiveRate &&
  aggregate.ensembleBeatsLegacyRate >= broadAccuracyGate.minimumEnsembleBeatsLegacyRate &&
  aggregate.holdoutQualifiedRate >= broadAccuracyGate.minimumHoldoutQualifiedRate &&
  (aggregate.medianEnsembleSkillVsNoChange ?? -Infinity) >= broadAccuracyGate.minimumMedianPointSkill &&
  (aggregate.medianBrierSkillVs50 ?? -Infinity) >= broadAccuracyGate.minimumMedianBrierSkill &&
  (aggregate.medianHoldoutPointSkill ?? -Infinity) >= broadAccuracyGate.minimumMedianHoldoutPointSkill &&
  (aggregate.medianHoldoutBrierSkill ?? -Infinity) >= broadAccuracyGate.minimumMedianHoldoutBrierSkill;

const report = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  methodology: 'Zachitan V6 uses chronological non-overlapping walk-forward validation plus a later untouched publication holdout. Candidate weights and probability calibration are frozen before the holdout window; holdout origins are never used to tune the model. Publication qualification also fails closed on recent holdout drift. Point skill is compared with unchanged price and probability skill with a 50/50 baseline.',
  universe,
  horizons,
  aggregate,
  broadAccuracyGate,
  broadAccuracyClaimAllowed,
  rows,
  warning: broadAccuracyClaimAllowed ? 'The automated validation and untouched-holdout screen passed its stated thresholds. This is evidence, not a guarantee of future market performance.' : 'Broad market-prediction accuracy claims are not permitted by this benchmark result. V6 publication remains selective and fail-closed.',
};

const out = process.env.BENCHMARK_OUTPUT || 'benchmark-output/report.json';
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (valid.length < 8 || holdoutValid.length < 8) {
  console.error(`Only ${valid.length}/${rows.length} validation cases and ${holdoutValid.length}/${rows.length} untouched-holdout cases were usable.`);
  process.exitCode = 2;
}
