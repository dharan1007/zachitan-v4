const VALID_MODES = new Set(['research', 'commercial']);

export function runtimeMode() {
  const raw = String(process.env.ZACHITAN_RUNTIME_MODE || 'research').trim().toLowerCase();
  return VALID_MODES.has(raw) ? raw : 'research';
}

export function approvedCommercialSources() {
  return new Set(
    String(process.env.ZACHITAN_COMMERCIAL_APPROVED_SOURCES || '')
      .split(',')
      .map(x => x.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function providerFetchAllowed(sourceId) {
  if (runtimeMode() !== 'commercial') return true;
  return approvedCommercialSources().has(String(sourceId || '').trim().toLowerCase());
}

export function assertProviderFetchAllowed(sourceId) {
  if (!providerFetchAllowed(sourceId)) {
    throw new Error(`Provider ${sourceId || 'unknown'} is blocked in commercial mode. Use authorized BYOD data or an explicitly approved source.`);
  }
}

export function commercialCapabilities() {
  return {
    runtimeMode: runtimeMode(),
    byod: 'available',
    investmentAdvice: 'not_provided',
    tradeExecution: 'not_provided',
    guaranteedReturns: 'not_claimed',
    providerPolicy: runtimeMode() === 'commercial' ? 'deny_unless_explicitly_approved' : 'research_mode_provider_access',
    approvedSources: [...approvedCommercialSources()].sort(),
    dataRights: 'Users are responsible for rights to datasets they upload, connect, analyze, export, or redistribute.',
    positioning: 'research workspace and evidence/provenance software',
  };
}
