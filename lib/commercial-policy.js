const VALID_MODES = new Set(['research', 'commercial']);

export function runtimeMode() {
  const raw = String(process.env.ZACHITAN_RUNTIME_MODE || 'research').trim().toLowerCase();
  return VALID_MODES.has(raw) ? raw : 'research';
}

export function providerFetchAllowed() {
  return runtimeMode() !== 'commercial';
}

export function assertProviderFetchAllowed(sourceId) {
  if (!providerFetchAllowed()) {
    throw new Error(`Provider ${sourceId || 'unknown'} is blocked in commercial mode. Use customer-supplied or customer-licensed data through the BYOD path.`);
  }
}

export function commercialCapabilities() {
  const mode = runtimeMode();
  return {
    runtimeMode: mode,
    byod: 'available',
    investmentAdvice: 'not_provided',
    tradeExecution: 'not_provided',
    guaranteedReturns: 'not_claimed',
    providerPolicy: mode === 'commercial' ? 'blocked_in_commercial_build' : 'research_mode_provider_access',
    dataRights: 'Users are responsible for rights to datasets they upload, connect, analyze, export, or redistribute.',
    positioning: 'research workspace and evidence/provenance software',
  };
}
