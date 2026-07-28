"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { billingPortalUrl } from "@/lib/members";

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
