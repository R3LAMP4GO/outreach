import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { sseManager } from "@/lib/realtime/sse-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/outreach/replies/stream
 *
 * Server-Sent Events stream of inbox events. Emits `reply:new` whenever a row
 * is inserted into `outreach_replies` (via Postgres NOTIFY → pg-listener →
 * sse-manager). Sends a `connected` frame on open and `ping` every ~25s to
 * keep proxies (Cloudflare 100s idle) from killing the connection.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["admin", "super_admin"].includes(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = session.user.id;
  const encoder = new TextEncoder();
  let clientId: string | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      clientId = sseManager.addClient(controller, userId);
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`),
      );

      const onAbort = () => {
        if (clientId) {
          sseManager.removeClient(clientId);
          clientId = null;
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      if (request.signal.aborted) {
        onAbort();
      } else {
        request.signal.addEventListener("abort", onAbort, { once: true });
      }
    },
    cancel() {
      if (clientId) {
        sseManager.removeClient(clientId);
        clientId = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
