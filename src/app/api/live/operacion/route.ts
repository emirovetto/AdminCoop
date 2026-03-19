import { NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { LIVE_CHANNELS, type LiveActivitySnapshot, getLiveActivitySnapshot } from "@/lib/live-activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatSseEvent(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function getChangedChannels(previous: LiveActivitySnapshot | null, next: LiveActivitySnapshot) {
  if (!previous) {
    return [...LIVE_CHANNELS];
  }

  return LIVE_CHANNELS.filter((channel) => previous.channels[channel] !== next.channels[channel]);
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return new Response("No autenticado.", { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastSnapshot: LiveActivitySnapshot | null = null;
      let closed = false;
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const safeClose = () => {
        if (closed) {
          return;
        }

        closed = true;
        if (pollTimer) {
          clearInterval(pollTimer);
        }
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
        }

        try {
          controller.close();
        } catch {
          // The stream might already be closed by the runtime.
        }
      };

      const push = (event: string, payload: unknown) => {
        if (closed) {
          return;
        }

        controller.enqueue(encoder.encode(formatSseEvent(event, payload)));
      };

      const emitSnapshot = async (initial = false) => {
        try {
          const snapshot = await getLiveActivitySnapshot();
          const changedChannels = getChangedChannels(lastSnapshot, snapshot);

          if (initial || changedChannels.length > 0) {
            push(initial ? "snapshot" : "activity", {
              ...snapshot,
              changedChannels,
            });
            lastSnapshot = snapshot;
          }
        } catch (error) {
          push("stream-error", {
            error: error instanceof Error ? error.message : "No se pudo calcular la actividad en vivo.",
          });
        }
      };

      push("ready", {
        connectedAt: new Date().toISOString(),
      });
      void emitSnapshot(true);

      pollTimer = setInterval(() => {
        void emitSnapshot(false);
      }, 15000);

      heartbeatTimer = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        }
      }, 25000);

      request.signal.addEventListener("abort", safeClose);
    },
    cancel() {
      // Cleanup is handled through request.abort and controller.close guards.
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
