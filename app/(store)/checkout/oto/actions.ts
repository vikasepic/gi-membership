"use server";

import { redirect } from "next/navigation";
import { acceptOto } from "@/lib/checkout";

// POST-only accept (a server action is always POST). Single-use is enforced in
// acceptOto; any failure path lands on thank-you without a double charge.
export async function acceptOtoAction(formData: FormData) {
  const token = formData.get("token");
  // Which way to pay was chosen: an INDEX into the list this order's upsell
  // shows, resolved server-side against that same list. The field cannot name
  // an offer or a price — only a position in something already offered.
  //
  // "alt" still parses, because a page loaded before this shipped and
  // submitted after it must not lose the choice somebody made.
  const raw = formData.get("choice");
  const choice =
    typeof raw === "string" && /^\d+$/.test(raw)
      ? Number(raw)
      : raw === "alt"
        ? ("alt" as const)
        : undefined;
  if (typeof token === "string" && token) {
    const res = await acceptOto(token, choice);
    redirect(`/checkout/thank-you?oto=${res.ok ? "accepted" : res.error}`);
  }
  redirect("/checkout/thank-you");
}
