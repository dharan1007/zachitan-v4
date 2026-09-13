export async function GET() {
  return Response.json(
    {
      ok: false,
      error: 'provider_routes_disabled',
      message: 'Provider-backed data routes are disabled in this commercial build. Use the BYOD endpoint with data you are authorized to use.',
    },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
}
