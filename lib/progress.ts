import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

export type CompletionSource = "manual" | "video" | "download" | "dwell";

// Manual intent wins permanently: once a student touches the checkbox (either
// direction) auto-signals must never move it again, or un-completing would be
// instantly reverted by the next dwell/video signal.
export function shouldApply(
  existing: { completed: boolean; manualOverride: boolean } | null,
  source: CompletionSource,
  completed: boolean,
): boolean {
  if (source === "manual") return true;
  if (!existing) return completed;
  if (existing.manualOverride) return false;
  return completed && !existing.completed;
}

export async function setItemCompletion(
  userId: string,
  productId: string,
  itemId: string,
  completed: boolean,
  source: CompletionSource,
): Promise<void> {
  const db = createServiceClient();
  const { data } = await db
    .from("progress")
    .select("id, completed, manual_override")
    .eq("user_id", userId)
    .eq("lesson_id", itemId)
    .maybeSingle();

  const existing = data
    ? { completed: data.completed as boolean, manualOverride: data.manual_override as boolean }
    : null;
  if (!shouldApply(existing, source, completed)) return;

  const patch = {
    completed,
    completed_source: source,
    manual_override: source === "manual" ? true : (existing?.manualOverride ?? false),
  };

  if (data) {
    await db.from("progress").update(patch).eq("id", data.id);
  } else {
    await db.from("progress").insert({
      store_id: await getStoreId(),
      user_id: userId,
      product_id: productId,
      lesson_id: itemId,
      ...patch,
    });
  }
}

export async function completedItemIds(userId: string, productId: string): Promise<Set<string>> {
  const db = createServiceClient();
  const { data } = await db
    .from("progress")
    .select("lesson_id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("completed", true)
    .not("lesson_id", "is", null);
  return new Set((data ?? []).map((r) => r.lesson_id as string));
}
