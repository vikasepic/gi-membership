import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { syncContact } from "@/lib/activecampaign";

/**
 * A member's own details.
 *
 * The name is the interesting one. It is collected once, on the checkout, and
 * until now there was no way for anybody to see it again — not the person who
 * typed it, and not the person who typed it wrong. It is also the name
 * ActiveCampaign holds, split into first and last, so a typo at the till became
 * a permanent salutation on every email they receive.
 *
 * It lives in three places, and a correction has to reach all of them:
 *
 *  - `public.users.username` — the display name, and what the CRM sync reads.
 *  - `auth.users.user_metadata.full_name` — set at signup; a stale copy here is
 *    what a future feature reading the auth record would pick up.
 *  - ActiveCampaign — otherwise a corrected name reaches every part of this
 *    store and none of their inbox.
 */

export type Profile = { email: string; fullName: string };

export async function getProfile(userId: string): Promise<Profile | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("users")
    .select("email, username")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.email) return null;
  return { email: data.email as string, fullName: (data.username as string | null) ?? "" };
}

export async function saveProfileName(userId: string, fullName: string): Promise<void> {
  const name = fullName.trim();
  const db = createServiceClient();

  const { error } = await db.from("users").update({ username: name }).eq("id", userId);
  if (error) throw new Error(`saveProfileName: ${error.message}`);

  // Best effort from here. The name IS saved once the row above is written, so
  // neither of these failing should tell the member their change did not work —
  // that would send them round the loop a second time to fix nothing.
  const { data: user } = await db.auth.admin.getUserById(userId);
  if (user?.user) {
    await db.auth.admin
      .updateUserById(userId, {
        user_metadata: { ...(user.user.user_metadata ?? {}), full_name: name },
      })
      .catch(() => {});
    if (user.user.email) {
      await syncContact({ email: user.user.email, fullName: name }).catch(() => {});
    }
  }
}
