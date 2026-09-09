"use server";

import { revalidatePath } from "next/cache";
import { internalAppAccess } from "@/lib/builtin-apps/access";
import { BUILTIN_APPS } from "@/lib/builtin-apps/registry";
import { deleteOwnedSession } from "@/lib/builtin-apps/product-builder/sessions";

const APP = BUILTIN_APPS["micro-product-builder"];

/**
 * Delete one of the member's own sessions, with its transcript and documents.
 * Ownership is checked twice on purpose: once for the app, once for the row.
 */
export async function deleteSessionAction(sessionId: string): Promise<{ ok: boolean }> {
  const access = await internalAppAccess("micro-product-builder");
  if (!access.ok || typeof sessionId !== "string") return { ok: false };
  const ok = await deleteOwnedSession(sessionId, access.user.id);
  if (ok) revalidatePath(APP.route);
  return { ok };
}
