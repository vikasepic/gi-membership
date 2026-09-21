import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import type { WatchRow } from "@/lib/watch";

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

// ---------------------------------------------------------------------------
// Where in a video someone is, and what they last opened.
//
// These writes run while a member is watching, on a page behind the paywall.
// They never throw: a lost position costs a resume prompt, and there is no
// version of that worth interrupting a lesson for. Same rule the traffic
// counters follow.
// ---------------------------------------------------------------------------

export type WatchPatch = { positionSeconds: number; durationSeconds: number | null };

/**
 * Save the playhead.
 *
 * Never touches `completed`: completion has its own rules in
 * `setItemCompletion`, including the manual override, and a position save
 * arriving every twenty seconds must not be able to argue with them.
 */
export async function setItemPosition(
  userId: string,
  courseId: string,
  itemId: string,
  patch: WatchPatch,
): Promise<void> {
  const db = createServiceClient();
  const position = Math.max(0, Math.floor(patch.positionSeconds));
  const duration =
    patch.durationSeconds && patch.durationSeconds > 0 ? Math.floor(patch.durationSeconds) : null;
  const row = {
    position_seconds: duration ? Math.min(position, duration) : position,
    ...(duration ? { duration_seconds: duration } : {}),
  };
  const { data: existing } = await db
    .from("progress")
    .select("id")
    .eq("user_id", userId)
    .eq("lesson_id", itemId)
    .maybeSingle();
  if (existing) {
    await db.from("progress").update(row).eq("id", existing.id as string);
    return;
  }
  const { error } = await db.from("progress").insert({
    store_id: await getStoreId(),
    user_id: userId,
    course_id: courseId,
    lesson_id: itemId,
    completed: false,
    last_viewed_at: new Date().toISOString(),
    ...row,
  });
  // Another writer created the first row between the read and the insert.
  // Theirs is as good as ours; the next save lands on it.
  if (error && error.code !== "23505") throw new Error(`setItemPosition: ${error.message}`);
}

/**
 * Record that the member opened this lesson.
 *
 * Distinct from a position save, which only happens once a video plays. The
 * library's continue box and the admin's activity column both mean "opened",
 * and a lesson with no video would otherwise never be seen to have happened.
 */
export async function touchItemViewed(userId: string, courseId: string, itemId: string): Promise<void> {
  const db = createServiceClient();
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from("progress")
    .select("id")
    .eq("user_id", userId)
    .eq("lesson_id", itemId)
    .maybeSingle();
  if (existing) {
    await db.from("progress").update({ last_viewed_at: now }).eq("id", existing.id as string);
    return;
  }
  const { error } = await db.from("progress").insert({
    store_id: await getStoreId(),
    user_id: userId,
    course_id: courseId,
    lesson_id: itemId,
    completed: false,
    last_viewed_at: now,
  });
  if (error && error.code !== "23505") throw new Error(`touchItemViewed: ${error.message}`);
}

/** Fire and forget. Runs on a lesson page; a failure here changes nothing. */
export function recordView(userId: string, courseId: string, itemId: string): void {
  void touchItemViewed(userId, courseId, itemId).catch(() => {});
}

/** One member's watch rows for one course, keyed by lesson. */
export async function watchRowsFor(userId: string, courseId: string): Promise<Map<string, WatchRow>> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("progress")
    .select("lesson_id, completed, position_seconds, duration_seconds")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .not("lesson_id", "is", null);
  if (error) throw new Error(`watchRowsFor: ${error.message}`);
  return new Map(
    (data ?? []).map((r) => [
      r.lesson_id as string,
      {
        completed: r.completed as boolean,
        positionSeconds: (r.position_seconds as number | null) ?? null,
        durationSeconds: (r.duration_seconds as number | null) ?? null,
      },
    ]),
  );
}

/** One lesson's watch row, for the resume prompt. */
export async function watchRowFor(userId: string, itemId: string): Promise<WatchRow | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("progress")
    .select("completed, position_seconds, duration_seconds")
    .eq("user_id", userId)
    .eq("lesson_id", itemId)
    .maybeSingle();
  if (error) throw new Error(`watchRowFor: ${error.message}`);
  return data
    ? {
        completed: data.completed as boolean,
        positionSeconds: (data.position_seconds as number | null) ?? null,
        durationSeconds: (data.duration_seconds as number | null) ?? null,
      }
    : null;
}
