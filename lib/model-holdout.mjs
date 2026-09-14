import { forecast as legacyForecast } from './forecast.mjs';
import { validateEnsemble, ensembleForecast, calibratedProbability } from './model-v5.mjs';
import { assessHoldoutRows } from './model-qualification.mjs';

export function evaluatePublicationHoldout(candles = [], horizon = 12, { minimumChecks = 8, trainingChecks = 60 } = {}) {
  const n = Array.isArray(candles) ? candles.length : 0;
  if (n < 300 + horizon + minimumChecks * horizon) return assessHoldoutRows([], { minimumChecks });

  const desiredHoldoutBars = Math.max(minimumChecks * horizon + 1, Math.floor(n * 0.30));
  const splitIndex = Math.max(300 + horizon, n - desiredHoldoutBars);
  if (n - splitIndex < minimumChecks * horizon) return assessHoldoutRows([], { minimumChecks });

  const trainingCandles = candles.slice(0, splitIndex);
  const trainingValidation = validateEnsemble(trainingCandles, horizon, trainingChecks);
  if (!trainingValidation?.available) return {
    ...assessHoldoutRows([], { minimumChecks }),
    reason: `Frozen training validation was unavailable: ${trainingValidation?.reason || 'unknown reason'}`,
    trainingValidation,
  };

  const rows = [];
  const probabilityAlpha = trainingValidation.probabilityCalibrationAlpha ?? 0;
  for (let origin = splitIndex - 1; origin + horizon < n; origin += horizon) {
    const prefix = candles.slice(0, origin + 1);
    const current = candles[origin]?.close;
    const actual = candles[origin + horizon]?.close;
    if (!(current > 0 && actual > 0)) continue;
    const legacy = legacyForecast(prefix, horizon, null);
    if (!legacy?.available) continue;
    const ensemble = ensembleForecast(prefix, horizon, trainingValidation, legacy);
    if (!ensemble?.available) continue;
    const actualReturn = Math.log(actual / current);
    const pUp = calibratedProbability(legacy.direction?.up ?? 0.5, probabilityAlpha);
    const outcomeUp = actualReturn > 0 ? 1 : 0;
    rows.push({
      origin,
      time: candles[origin]?.time ?? null,
      actualTime: candles[origin + horizon]?.time ?? null,
      absLogError: Math.abs(actualReturn - ensemble.return),
      naiveAbsLogError: Math.abs(actualReturn),
      pUp,
      outcomeUp,
      directionCorrect: Math.sign(ensemble.return) !== 0 && Math.sign(ensemble.return) === Math.sign(actualReturn),
    });
  }

  const assessment = assessHoldoutRows(rows, { minimumChecks });
  return {
    ...assessment,
    methodology: 'Frozen pre-holdout candidate weights and probability calibration; chronological non-overlapping untouched evaluation origins.',
    splitIndex,
    holdoutStartTime: candles[splitIndex]?.time ?? null,
    holdoutEndTime: candles.at(-1)?.time ?? null,
    trainingRows: trainingCandles.length,
    trainingValidationChecks: trainingValidation.checks ?? 0,
    trainingPointSkill: trainingValidation.ensembleSkillVsNoChange ?? null,
    trainingBrierSkill: trainingValidation.brierSkillVs50 ?? null,
    frozenWeights: trainingValidation.finalWeights ?? null,
    probabilityCalibrationAlpha: probabilityAlpha,
  };
}
