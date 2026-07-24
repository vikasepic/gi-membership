"use server";

import { redirect } from "next/navigation";
import { acceptOto } from "@/lib/checkout";

// POST-only accept (a server action is always POST). Single-use is enforced in
// acceptOto; any failure path lands on thank-you without a double charge.
export async function acceptOtoAction(formData: FormData) {
  const token = formData.get("token");
  if (typeof token === "string" && token) {
    const res = await acceptOto(token);
    redirect(`/checkout/thank-you?oto=${res.ok ? "accepted" : res.error}`);
  }
  redirect("/checkout/thank-you");
}
