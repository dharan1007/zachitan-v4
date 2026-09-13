import { handleGet } from '@/lib/market-api-v5.mjs';

export async function GET(request) {
  return handleGet(request);
}
