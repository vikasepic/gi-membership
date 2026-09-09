import "server-only";
import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStoreId, offerSellingApp } from "@/lib/store";
import { APP_COLUMNS, type AppRow } from "@/lib/apps";
import { camelize } from "@/lib/case";
import { subscribedToApp } from "@/lib/library";
import { BUILTIN_APPS, type BuiltinAppKey } from "@/lib/builtin-apps/registry";

/**
 * Who may use an internal app: the one question every page and route of it
 * asks, answered in one place.
 *
 * Access IS the ownership row. There is no flag on the member, no entitlement
 * pushed anywhere and nothing to sync: the same live-ownership check the
 * library uses to show "Open" decides here, so the two can never disagree, and
 * a refund that flips the row to `canceled` locks the app on the next request.
 */
export type InternalAppViewer = {
  user: { id: string; email: string };
  app: AppRow;
};

export type AccessRefusal = "signed_out" | "no_app" | "not_owned";

export type InternalAppAccess =
  | ({ ok: true } & InternalAppViewer)
  | { ok: false; reason: AccessRefusal; app: AppRow | null };

/** The internal app row for a key, or null when the store has not registered it. */
export async function getInternalApp(key: BuiltinAppKey): Promise<AppRow | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("apps")
    .select(APP_COLUMNS)
    .eq("store_id", await getStoreId())
    .eq("key", key)
    .eq("kind", "internal")
    .maybeSingle();
  return data ? camelize<AppRow>(data) : null;
}

/**
 * The answer as a value, for route handlers that reply with a status rather
 * than a redirect. A streaming route has no page to bounce to.
 */
export async function internalAppAccess(key: BuiltinAppKey): Promise<InternalAppAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const app = await getInternalApp(key);
  if (!app || !app.active) return { ok: false, reason: "no_app", app: null };
  if (!user?.email) return { ok: false, reason: "signed_out", app };
  if (!(await subscribedToApp(user.id, app.id))) return { ok: false, reason: "not_owned", app };
  return { ok: true, user: { id: user.id, email: user.email }, app };
}

/**
 * The answer as a redirect, for pages. Signed out goes to login and comes
 * back here; an app the store does not sell is a 404; someone who does not
 * own it is sent to the page that sells it, the only useful place to land.
 *
 * That page is the offer whose grant is this app — looked up, because its key
 * is whatever the admin named it and need not match the app's. When no offer
 * sells the app yet, the library: a page that exists, where a 404 would say
 * the app itself was missing.
 */
export async function requireInternalApp(key: BuiltinAppKey): Promise<InternalAppViewer> {
  const access = await internalAppAccess(key);
  if (access.ok) return { user: access.user, app: access.app };
  if (access.reason === "no_app") notFound();
  if (access.reason === "signed_out") {
    redirect(`/login?next=${encodeURIComponent(BUILTIN_APPS[key].route)}`);
  }
  const offer = access.app ? await offerSellingApp(access.app.id) : null;
  redirect(offer ? `/o/${offer.key}` : "/library");
}

/** The HTTP status a route handler answers with when access is refused. */
export function accessStatus(reason: AccessRefusal): number {
  return reason === "signed_out" ? 401 : reason === "no_app" ? 404 : 403;
}

/** The JSON refusal a route handler sends, with the code the browser shows a sentence for. */
export function accessRefused(reason: AccessRefusal): Response {
  const error =
    reason === "signed_out" ? "unauthorized" : reason === "no_app" ? "not_found" : "no_access";
  return Response.json({ error }, { status: accessStatus(reason) });
}
