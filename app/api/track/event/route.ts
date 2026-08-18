import { cookies, headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { CONSENT_COOKIE, parseConsent, mayTrack } from "@/lib/consent";
import { EVENTS, META_BOTH_SIDES, type EventName } from "@/lib/analytics/events";
import { trackServerEvent } from "@/lib/tracking";

/**
 * The server's copy of an event the browser also sent.
 *
 * The upper funnel — AddToCart, InitiateCheckout, AddPaymentInfo, Lead — was
 * browser-only. META_BOTH_SIDES has listed those events as "sent from both
 * sides" since it was written, and nothing ever sent them: the server reported
 * Purchase, StartTrial and Subscribe and no more. So on the traffic where the
 * pixel is blocked, which is a large and growing share of it, none of them
 * arrived at all.
 *
 * A first-party endpoint rather than more calls to connect.facebook.net,
 * because that is the whole point: a request to our own domain survives the
 * blockers and the tracking-protection lists that the pixel does not. The
 * browser still fires its own copy with the same event_id, so Meta collapses
 * the pair and match quality goes up rather than the count.
 *
 * Everything that makes the event worth having is added HERE, from the request
 * — the IP, the user agent, the page — rather than trusted from the body. A
 * caller can say which event happened and what it was worth; it cannot say
 * whose it was.
 */

const ALLOWED = new Set<EventName>(META_BOTH_SIDES);

export async function POST(req: Request) {
  const jar = await cookies();
  // Same gate as everything else. No consent, no event — and no argument from
  // the client about it.
  if (!mayTrack(parseConsent(jar.get(CONSENT_COOKIE)?.value))) {
    return Response.json({ ok: true, sent: false, reason: "no-consent" });
  }

  const body = (await req.json().catch(() => ({}))) as {
    event?: string;
    eventId?: string;
    valueCents?: number;
    currency?: string;
    orderId?: string;
    contentIds?: string[];
    contentName?: string;
    email?: string;
  };

  // Only events the store already agreed to send from both sides. An open
  // endpoint that relays any name to Meta is one somebody else can fill your
  // pixel with.
  const event = body.event as EventName | undefined;
  if (!event || !EVENTS.includes(event) || !ALLOWED.has(event)) {
    return Response.json({ ok: false, reason: "unknown-event" }, { status: 400 });
  }
  // The id is what pairs this with the browser's copy. Without one Meta counts
  // two events instead of collapsing one, so a missing id is a refusal rather
  // than something to invent.
  if (!body.eventId) {
    return Response.json({ ok: false, reason: "no-event-id" }, { status: 400 });
  }

  const h = await headers();
  const anon = jar.get("gi_anon")?.value;

  // The click ids belong to the visitor row, not to the request body — the
  // browser could send anything, and first touch is the version worth keeping.
  let clickIds: Record<string, string> = {};
  let clickTimeMs: number | null = null;
  if (anon) {
    const db = createServiceClient();
    const { data: visitor } = await db
      .from("visitors")
      .select("click_ids, first_seen_at")
      .eq("store_id", await getStoreId())
      .eq("anon_id", anon)
      .maybeSingle();
    clickIds = (visitor?.click_ids as Record<string, string>) ?? {};
    clickTimeMs = visitor?.first_seen_at ? new Date(visitor.first_seen_at as string).getTime() : null;
  }

  await trackServerEvent({
    eventId: body.eventId,
    eventName: event,
    email: body.email ?? "",
    valueCents: Math.max(0, Math.round(body.valueCents ?? 0)),
    currency: body.currency || "usd",
    // No order yet on any of these — the anonymous id is what ties the funnel
    // together, and GA4 never sees this endpoint anyway.
    orderId: body.orderId || anon || body.eventId,
    clickIds,
    clickTimeMs,
    clientIp: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
    sourceUrl: h.get("referer"),
    contentIds: body.contentIds,
    contentName: body.contentName,
    occurredAt: Math.floor(Date.now() / 1000),
  },
  // Meta only. The browser already reported this one to GA4, which does not
  // deduplicate — a second copy from here would double every upper-funnel
  // number in GA4 by however much of the traffic runs an ad blocker.
  { only: ["meta"] });

  return Response.json({ ok: true, sent: true });
}
