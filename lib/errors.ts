import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

// Recording failures, and queueing the ones worth trying again.
//
// Everything here swallows its own errors. This is the code that runs when
// something has ALREADY gone wrong; if it threw, it would convert a logged
// problem into an unhandled one — usually inside a catch block that exists to
// protect a completed purchase.

/** Jobs the retry sweep knows how to perform again. */
export type JobKind = "ac_tag" | "app_entitlement" | "crm_event" | "bump_charge" | "tracking_event";

/**
 * Backoff in minutes by attempt number: 1, 5, 15, 60, 180.
 *
 * Front-loaded because most failures are a blip — a timeout, a 502 — and
 * clear within minutes. The long tail exists for a provider being genuinely
 * down, where hammering it every minute helps nobody.
 */
const BACKOFF_MINUTES = [1, 5, 15, 60, 180];
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length;

export async function recordError(args: {
  source: string;
  message: string;
  context?: Record<string, unknown>;
  /** Provide both to make it retryable; omit for a log-only entry. */
  jobKind?: JobKind;
  jobPayload?: Record<string, unknown>;
}): Promise<void> {
  // Keep the console line: the container log is still the fastest place to
  // look during an incident, and this table is no use if the DB is the problem.
  console.error(`[${args.source}] ${args.message}`, args.context ?? {});
  try {
    const db = createServiceClient();
    const retryable = args.jobKind != null && args.jobPayload != null;
    await db.from("error_events").insert({
      store_id: await getStoreId(),
      source: args.source,
      message: args.message.slice(0, 2000),
      context: args.context ?? {},
      job_kind: retryable ? args.jobKind : null,
      job_payload: retryable ? args.jobPayload : null,
      next_attempt_at: retryable
        ? new Date(Date.now() + BACKOFF_MINUTES[0] * 60_000).toISOString()
        : null,
    });
  } catch (e) {
    // Nothing left to do but say so. Swallowing this is the point.
    console.error("[errors] could not record error event:", e);
  }
}

/** Turn an unknown thrown value into something worth reading later. */
export function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown error";
  }
}

export function nextAttemptAt(attempts: number): string | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return new Date(Date.now() + BACKOFF_MINUTES[attempts] * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// Admin reads.
// ---------------------------------------------------------------------------

export type ErrorEvent = {
  id: string;
  source: string;
  message: string;
  context: Record<string, unknown>;
  jobKind: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

/**
 * Unresolved first, newest first. Resolved rows are kept so a retry that
 * eventually worked leaves evidence it had been failing — the pattern of
 * "this fails every night at 2am and then recovers" is only visible if the
 * successes are recorded next to the failures.
 */
export async function listErrorEvents(limit = 100): Promise<ErrorEvent[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("error_events")
    .select("id, source, message, context, job_kind, attempts, next_attempt_at, resolved_at, created_at")
    .eq("store_id", await getStoreId())
    .order("resolved_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    source: r.source as string,
    message: r.message as string,
    context: (r.context ?? {}) as Record<string, unknown>,
    jobKind: (r.job_kind as string) ?? null,
    attempts: (r.attempts as number) ?? 0,
    nextAttemptAt: (r.next_attempt_at as string) ?? null,
    resolvedAt: (r.resolved_at as string) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function unresolvedErrorCount(): Promise<number> {
  const db = createServiceClient();
  const { count } = await db
    .from("error_events")
    .select("id", { count: "exact", head: true })
    .eq("store_id", await getStoreId())
    .is("resolved_at", null);
  return count ?? 0;
}
