"use server";

import { redirect } from "next/navigation";
import { acceptOto } from "@/lib/checkout";

// POST-only accept (a server action is always POST). Single-use is enforced in
// acceptOto; any failure path lands on thank-you without a double charge.
export async function acceptOtoAction(formData: FormData) {
  const token = formData.get("token");
  // Which of the two prices was clicked. Anything other than "alt" is the one
  // the token names — the field cannot name an offer, only pick a side.
  const choice = formData.get("choice") === "alt" ? "alt" : undefined;
  if (typeof token === "string" && token) {
    const res = await acceptOto(token, choice);
    redirect(`/checkout/thank-you?oto=${res.ok ? "accepted" : res.error}`);
  }
  redirect("/checkout/thank-you");
}
