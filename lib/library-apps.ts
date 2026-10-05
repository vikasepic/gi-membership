/**
 * What one app card in the library says, worked out from plain data so it can
 * be tested without a database.
 *
 * Redesigned 5 Oct 2026 (the owner picked direction A of the Library mockups):
 * members did not know where to go, Instagram-only buyers missed that LinkedIn
 * was not in their plan, and a member who added LinkedIn later got a second
 * Content Engine card, because the shelf drew one card per purchase.
 */

import { APP_CHANNELS, channelLabel } from "@/lib/app-channels";
import { shortDate } from "@/lib/dates";
import { money } from "@/lib/money";

export type OwnedStatus = "active" | "trialing" | "past_due";

export type AppRow = {
  appId: string;
  status: OwnedStatus;
  /** The channels the offer behind this purchase grants. */
  channels: string[];
  offerId: string | null;
  description: string | null;
  subscriptionId: string | null;
};

export type MergedApp = {
  appId: string;
  status: OwnedStatus;
  channels: string[];
  offerIds: string[];
  description: string | null;
  subscriptionIds: string[];
};

/**
 * One entry per app, whatever number of purchases sit behind it.
 *
 * Channels are the union, in the store's own order. A failed payment on any
 * of them wins the status, because it is what stops the app opening; then a
 * trial, so the member sees when it ends.
 */
export function mergeAppRows(rows: AppRow[]): MergedApp[] {
  const byApp = new Map<string, AppRow[]>();
  for (const r of rows) byApp.set(r.appId, [...(byApp.get(r.appId) ?? []), r]);
  return [...byApp.entries()].map(([appId, group]) => {
    const owned = new Set(group.flatMap((r) => r.channels));
    const has = (s: OwnedStatus) => group.some((r) => r.status === s);
    return {
      appId,
      status: has("past_due") ? "past_due" : has("trialing") ? "trialing" : "active",
      channels: APP_CHANNELS.map((c) => c.value).filter((c) => owned.has(c)),
      offerIds: group.map((r) => r.offerId).filter((x): x is string => !!x),
      description: group.map((r) => r.description).find((d) => !!d?.trim()) ?? null,
      subscriptionIds: group.map((r) => r.subscriptionId).filter((x): x is string => !!x),
    };
  });
}

export type ChannelBadge = {
  channel: string;
  label: string;
  included: boolean;
  /** The sales page that adds this channel; null when included or nothing sells it alone. */
  addHref: string | null;
  addText: string | null;
};

/**
 * Every channel the app has, marked included or not.
 *
 * A channel the member lacks is shown, not hidden: "Instagram" alone in grey
 * text left 36 members unsure whether LinkedIn came with it. `addOffers` is the
 * sales page and price of the offer that sells that one channel on its own.
 */
export function channelBadges(
  appChannels: readonly string[],
  owned: readonly string[],
  addOffers: Record<string, { href: string; priceLabel: string }>,
): ChannelBadge[] {
  return APP_CHANNELS.map((c) => c.value)
    .filter((c) => appChannels.includes(c))
    .map((channel) => {
      const included = owned.includes(channel);
      const add = included ? undefined : addOffers[channel];
      return {
        channel,
        label: channelLabel(channel),
        included,
        addHref: add?.href ?? null,
        addText: add ? `Add ${channelLabel(channel)} to your plan for ${add.priceLabel}` : null,
      };
    });
}

export type StatusLine = { tone: "ok" | "trial" | "warn" | "bad"; text: string };

/**
 * The one line of billing the card keeps, because it decides whether the app
 * opens. Everything else about money is behind "Billing and invoices".
 */
export function appStatus(
  status: OwnedStatus,
  billing: { trialEndsAt: string | null; cancelsAt: string | null } | null,
  now: Date,
): StatusLine {
  if (status === "past_due") return { tone: "bad", text: "Payment failed · update your card" };
  const upcoming = (iso: string | null) => (iso && new Date(iso) > now ? shortDate(iso) : null);
  const ends = upcoming(billing?.cancelsAt ?? null);
  if (status === "trialing") {
    const trialEnd = upcoming(billing?.trialEndsAt ?? null);
    if (!trialEnd) return { tone: "trial", text: "Free trial" };
    return ends
      ? { tone: "warn", text: `Free trial · ends ${trialEnd}, won't renew` }
      : { tone: "trial", text: `Free trial · ends ${trialEnd}` };
  }
  return ends ? { tone: "warn", text: `Active until ${ends}` } : { tone: "ok", text: "Active" };
}

/**
 * The offer's description, short enough for a card: the part before a dashed
 * list, cut back to whole sentences under 200 characters.
 */
export function shortDescription(text: string | null | undefined): string | null {
  const first = (text ?? "").split(/\s+-\s+|\n/)[0].replace(/\s+/g, " ").trim();
  if (!first) return null;
  if (first.length <= 200) return first;
  const sentences = first.match(/[^.!?]+[.!?]+/g) ?? [];
  let out = "";
  for (const s of sentences) {
    if ((out + s).trim().length > 200) break;
    out += s;
  }
  return out.trim() || `${first.slice(0, 197).replace(/\s+\S*$/, "")}…`;
}

/** "Content Engine" → "CE": the mark on the app's tile. */
export function appInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** "7 days free, then $29 a month": what an offer under "More from Greater Inside" costs. */
export function offerPriceLine(offer: {
  billingType: "one_time" | "recurring";
  interval: string | null;
  intervalCount: number | null;
  trialDays: number | null;
  priceCents: number;
  currency: string;
}): string {
  const price = money(offer.priceCents, offer.currency);
  if (offer.billingType === "one_time" || !offer.interval) return `${price}, one payment`;
  const every = (offer.intervalCount ?? 1) > 1 ? `every ${offer.intervalCount} ${offer.interval}s` : `a ${offer.interval}`;
  return offer.trialDays && offer.trialDays > 0
    ? `${offer.trialDays} days free, then ${price} ${every}`
    : `${price} ${every}`;
}
