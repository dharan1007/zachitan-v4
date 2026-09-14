import { loadMarketSource } from './market-source-v6.mjs';

export async function buildMarketDataV6(input) {
  return loadMarketSource(input);
}
