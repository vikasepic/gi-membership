"use server";

import { redirect } from "next/navigation";
import { clearViewAsCookie } from "@/lib/view-as";

/**
 * Stop standing in for a member.
 *
 * Deliberately NOT an admin action, and deliberately not in the admin actions
 * file. It only ever drops a privilege, so gating it behind a fresh admin
 * check would mean an admin demoted mid-session could not put themselves
 * back. It also lets the store's banner stay clear of the admin module.
 */
export async function stopViewAsAction() {
  await clearViewAsCookie();
  redirect("/admin/members");
}
