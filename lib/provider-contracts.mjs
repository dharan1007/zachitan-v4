const REQUIRED = {
  coinbase: ['searchProducts', 'ticker', 'candles'],
  yahoo: ['search', 'chart', 'options'],
  amfi: ['search', 'history'],
  ecb: ['fx'],
};

export function verifyProviderContracts(providers) {
  const failures = [];
  for (const [name, methods] of Object.entries(REQUIRED)) {
    const provider = providers?.[name];
    if (!provider) {
      failures.push(`${name}: provider missing`);
      continue;
    }
    for (const method of methods) {
      if (typeof provider[method] !== 'function') failures.push(`${name}.${method}: function missing`);
    }
  }
  if (failures.length) throw new Error(`Provider contract violation: ${failures.join('; ')}`);
  return true;
}

export const providerContract = REQUIRED;
