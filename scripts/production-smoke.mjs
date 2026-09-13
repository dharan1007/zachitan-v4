import { runProductionSmoke } from '../lib/production-smoke.mjs';

const baseUrl = process.env.ZACHITAN_BASE_URL || 'https://zachitan.vercel.app';
const expectedSha = process.env.EXPECTED_SHA || '';

try {
  const result = await runProductionSmoke({ baseUrl, expectedSha });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
