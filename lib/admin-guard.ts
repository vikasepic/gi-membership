import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Admin access = a logged-in Supabase user whose email is in ADMIN_EMAILS
// (comma-separated). The store owns accounts; admins are just flagged accounts.
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}

/**
 * Admin flagged through the admin UI (users.is_admin).
 *
 * Separate from ADMIN_EMAILS on purpose. The env list is the break-glass one:
 * it cannot be edited from inside the app, so a mistake in this table — or a
 * malicious write to it — can never lock the owner out of their own store, and
 * removing the last UI admin is always recoverable.
 */
async function isAdminInDb(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const { createServiceClient } = await import("@/lib/supabase/server");
  const { data } = await createServiceClient()
    .from("users")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(data?.is_admin);
}

export async function getAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (isAdminEmail(user.email)) return user;
  return (await isAdminInDb(user.id)) ? user : null;
}

// Guard for admin server actions (defense in depth beyond the middleware/layout).
export async function requireAdmin() {
  const user = await getAdminUser();
  if (!user) redirect("/login");
  return user;
}
