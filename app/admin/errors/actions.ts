"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { createServiceClient } from "@/lib/supabase/server";
import { runDueJobs } from "@/lib/retry";
import { repairSubscriptionDrift } from "@/lib/subscription-reconcile";

/**
 * Run one queued job immediately, rather than waiting for its backoff.
 *
 * Implemented by making the row due and running the ordinary sweep, so the
 * manual path and the cron path are the same code — a "retry now" button that
 * worked differently from the automatic retry would be the button most likely
 * to lie about whether the real thing will succeed.
 */
export async function retryNowAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const db = createServiceClient();
  await db
    .from("error_events")
    .update({ next_attempt_at: new Date().toISOString() })
    .eq("id", id)
    .is("resolved_at", null);

  await runDueJobs();
  revalidatePath("/admin/errors");
}

/**
 * Make our subscription records match Stripe.
 *
 * Deliberately a button rather than something that runs on its own: it gives
 * access back to people, and a repair that happens quietly is one nobody can
 * check afterwards.
 */
export async function repairDriftAction(): Promise<void> {
  await requireAdmin();
  await repairSubscriptionDrift();
  revalidatePath("/admin/errors");
}

/**
 * Close an error by hand: a log-only row once its cause is fixed or the
 * chargeback answered, or a job someone dealt with outside the queue.
 *
 * A log-only row has nothing to retry, so until 23 Oct 2026 nothing could
 * close it, and fixed problems stayed in "Unresolved" and the sidebar badge
 * forever. A closed job is also out of the retry sweep, which only picks up
 * rows with no resolved_at.
 */
export async function markHandledAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await createServiceClient()
    .from("error_events")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", id)
    .is("resolved_at", null);
  revalidatePath("/admin/errors");
}
