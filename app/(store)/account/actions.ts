"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { billingPortalUrl } from "@/lib/members";
import { saveProfileName } from "@/lib/profile";

export type ProfileState = { error?: string; saved?: boolean };

/**
 * Change your own name.
 *
 * Reads the user id from the session rather than the form, so a member can only
 * ever rename themselves — a hidden field carrying an id is a field somebody
 * can edit.
 */
export async function saveMyName(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in again to change this." };

  const name = String(formData.get("fullName") ?? "").trim();
  if (name.length < 2) return { error: "Enter the name you would like us to use." };
  if (name.length > 200) return { error: "That name is too long." };

  try {
    await saveProfileName(user.id, name);
  } catch {
    return { error: "Could not save that. Try again in a moment." };
  }
  revalidatePath("/account");
  return { saved: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// Stripe-hosted portal: update card, change plan, cancel, download invoices.
// Card data never touches this app.
export async function openBillingPortal() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = await billingPortalUrl(user.id, `${base}/account`);
  redirect(url ?? "/account?billing=none");
}
