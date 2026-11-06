import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { listApps, type AppRow } from "@/lib/apps";
import { isAdminEmail } from "@/lib/admin-guard";
import { recordError } from "@/lib/errors";
import { stripe, stripeMode } from "@/lib/stripe";
import { changeContactEmail } from "@/lib/activecampaign";
import { buildEmailChangedEmail, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";

// An admin changes a member's email, and everything that knows them by email
// follows: the login, the store's rows, every connected app, the Stripe
// customer and the ActiveCampaign contact. Always in place: same ids, same
// access. Nothing is deleted, recreated or merged.
//
// Spec: docs/superpowers/specs/2026-11-06-change-member-email-design.md.
// The app side: docs/app-email-change.md.

/** What one connected app said. `not_built`: it has no endpoint yet. */
export type AppAnswer =
  | "changed"
  | "already_changed"
  | "not_found"
  | "would_change"
  | "email_taken"
  | "not_built"
  | "failed";

const ANSWERS = new Set(["changed", "already_changed", "not_found", "would_change", "email_taken"]);
/** The answers that mean the app is where it should be. */
export const SETTLED = new Set<AppAnswer>(["changed", "already_changed", "not_found"]);

export async function tellApp(
  app: Pick<AppRow, "baseUrl" | "sharedSecret">,
  oldEmail: string,
  newEmail: string,
  check: boolean,
): Promise<AppAnswer> {
  if (!app.baseUrl || !app.sharedSecret) return "failed";
  try {
    const res = await fetch(`${app.baseUrl}/api/store/email-change`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-store-secret": app.sharedSecret },
      body: JSON.stringify({ oldEmail, newEmail, check, occurredAt: Math.floor(Date.now() / 1000) }),
      signal: AbortSignal.timeout(8000),
      // A bounce to a login page is an app without the route, not a yes.
      redirect: "manual",
    });
    if (res.status === 404 || (res.status >= 300 && res.status < 400)) return "not_built";
    if (res.status === 409) return "email_taken";
    const result = ((await res.json().catch(() => null)) as { result?: string } | null)?.result;
    return res.ok && result && ANSWERS.has(result) ? (result as AppAnswer) : "failed";
  } catch {
    return "failed";
  }
}

export type ChangeEmailResult =
  | { ok: false; error: string }
  | {
      ok: true;
      oldEmail: string;
      newEmail: string;
      apps: { name: string; answer: AppAnswer }[];
      stripe: { updated: number; failed: number };
      activeCampaign: "changed" | "both" | "none" | "failed";
      mailed: "sent" | "failed" | "disabled";
    };

const fail = (error: string): ChangeEmailResult => ({ ok: false, error });

export async function changeMemberEmail(userId: string, rawNew: string): Promise<ChangeEmailResult> {
  const newEmail = rawNew.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return fail("That is not an email address.");

  const db = createServiceClient();
  const storeId = await getStoreId();
  const { data: user } = await db.from("users").select("id, email").eq("id", userId).maybeSingle();
  if (!user) return fail("No such member.");
  const oldEmail = String(user.email).toLowerCase();
  if (newEmail === oldEmail) return fail("That is already their email.");
  // The guard reads ADMIN_EMAILS by address: moving an owner would lock them out.
  if (isAdminEmail(oldEmail)) return fail("This is an owner account from ADMIN_EMAILS. Change it there, not here.");
  // And moving anyone ONTO an owner address would make them a permanent owner.
  if (isAdminEmail(newEmail)) return fail(`${newEmail} is an owner address in ADMIN_EMAILS. Nothing was changed.`);

  const { data: taken } = await db.from("users").select("id").eq("store_id", storeId).eq("email", newEmail).maybeSingle();
  if (taken) return fail(`${newEmail} already belongs to another member. Nothing was changed.`);

  // Ask every app first, so a refusal stops the change before anything moves.
  // `already_changed` counts as taken: on a first change the member cannot be
  // on the new address yet, so whoever is there is somebody else. An app that
  // does not answer stops it too: it may be holding someone on that address.
  const apps = (await listApps()).filter((a) => a.kind === "external" && a.active && a.baseUrl && a.sharedSecret);
  const checks = await Promise.all(apps.map((a) => tellApp(a, oldEmail, newEmail, true)));
  const names = (want: AppAnswer[]) => apps.filter((_, i) => want.includes(checks[i])).map((a) => a.name).join(" and ");
  if (names(["email_taken", "already_changed"])) {
    return fail(`${names(["email_taken", "already_changed"])} already has a different account on ${newEmail}. Nothing was changed. Sort that account out there first.`);
  }
  if (names(["failed"])) {
    return fail(`${names(["failed"])} did not answer. Nothing was changed. Try again in a few minutes.`);
  }

  // The login first: if it refuses (an unused login already holds the address),
  // nothing else has moved yet.
  const { error: authErr } = await db.auth.admin.updateUserById(userId, { email: newEmail, email_confirm: true });
  if (authErr) return fail(`The login could not be changed: ${authErr.message}. Nothing was changed.`);
  const { error: rowsErr } = await db.rpc("change_member_email", { p_user_id: userId, p_new: newEmail });
  if (rowsErr) {
    await db.auth.admin.updateUserById(userId, { email: oldEmail, email_confirm: true });
    return fail(`The store could not be updated: ${rowsErr.message}. Nothing was changed.`);
  }

  const appAnswers = await Promise.all(
    apps.map(async (app, i) => {
      // Not a user there, or nowhere to send it: the check already said so.
      const answer = checks[i] === "not_found" || checks[i] === "not_built" ? checks[i] : await tellApp(app, oldEmail, newEmail, false);
      if (answer === "not_built") {
        await recordError({
          source: "email_change",
          message: `${app.name} has no email-change endpoint yet. Change ${oldEmail} to ${newEmail} there by hand.`,
          context: { appId: app.id, oldEmail, newEmail },
        });
      } else if (!SETTLED.has(answer)) {
        await recordError({
          source: "email_change",
          message: `${app.name} did not take the email change (${answer}).`,
          context: { appId: app.id, oldEmail, newEmail },
          jobKind: "app_email_change",
          jobPayload: { appId: app.id, userId, oldEmail, newEmail },
        });
      }
      return { name: app.name, answer };
    }),
  );

  // Receipts and card notices go to the customer's email; billing itself is by id.
  // Only this key's mode: a test customer does not exist for the live key.
  const live = stripeMode() === "live";
  const [{ data: orderCus }, { data: subCus }] = await Promise.all([
    db.from("orders").select("stripe_customer_id").eq("user_id", userId).eq("livemode", live).not("stripe_customer_id", "is", null),
    db.from("subscriptions").select("stripe_customer_id").eq("user_id", userId).eq("livemode", live).not("stripe_customer_id", "is", null),
  ]);
  const customers = [...new Set([...(orderCus ?? []), ...(subCus ?? [])].map((r) => r.stripe_customer_id as string))];
  const stripeOut = { updated: 0, failed: 0 };
  for (const id of customers) {
    try {
      await stripe().customers.update(id, { email: newEmail });
      stripeOut.updated++;
    } catch (e) {
      stripeOut.failed++;
      await recordError({
        source: "email_change",
        message: `Stripe customer ${id} still has ${oldEmail}: ${e instanceof Error ? e.message : e}`,
        context: { customer: id, oldEmail, newEmail },
      });
    }
  }

  const ac = await changeContactEmail(oldEmail, newEmail);
  if (ac === "both" || ac === "failed") {
    await recordError({
      source: "email_change",
      message:
        ac === "both"
          ? `ActiveCampaign has a contact on both ${oldEmail} and ${newEmail}. Merge them there by hand.`
          : `ActiveCampaign contact ${oldEmail} could not be moved to ${newEmail}.`,
      context: { oldEmail, newEmail },
    });
  }

  const mail = buildEmailChangedEmail({ oldEmail, newEmail, signInUrl: `${siteUrl()}/login` });
  const sent = await Promise.all([sendEmail(oldEmail, mail), sendEmail(newEmail, mail)]);

  return {
    ok: true,
    oldEmail,
    newEmail,
    apps: appAnswers,
    stripe: stripeOut,
    activeCampaign: ac,
    mailed: sent.every((x) => x === "sent") ? "sent" : sent.includes("failed") ? "failed" : "disabled",
  };
}

const SAID: Record<AppAnswer, string> = {
  changed: "changed",
  already_changed: "already had it",
  not_found: "not a user there",
  would_change: "changed",
  email_taken: "refused, address taken (see Errors)",
  not_built: "not updated, it has no email-change endpoint yet (see Errors)",
  failed: "did not answer, retrying (see Errors)",
};

/** One line for the admin who pressed the button. */
export function describeEmailChange(r: Extract<ChangeEmailResult, { ok: true }>): string {
  const parts = [`Changed ${r.oldEmail} to ${r.newEmail}.`];
  for (const a of r.apps) parts.push(`${a.name}: ${SAID[a.answer]}.`);
  if (r.stripe.updated || r.stripe.failed) {
    parts.push(`Stripe: ${r.stripe.updated} customer${r.stripe.updated === 1 ? "" : "s"} updated${r.stripe.failed ? `, ${r.stripe.failed} failed (see Errors)` : ""}.`);
  }
  if (r.activeCampaign === "changed") parts.push("ActiveCampaign: contact moved.");
  if (r.activeCampaign === "both") parts.push("ActiveCampaign: both addresses have a contact, merge them by hand.");
  if (r.activeCampaign === "failed") parts.push("ActiveCampaign: not updated (see Errors).");
  parts.push(
    r.mailed === "sent"
      ? "Both addresses were emailed."
      : r.mailed === "failed"
        ? "The notice email did not reach both addresses (see Errors)."
        : "Email is not set up here, so no notice went out.",
  );
  return parts.join(" ");
}
