"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { acceptStandingOffer } from "@/lib/checkout";
import { setProductProgress, ownsProduct, subscribedToApp } from "@/lib/library";
import { getAppById, buildHandoffUrl } from "@/lib/apps";
import { getStoreId } from "@/lib/store";

export async function acceptStandingOfferAction(formData: FormData) {
  const offerId = formData.get("offerId");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || typeof offerId !== "string") redirect("/library");

  const res = await acceptStandingOffer(user.id, offerId);
  revalidatePath("/library");
  redirect(`/library?offer=${res.ok ? "added" : res.error}`);
}

// "Open the app": verify the user subscribes, mint a signed handoff token, and
// send them to the app's handoff endpoint (which mints a session on arrival).
export async function openAppAction(formData: FormData) {
  const appId = formData.get("appId");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || typeof appId !== "string") redirect("/library");
  if (!(await subscribedToApp(user.id, appId))) redirect("/library");
  const app = await getAppById(appId);
  if (!app) redirect("/library");
  redirect(buildHandoffUrl(app, { id: user.id, email: user.email }));
}

export async function markCompleteAction(formData: FormData) {
  const productId = formData.get("productId");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && typeof productId === "string" && (await ownsProduct(user.id, productId))) {
    await setProductProgress(user.id, await getStoreId(), productId, { completed: true });
    revalidatePath(`/library`);
  }
  redirect("/library");
}
