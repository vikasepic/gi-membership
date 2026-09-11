// lib/visits.ts
import "server-only";
import { cookies, headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { isBot } from "@/lib/traffic-source";
import { UTM_COOKIE, attributionOf, landingReferrer, mergeAttribution, parseCookie, parseLabels } from "@/lib/attribution";
import { browserOf, clientIpOf, deviceOf, foreignReferrer, hashIp, osOf, sanitizeQuery } from "@/lib/visit-fields";

/**
 * A visit, and what happened in it.
 *
 * Everything here swallows its own errors, for the same reason everything in
 * lib/traffic.ts does: it runs on the pages that take money, and a record of
 * a visit is worth less than the visit itself.
 *
 * Called from the store LAYOUT rather than from a list of paths. That is the
 * whole reason the home page starts counting — page_counts never saw it,
 * because only five pages ever called recordPageHit.
 */

/** A visit is this visitor plus a 30-minute idle window. Mirrored in record_visit. */
const WINDOW_MS = 30 * 60_000;

export async function recordVisit(): Promise<void> {
  try {
    const h = await headers();
    const ua = h.get("user-agent");
    // A bot is not a visit. Same list the page counter uses.
    if (isBot(ua)) return;

    const jar = await cookies();
    // proxy.ts resolves the anon id before it writes the Set-Cookie and
    // forwards that same id as x-anon-id on the request itself, so THIS
    // render can see it — the cookie jar alone is always one request behind
    // a brand-new browser's Set-Cookie, which used to make a first-time
    // visit open on the SECOND request, with the wrong landing_path and a
    // same-host referer that foreignReferrer correctly discarded. Falling
    // back to the jar covers every later request, once the cookie exists.
    //
    // Trade-off: a client that ignores cookies but still forwards this
    // header untouched — and that isBot above does not catch — would now
    // open one visit per request where today it opens none. Worth it: the
    // alternative is losing the landing page and referrer for every
    // genuinely new visitor, which is the whole point of this header.
    const anon = h.get("x-anon-id") ?? jar.get("gi_anon")?.value;
    // No id at all. There is nothing to key a visit on.
    if (!anon) return;

    const path = h.get("x-pathname") ?? "/";
    const ref = foreignReferrer(h.get("referer"), process.env.NEXT_PUBLIC_SITE_URL);

    // Not attributionFromCookie(gi_utm) alone: proxy.ts/attribution-cookie.ts
    // only ever write gi_utm on the RESPONSE (Set-Cookie), never patch the
    // incoming request — so on a landing pageview, the very moment a campaign
    // matters most, the cookie this render sees is always one request stale.
    // Merging this request's own query on top of whatever the cookie already
    // holds is the same computation the proxy does before writing the cookie,
    // and it is what lets the FIRST pageview still capture its own campaign.
    const stored = parseCookie(jar.get(UTM_COOKIE)?.value);
    const labels = parseLabels(h.get("x-search") ?? "");
    const landingRef = landingReferrer(h.get("referer"), process.env.NEXT_PUBLIC_SITE_URL);
    const attribution = attributionOf(mergeAttribution(stored, labels, landingRef, new Date()) ?? stored);

    const db = createServiceClient();
    await db.rpc("record_visit", {
      p_store: await getStoreId(),
      p_anon: anon,
      p_path: path,
      p_query: sanitizeQuery(h.get("x-search")),
      p_referrer: ref?.url ?? null,
      p_referrer_host: ref?.host ?? null,
      p_utm_first: attribution.first,
      p_utm_last: attribution.last,
      p_device: deviceOf(ua),
      p_browser: browserOf(ua),
      p_os: osOf(ua),
      p_ip_hash: hashIp(
        clientIpOf(h.get("x-forwarded-for"), h.get("x-real-ip")),
        process.env.ATTRIBUTION_IP_SALT,
      ),
      p_user_agent: ua,
    });
  } catch {
    // Deliberately silent. See the note above.
  }
}

/**
 * The visit this request belongs to, if there is one.
 *
 * A read, not a write: the milestone writers and order creation both need the
 * id, and neither should be able to open a visit as a side effect of asking.
 */
export async function currentVisitId(): Promise<string | null> {
  try {
    const h = await headers();
    const jar = await cookies();
    // Same x-anon-id-first read as recordVisit above, for the same reason:
    // a milestone reached on a brand-new browser's very first request (a
    // Meta ad linking straight to /checkout, say) would otherwise miss the
    // visit the layout just opened on this same request.
    const anon = h.get("x-anon-id") ?? jar.get("gi_anon")?.value;
    if (!anon) return null;
    const db = createServiceClient();
    const { data } = await db
      .from("visits")
      .select("id")
      .eq("store_id", await getStoreId())
      .eq("anon_id", anon)
      .gt("last_seen_at", new Date(Date.now() - WINDOW_MS).toISOString())
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.id as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * A milestone inside a visit.
 *
 * `visitId` is accepted because the purchase milestone is recorded from code
 * that already resolved it — and from the Stripe webhook, which has no
 * cookies at all and could never resolve it here.
 *
 * The key is checked with `"visitId" in opts`, never `??`. `??` cannot tell
 * an explicit `null` from an omitted argument, and the two mean opposite
 * things: omitted (the page milestones — checkout, upsell) means "nothing
 * else to go on, resolve it from the cookie"; an explicit `null` (the
 * purchase milestone, always called with this key present) means "this order
 * was resolved already and genuinely has no visit — do not guess." Restoring
 * `??` here silently reattaches a visit-less order to whatever visit is
 * active on the CURRENT request's cookie, which is exactly the cookie-based
 * attribution the purchase milestone exists to avoid: on the thank-you page
 * that cookie belongs to a real browser, not to the order that produced it.
 */
export async function recordVisitStep(
  step: "checkout" | "upsell" | "purchase",
  opts: { orderId?: string | null; valueCents?: number | null; visitId?: string | null } = {},
): Promise<void> {
  try {
    const visitId = "visitId" in opts ? opts.visitId : await currentVisitId();
    if (!visitId) return;
    const db = createServiceClient();
    await db.from("visit_steps").upsert(
      {
        store_id: await getStoreId(),
        visit_id: visitId,
        step,
        order_id: opts.orderId ?? null,
        value_cents: opts.valueCents ?? null,
      },
      { onConflict: "visit_id,step", ignoreDuplicates: true },
    );
  } catch {
    // Silent, like everything else here.
  }
}
