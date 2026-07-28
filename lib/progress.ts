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

async function readExisting(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  itemId: string,
) {
  const { data, error } = await db
    .from("progress")
    .select("id, completed, manual_override")
    .eq("user_id", userId)
    .eq("lesson_id", itemId)
    .maybeSingle();
  if (error) throw new Error(`setItemCompletion: ${error.message}`);
  return data
    ? {
        id: data.id as string,
        completed: data.completed as boolean,
        manualOverride: data.manual_override as boolean,
      }
    : null;
}

export async function setItemCompletion(
  userId: string,
  courseId: string,
  itemId: string,
  completed: boolean,
  source: CompletionSource,
): Promise<void> {
  const db = createServiceClient();
  const existing = await readExisting(db, userId, itemId);
  if (!shouldApply(existing, source, completed)) return;

  const patch = {
    completed,
    completed_source: source,
    manual_override: source === "manual" ? true : (existing?.manualOverride ?? false),
  };

  if (existing) {
    const { error } = await db.from("progress").update(patch).eq("id", existing.id);
    if (error) throw new Error(`setItemCompletion: ${error.message}`);
    return;
  }

  const { error } = await db.from("progress").insert({
    store_id: await getStoreId(),
    user_id: userId,
    course_id: courseId,
    lesson_id: itemId,
    ...patch,
  });
  if (!error) return;

  // Unique violation on (store_id, user_id, lesson_id): another writer
  // (manual toggle vs. auto signal) inserted the first-ever row for this
  // item between our read and our insert. Re-read the row that won and
  // re-decide against its current state — do NOT blindly retry the insert.
  if (error.code === "23505") {
    const raced = await readExisting(db, userId, itemId);
    if (!raced || !shouldApply(raced, source, completed)) return;
    const { error: updateError } = await db
      .from("progress")
      .update({
        completed,
        completed_source: source,
        manual_override: source === "manual" ? true : raced.manualOverride,
      })
      .eq("id", raced.id);
    if (updateError) throw new Error(`setItemCompletion: ${updateError.message}`);
    return;
  }

  throw new Error(`setItemCompletion: ${error.message}`);
}

// Authoritative completion state for one item, post-write. Used by the API
// route to tell the client what actually happened (manual_override may have
// silently refused the write).
export async function isItemCompleted(userId: string, itemId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("progress")
    .select("completed")
    .eq("user_id", userId)
    .eq("lesson_id", itemId)
    .maybeSingle();
  if (error) throw new Error(`isItemCompleted: ${error.message}`);
  return data?.completed ?? false;
}

// Scoped by COURSE: progress follows content, and one course may be sold
// through several products.
export async function completedItemIds(userId: string, courseId: string): Promise<Set<string>> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("progress")
    .select("lesson_id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("completed", true)
    .not("lesson_id", "is", null);
  if (error) throw new Error(`completedItemIds: ${error.message}`);
  return new Set((data ?? []).map((r) => r.lesson_id as string));
}
