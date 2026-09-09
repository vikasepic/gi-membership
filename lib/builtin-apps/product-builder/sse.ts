import "server-only";
import type { StreamEvent } from "./types";

export type Emit = (event: StreamEvent) => void;

/**
 * Wrap a long-running job in a server-sent-events response. `run` receives an
 * emit function; events are JSON objects on `data:` lines. If the browser
 * disconnects, emit becomes a no-op so the job can still finish its writes,
 * which is what lets a build that outlives its tab still land in the table.
 */
export function sseResponse(run: (emit: Emit) => Promise<void>): Response {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await run(emit);
      } catch (err) {
        // The one place an app error is allowed to surface: as an event on
        // the stream, never as an exception out of the handler. The store
        // runs in the same process, and a crash here is a crash there.
        console.error("[builtin-app] stream job failed", err);
        emit({ type: "error", code: "internal_error" });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
