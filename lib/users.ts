import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

export type UserProfile = { id: string; email: string };

// Get a member's profile row, creating it from their auth account if it's
// missing.
//
// auth.users and public.users can drift: only the signup-at-checkout path
// inserts a profile, so any account created another way — the admin login, a
// user added straight through the auth API — authenticates fine but has no
// profile. Every feature that joins on public.users then fails for them, which
// is what made checkout report "Account not found" to a signed-in admin.
//
// Backfilling here fixes it once for all callers instead of each one guessing.
// Returns null only when there is genuinely no such auth user, so a bad id
// still fails rather than conjuring an account.
export async function ensureUserProfile(userId: string): Promise<UserProfile | null> {
  const db = createServiceClient();

  const { data: existing } = await db
    .from("users")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();
  if (existing?.email) return { id: existing.id as string, email: existing.email as string };

  const { data: authUser, error } = await db.auth.admin.getUserById(userId);
  if (error || !authUser.user?.email) return null;
  const email = authUser.user.email.trim().toLowerCase();

  const { error: insertErr } = await db.from("users").insert({
    id: userId,
    store_id: await getStoreId(),
    email,
    // Best-effort display name; the local part is a sane default and the column
    // carries no uniqueness constraint.
    username:
      (authUser.user.user_metadata?.username as string | undefined) ?? email.split("@")[0],
  });
  // 23505 = someone else inserted it between our read and write. Not an error.
  if (insertErr && insertErr.code !== "23505") return null;

  return { id: userId, email };
}
