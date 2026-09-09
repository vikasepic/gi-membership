import type { StreamEvent } from "./types";

// Browser side of the app's routes. Same origin, so the store's session
// cookie goes with every request and nothing here handles credentials.

/**
 * POST to one of the app's routes. Returns the parsed JSON on success, or the
 * server's error code on failure.
 */
export async function callApi<T>(
  path: string,
  body: unknown,
): Promise<{ data: T | null; errorCode: string | null }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { data: null, errorCode: json?.error ?? "internal_error" };
    return { data: json as T, errorCode: null };
  } catch {
    return { data: null, errorCode: "network_error" };
  }
}

/**
 * POST to a streaming route and hand each server-sent event to onEvent.
 * Resolves when the stream closes. Returns an error code if the request could
 * not even start (access, network); mid-stream failures arrive as an "error"
 * event instead.
 */
export async function streamApi(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<{ errorCode: string | null }> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return { errorCode: null };
    return { errorCode: "network_error" };
  }

  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => null);
    return { errorCode: json?.error ?? "internal_error" };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          onEvent(JSON.parse(line.slice(6)) as StreamEvent);
        } catch {
          /* malformed event: skip */
        }
      }
    }
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) {
      onEvent({ type: "error", code: "stream_interrupted" });
    }
  }
  return { errorCode: null };
}
