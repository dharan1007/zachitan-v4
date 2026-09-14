import { handleGet } from '@/lib/market-api-v6.mjs';

export async function GET(request) {
  return handleGet(request);
}
