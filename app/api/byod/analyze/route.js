import { normalizeUserSeries } from '@/lib/byod.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const normalized = normalizeUserSeries(body?.records);
    return Response.json(
      {
        ok: true,
        sourceKind: normalized.sourceKind,
        validation: normalized.validation,
        records: normalized.records,
        rightsNotice: normalized.rightsNotice,
        researchBoundary: 'User-supplied data normalization only; no provider fetch, trade execution, or personalized investment advice.',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || 'Invalid BYOD input' },
      { status: 422, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
