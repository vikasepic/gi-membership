"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { createServiceClient } from "@/lib/supabase/server";
import { runDueJobs } from "@/lib/retry";

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
