"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { runNameBackfill } from "@/lib/app-backfill";

export type BackfillState = { message?: string; error?: string; appId?: string };

/**
 * Re-send this app every entitlement the store already holds, carrying the
 * member's name.
 *
 * Behind `requireAdmin` and behind a second click, because it is the one
 * control on this page that talks to somebody else's server.
 */
export async function resendNames(
  _prev: BackfillState,
  formData: FormData,
): Promise<BackfillState> {
  await requireAdmin();
  const appId = String(formData.get("appId") ?? "");
  if (!appId) return { error: "No app given" };

  try {
    const { sent, skipped } = await runNameBackfill(appId);
    revalidatePath("/admin/apps");
    if (sent === 0) {
      return {
        appId,
        message: skipped
          ? `Nothing to send — none of the ${skipped} entitlements has a name stored.`
          : "Nothing to send — the store holds no entitlements for this app.",
      };
    }
    return {
      appId,
      message:
        `Sent ${sent} ${sent === 1 ? "entitlement" : "entitlements"} with a name` +
        (skipped ? `, skipped ${skipped} with no name stored.` : "."),
    };
  } catch (e) {
    return { appId, error: e instanceof Error ? e.message : "Could not send" };
  }
}
