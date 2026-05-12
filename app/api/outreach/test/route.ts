/**
 * GET /api/outreach/test
 *
 * Simple test endpoint to verify API is working
 */
export async function GET() {
  return Response.json(
    {
      status: "ok",
      message: "API is responding",
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
