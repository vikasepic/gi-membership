import "server-only";
import * as FLAGS from "country-flag-icons/string/3x2";
import { getSettingsOrDefaults } from "@/lib/settings";
import { loadPurchaseRows } from "@/lib/recent-buyers-data";
import { selectRecentBuyers, type BuyerCard, type BuyerScope, type PurchaseRow } from "@/lib/recent-buyers";

// The public read behind the recent buyers popup. Anyone can call it, so the
// query is a whitelist (AGENTS.md: a value off a URL selects, it never parses)
// and the answer is exactly what a card prints: no email, no ids, no amounts.

export type RecentBuyersResponse = {
  gapMs: number;
  showMs: number;
  cards: (BuyerCard & { flagSvg: string | null })[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_MS = 60_000;
// ponytail: one process-wide entry. Every page is a slice of the same two
// weeks, so one read a minute serves them all; a second server would keep its own.
let cache: { at: number; rows: PurchaseRow[] } | null = null;

export function clearRecentBuyersCache(): void {
  cache = null;
}

function scopeOf(params: URLSearchParams): BuyerScope | null {
  const offer = params.getAll("offer");
  const product = params.getAll("product");
  const home = params.getAll("home");
  if (offer.length + product.length + home.length !== 1) return null;
  if (offer.length === 1) return UUID.test(offer[0]) ? { kind: "offer", id: offer[0] } : null;
  if (product.length === 1) return UUID.test(product[0]) ? { kind: "product", id: product[0] } : null;
  return home[0] === "1" ? { kind: "home" } : null;
}

const flagOf = (code: string | null): string | null => {
  const svg = code ? (FLAGS as Record<string, string | undefined>)[code.toUpperCase()] : undefined;
  return typeof svg === "string" ? svg : null;
};

export async function recentBuyersFor(
  params: URLSearchParams,
  viewerId: string | null,
  now = new Date(),
): Promise<RecentBuyersResponse> {
  const settings = await getSettingsOrDefaults();
  const out: RecentBuyersResponse = {
    gapMs: settings.recentBuyersGapSeconds * 1000,
    showMs: settings.recentBuyersShowSeconds * 1000,
    cards: [],
  };
  const scope = scopeOf(params);
  if (!scope || (scope.kind === "home" && settings.recentBuyersHome === "off")) return out;

  if (!cache || now.getTime() - cache.at > CACHE_MS) {
    cache = { at: now.getTime(), rows: await loadPurchaseRows(now) };
  }
  // The viewer comes off after the cache, so one entry serves everybody and
  // nobody is shown their own purchase.
  out.cards = selectRecentBuyers(cache.rows, scope, now, viewerId).map((c) => ({ ...c, flagSvg: flagOf(c.country) }));
  return out;
}
