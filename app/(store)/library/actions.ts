"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { acceptStandingOffer } from "@/lib/checkout";
import { setProductProgress, ownsProduct, subscribedToApp } from "@/lib/library";
import { getAppById, buildHandoffUrl, isInternalApp } from "@/lib/apps";
import { builtinAppRoute } from "@/lib/builtin-apps/registry";
import { createServiceClient } from "@/lib/supabase/server";
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
  // An internal app has no handoff; the card links to it directly and never
  // posts here. A request that does anyway goes to the same place.
  if (isInternalApp(app)) redirect(builtinAppRoute(app.key) ?? "/library");
  // The name goes with them. Handoff is what creates the session in the app,
  // so for anyone who lands there before a provision call it is the only place
  // the app can learn what to call them.
  const db = createServiceClient();
  const { data: row } = await db.from("users").select("username").eq("id", user.id).maybeSingle();
  redirect(
    buildHandoffUrl(app, {
      id: user.id,
      email: user.email,
      fullName: (row?.username as string | null) ?? null,
    }),
  );
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

