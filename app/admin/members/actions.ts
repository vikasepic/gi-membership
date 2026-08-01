"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, isAdminEmail } from "@/lib/admin-guard";
import {
  cancelSubscription,
  createMember,
  deleteMember,
  grantProduct,
  grantOfferAccess,
  revokeOwnership,
  setMemberAdmin,
} from "@/lib/members";

// Every action here re-checks requireAdmin(). The middleware gate is
// convenience; this is the security boundary, and a server action is reachable
// by anyone who can find its id.

export type MemberActionState = { error?: string; message?: string };

export async function cancelSubscriptionAction(formData: FormData) {
  await requireAdmin();
  const id = formData.get("subscriptionId");
  if (typeof id === "string" && id) await cancelSubscription(id);
  revalidatePath("/admin/members");
}

export async function addMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const admin = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const grantId = String(formData.get("grant") ?? "").trim();

  if (!email) return { error: "Enter an email address." };

  const res = await createMember({ email, fullName: fullName || null });
  if (!res.ok) return { error: res.error };

  // "Add and grant" in one step — the common case is comping someone, and
  // splitting it across two screens invites forgetting the second.
  let granted = "";
  if (grantId) {
    const [kind, id] = grantId.split(":");
    const by = admin.email ?? "admin";
    const out =
      kind === "offer"
        ? await grantOfferAccess({ userId: res.userId, offerId: id, grantedBy: by })
        : await grantProduct({ userId: res.userId, productId: id, grantedBy: by });
    if (!out.ok) return { error: `Member added, but the grant failed: ${out.error}` };
    granted = " and granted access";
  }

  revalidatePath("/admin/members");
  return {
    message: res.existed
      ? `${email} was already a member${granted}.`
      : `Added ${email}${granted}. They sign in with a magic link — there is no password.`,
  };
}

export async function grantAccessAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const grantId = String(formData.get("grant") ?? "");
  if (!userId || !grantId) return { error: "Pick something to grant." };

  const [kind, id] = grantId.split(":");
  const by = admin.email ?? "admin";
  const out =
    kind === "offer"
      ? await grantOfferAccess({ userId, offerId: id, grantedBy: by })
      : await grantProduct({ userId, productId: id, grantedBy: by });
  if (!out.ok) return { error: out.error };

  revalidatePath("/admin/members");
  return { message: "Access granted." };
}

export async function revokeAccessAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("ownershipId") ?? "");
  if (id) await revokeOwnership(id);
  revalidatePath("/admin/members");
}

export async function toggleAdminAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const email = String(formData.get("email") ?? "");
  const makeAdmin = String(formData.get("makeAdmin") ?? "") === "true";

  // ADMIN_EMAILS accounts are not stored in this table and must not appear
  // toggleable: pretending to remove one would show a state the guard ignores.
  if (isAdminEmail(email)) {
    revalidatePath("/admin/members");
    return;
  }
  if (userId) await setMemberAdmin(userId, makeAdmin);
  revalidatePath("/admin/members");
}

export async function deleteMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const email = String(formData.get("email") ?? "");
  if (!userId) return { error: "Missing member." };

  // Two accounts must survive any mistake made on this page. A break-glass
  // owner is not stored in this table, so deleting the row would leave the
  // env-list admin still able to sign in while their profile vanished. And
  // deleting yourself mid-session is the one action nobody can undo for you.
  if (isAdminEmail(email)) {
    return { error: "This is an owner account from ADMIN_EMAILS. Remove it there, not here." };
  }
  if (admin.email && email.toLowerCase() === admin.email.toLowerCase()) {
    return { error: "You cannot delete the account you are signed in with." };
  }

  const out = await deleteMember(userId);
  if (!out.ok) return { error: out.error };

  revalidatePath("/admin/members");
  return { message: `Deleted ${email}.` };
}
