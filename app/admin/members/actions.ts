"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { cancelSubscription } from "@/lib/members";

export async function cancelSubscriptionAction(formData: FormData) {
  await requireAdmin();
  const id = formData.get("subscriptionId");
  if (typeof id === "string" && id) await cancelSubscription(id);
  revalidatePath("/admin/members");
}
