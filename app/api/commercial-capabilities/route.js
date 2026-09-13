import { commercialCapabilities } from '@/lib/commercial-policy.js';

export async function GET() {
  return Response.json({ ok: true, ...commercialCapabilities() }, { headers: { 'Cache-Control': 'no-store' } });
}
