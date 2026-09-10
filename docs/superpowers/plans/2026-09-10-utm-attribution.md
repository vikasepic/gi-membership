# UTM Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every order, every Stripe object, every ad event and both admin screens carry the campaign labels (first touch and last touch) and the landing referrer that brought the buyer, captured for everyone without JavaScript or consent.

**Architecture:** The proxy maintains a first-party `gi_utm` cookie from the query string. Order creation copies the cookie onto the order (`utm_first`, `utm_last`, `referrer`); the offer checkout stashes it in intent metadata at start because completion also runs from the webhook. One pure helper turns the record into Stripe metadata keys; `buyerContextFor` carries it onto every server ad event; the Orders page and the traffic dashboard read the columns.

**Tech Stack:** Next.js 16 (proxy.ts, App Router server actions), Supabase/PostgREST, Stripe, vitest (node + react-dom/server markup tests).

**Spec:** `docs/superpowers/specs/2026-09-10-utm-attribution-design.md`

## Global Constraints

- The seven label keys, and only these, everywhere: `utm_source`, `utm_medium`, `utm_campaign`, `utm_adset`, `utm_content`, `utm_term`, `utm_id`. Keys keep the `utm_` prefix in the cookie, the database and Stripe.
- A label value is trimmed, dropped if empty or containing `@`, cut at 120 characters, case preserved.
- Referrer is origin plus path, never the query, foreign hosts only, cut at 200 characters.
- Cookie `gi_utm`: `httpOnly`, `sameSite: "lax"`, `secure` outside development, `maxAge` 365 days, `path: "/"`. Written only when the stored value changes. Unparseable is treated as absent.
- Stripe metadata keys: `utm_*` for last touch, `first_utm_*` for first touch, `referrer`. Only present keys. Spread AFTER every existing key; no existing key or description changes.
- Click ids, IP, user agent and the consented `visitors` row stay behind the consent gate. Nothing in this plan reads or writes them.
- Migration number is `0079`. It must be applied to production by hand, then `notify pgrst, 'reload schema';`, before the image is pushed.
- Every value read off a URL is a whitelist. The Orders page `source` filter accepts only values present in the loaded rows plus `direct`.
- Tracking never throws into a purchase path. Everything added inside `finalizeOrder`, `trackOfferSale`, renewals and the receipt stays inside their existing try/catch.
- Run the FULL suite before every commit that touches `lib/checkout.ts`, `lib/offer-checkout.ts` or `lib/tracking.ts`, and gate on the runner's exit status.
- Commit messages: imperative subject, a body that says why, and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

**Deviation from the spec, decided here:** no `lib/attribution-server.ts`. Reading the cookie is one pure call, `attributionFromCookie(jar.get(UTM_COOKIE)?.value)`, in the two actions that already hold the cookie jar. The client tracker uses the same seven-key `parseLabels` rather than "every `utm_*` key", so the visitor row and the order can never disagree about which keys exist.

---

## File map

| File | Responsibility |
|---|---|
| `lib/attribution.ts` (new) | Pure: types, parsing, merging, cookie (de)serialising, Stripe metadata both ways, order column shape. No imports from Next or Supabase. |
| `lib/attribution.test.ts` (new) | Its behaviour tests. |
| `lib/attribution-cookie.ts` (new) | `applyAttributionCookie(req, res)`: the one function that touches `NextRequest`/`NextResponse`. |
| `lib/attribution-cookie.test.ts` (new) | Cookie set / not set / referrer-only. |
| `proxy.ts` | Calls `applyAttributionCookie`. |
| `components/attribution-tracker.tsx` | Uses `parseLabels`. |
| `supabase/migrations/0079_orders_attribution.sql` (new) | Three columns, backfill. |
| `docs/DATABASE.md` | The three rows. |
| `lib/checkout.ts` | `CheckoutInput.attribution`; both inserts; SetupIntent and PaymentIntent metadata; `fulfilOffer` stamps from the order row; `buyerContextFor` returns `attribution`. |
| `app/(store)/checkout/actions.ts` | Reads the cookie into `attribution`. |
| `lib/offer-checkout.ts` | `startOfferCheckout` args → metadata; `completeOfferCheckout` writes the columns from metadata. |
| `app/(store)/checkout/offer/actions.ts` | Reads the cookie. |
| `lib/renewals.ts` | Copies the three columns from the origin order. |
| `lib/tracking.ts` | `PurchaseEvent.attribution`; Meta `custom_data`; GA4 params. |
| `lib/tracking-receipt.ts` | Receipt carries `attribution`; `reportTrialConverted` reads it. |
| `components/track-purchase.tsx` | Browser copy carries the labels. |
| `app/(store)/checkout/thank-you/page.tsx`, `app/(store)/checkout/oto/page.tsx` | Pass `attribution` to `TrackPurchase`. |
| `app/api/track/event/route.ts` | Upper-funnel server copies read the cookie. |
| `lib/orders.ts` | `OrderRow` gains `buyerName`, `utmFirst`, `utmLast`, `referrer`. |
| `lib/order-view.ts` | `source` filter. |
| `components/admin/attribution-popover.tsx` (new) | Pill + popover, and the inline block. |
| `components/admin/order-row.tsx` | Name, Source cell, inline block. |
| `app/admin/orders/page.tsx` | Source select. |
| `lib/traffic-source.ts` | `sourceOfOrder`. |
| `lib/traffic.ts` | `BoughtRow.source`; the two paid-by queries. |
| `lib/traffic-funnel.ts` | Bought per source; `SourceSplit.orders`. |
| `lib/traffic-overview.ts` | `ordersKnown` no longer forced off under a source filter. |
| `app/admin/traffic/page.tsx` | Passes source-filtered bought rows. |
| `components/admin/traffic-overview.tsx`, `traffic-funnel.tsx`, `traffic-table.tsx` | Bought under a filter; Bought beside Hits in the split; the pre-launch sentence. |
| `docs/products-and-offers.md`, `docs/lessons.md` | Where labels are written; the lesson. |

---

### Task 1: The pure attribution module

**Files:**
- Create: `lib/attribution.ts`
- Test: `lib/attribution.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const UTM_KEYS: readonly ["utm_source","utm_medium","utm_campaign","utm_adset","utm_content","utm_term","utm_id"];
  export type UtmKey; export type Labels = Partial<Record<UtmKey, string>>;
  export type Attribution = { first: Labels; last: Labels; referrer: string | null };
  export const EMPTY_ATTRIBUTION: Attribution;
  export const UTM_COOKIE = "gi_utm"; export const UTM_COOKIE_MAX_AGE: number;
  export type StoredAttribution = { f?: Labels; l?: Labels; fa?: string; la?: string; r?: string };
  export function parseLabels(search: string): Labels;
  export function landingReferrer(referer: string | null | undefined, siteUrl: string | undefined): string | null;
  export function parseCookie(raw: string | null | undefined): StoredAttribution | null;
  export function mergeAttribution(existing: StoredAttribution | null, labels: Labels, referrer: string | null, now: Date): StoredAttribution | null;
  export function serializeCookie(s: StoredAttribution): string;
  export function attributionOf(s: StoredAttribution | null): Attribution;
  export function attributionFromCookie(raw: string | null | undefined): Attribution;
  export function hasLabels(l: Labels | undefined): boolean;
  export function sameLabels(a: Labels | undefined, b: Labels | undefined): boolean;
  export function stripeAttributionMetadata(a: Attribution | null | undefined): Record<string, string>;
  export function attributionFromMetadata(md: Record<string, string> | null | undefined): Attribution;
  export function orderAttributionColumns(a: Attribution | null | undefined): { utm_first: Labels; utm_last: Labels; referrer: string | null };
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/attribution.test.ts
import { describe, it, expect } from "vitest";
import {
  parseLabels,
  landingReferrer,
  parseCookie,
  mergeAttribution,
  serializeCookie,
  attributionOf,
  attributionFromCookie,
  stripeAttributionMetadata,
  attributionFromMetadata,
  orderAttributionColumns,
  EMPTY_ATTRIBUTION,
} from "@/lib/attribution";

const META = "?utm_source=meta&utm_medium=paid_social&utm_campaign=AJ+%7C+LAL+%7C+Book+Writer&utm_adset=LAL+1%25&utm_content=Reel+3&utm_term=120250834047950282&utm_id=120250833683450282&fbclid=IwZX";

describe("parseLabels", () => {
  it("keeps the seven keys and nothing else", () => {
    const l = parseLabels(META);
    expect(l).toEqual({
      utm_source: "meta",
      utm_medium: "paid_social",
      utm_campaign: "AJ | LAL | Book Writer",
      utm_adset: "LAL 1%",
      utm_content: "Reel 3",
      utm_term: "120250834047950282",
      utm_id: "120250833683450282",
    });
    expect("fbclid" in l).toBe(false);
  });

  it("preserves case: the ads team matches on what they typed", () => {
    expect(parseLabels("?utm_campaign=Launch+Week").utm_campaign).toBe("Launch Week");
  });

  it("drops a value with an @ — a per-recipient link names a person", () => {
    expect(parseLabels("?utm_campaign=jane@example.com&utm_source=mail")).toEqual({ utm_source: "mail" });
  });

  it("drops empty values and trims", () => {
    expect(parseLabels("?utm_source=&utm_medium=+cpc+")).toEqual({ utm_medium: "cpc" });
  });

  it("cuts a value at 120 characters", () => {
    const long = "x".repeat(200);
    expect(parseLabels(`?utm_content=${long}`).utm_content).toHaveLength(120);
  });

  it("returns nothing for no query, and never throws on garbage", () => {
    expect(parseLabels("")).toEqual({});
    expect(parseLabels("?%E0%A4%A")).toEqual({});
  });
});

describe("landingReferrer", () => {
  it("keeps origin and path from a foreign host, never the query", () => {
    expect(landingReferrer("https://l.facebook.com/l.php?u=abc&h=def", "https://grow.greaterinside.com")).toBe(
      "https://l.facebook.com/l.php",
    );
  });

  it("ignores our own pages", () => {
    expect(landingReferrer("https://grow.greaterinside.com/p/x", "https://grow.greaterinside.com")).toBeNull();
  });

  it("ignores nothing, blanks and unparseable strings", () => {
    expect(landingReferrer(null, "https://x.test")).toBeNull();
    expect(landingReferrer("   ", "https://x.test")).toBeNull();
    expect(landingReferrer("not a url", "https://x.test")).toBeNull();
  });

  it("cuts at 200 characters", () => {
    const r = landingReferrer(`https://a.test/${"p".repeat(400)}`, "https://x.test")!;
    expect(r).toHaveLength(200);
  });
});

describe("parseCookie", () => {
  it("reads a stored record back", () => {
    const raw = serializeCookie({ f: { utm_source: "ig" }, l: { utm_source: "meta" }, fa: "2026-09-01T00:00:00.000Z", la: "2026-09-10T00:00:00.000Z", r: "https://l.facebook.com/l.php" });
    expect(parseCookie(raw)).toEqual({ f: { utm_source: "ig" }, l: { utm_source: "meta" }, fa: "2026-09-01T00:00:00.000Z", la: "2026-09-10T00:00:00.000Z", r: "https://l.facebook.com/l.php" });
  });

  it("treats garbage, arrays and non-objects as absent", () => {
    expect(parseCookie("not json")).toBeNull();
    expect(parseCookie("[1,2]")).toBeNull();
    expect(parseCookie("42")).toBeNull();
    expect(parseCookie("")).toBeNull();
    expect(parseCookie(undefined)).toBeNull();
  });

  it("ignores keys it does not know and non-string values", () => {
    expect(parseCookie('{"f":{"utm_source":"meta","evil":"x","utm_medium":7},"z":1}')).toEqual({
      f: { utm_source: "meta" },
      l: undefined,
      fa: undefined,
      la: undefined,
      r: undefined,
    });
  });
});

describe("mergeAttribution", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  const later = new Date("2026-09-11T12:00:00.000Z");
  const meta = { utm_source: "meta", utm_campaign: "A" };
  const ig = { utm_source: "ig", utm_campaign: "B" };

  it("sets first and last to the same set on first sight", () => {
    expect(mergeAttribution(null, meta, "https://l.facebook.com/l.php", now)).toEqual({
      f: meta,
      l: meta,
      fa: now.toISOString(),
      la: now.toISOString(),
      r: "https://l.facebook.com/l.php",
    });
  });

  it("replaces only last on a later, different set", () => {
    const first = mergeAttribution(null, meta, "https://l.facebook.com/l.php", now)!;
    expect(mergeAttribution(first, ig, "https://instagram.com/", later)).toEqual({
      ...first,
      l: ig,
      la: later.toISOString(),
    });
  });

  it("writes nothing when the same set arrives again", () => {
    const first = mergeAttribution(null, meta, null, now)!;
    expect(mergeAttribution(first, meta, null, later)).toBeNull();
  });

  it("writes a referrer-only record for a foreign landing with no labels", () => {
    expect(mergeAttribution(null, {}, "https://someblog.example/post", now)).toEqual({ r: "https://someblog.example/post" });
  });

  it("keeps a stored referrer when labels arrive later, and fills first from them", () => {
    const refOnly = { r: "https://someblog.example/post" };
    expect(mergeAttribution(refOnly, meta, "https://l.facebook.com/l.php", later)).toEqual({
      f: meta,
      l: meta,
      fa: later.toISOString(),
      la: later.toISOString(),
      r: "https://someblog.example/post",
    });
  });

  it("writes nothing on a plain request with an existing cookie", () => {
    const first = mergeAttribution(null, meta, null, now)!;
    expect(mergeAttribution(first, {}, "https://someblog.example/post", later)).toBeNull();
    expect(mergeAttribution({ r: "x" }, {}, null, later)).toBeNull();
  });

  it("writes nothing for a plain request with no cookie and our own referrer", () => {
    expect(mergeAttribution(null, {}, null, now)).toBeNull();
  });
});

describe("attributionOf / attributionFromCookie", () => {
  it("is empty for no cookie", () => {
    expect(attributionOf(null)).toEqual(EMPTY_ATTRIBUTION);
    expect(attributionFromCookie(undefined)).toEqual({ first: {}, last: {}, referrer: null });
  });

  it("reads all three parts", () => {
    const raw = serializeCookie({ f: { utm_source: "ig" }, l: { utm_source: "meta" }, r: "https://a.test/" });
    expect(attributionFromCookie(raw)).toEqual({ first: { utm_source: "ig" }, last: { utm_source: "meta" }, referrer: "https://a.test/" });
  });
});

describe("stripeAttributionMetadata", () => {
  it("emits last as utm_*, first as first_utm_*, and the referrer", () => {
    expect(
      stripeAttributionMetadata({
        first: { utm_source: "ig", utm_campaign: "B" },
        last: { utm_source: "meta", utm_medium: "paid_social", utm_adset: "LAL 1%" },
        referrer: "https://l.facebook.com/l.php",
      }),
    ).toEqual({
      utm_source: "meta",
      utm_medium: "paid_social",
      utm_adset: "LAL 1%",
      first_utm_source: "ig",
      first_utm_campaign: "B",
      referrer: "https://l.facebook.com/l.php",
    });
  });

  it("emits nothing for an organic sale", () => {
    expect(stripeAttributionMetadata(EMPTY_ATTRIBUTION)).toEqual({});
    expect(stripeAttributionMetadata(null)).toEqual({});
    expect(stripeAttributionMetadata(undefined)).toEqual({});
  });

  it("round-trips through attributionFromMetadata", () => {
    const a = { first: { utm_source: "ig" }, last: { utm_source: "meta", utm_id: "1" }, referrer: "https://a.test/b" };
    expect(attributionFromMetadata({ store_created: "true", ...stripeAttributionMetadata(a) })).toEqual(a);
    expect(attributionFromMetadata({ store_created: "true" })).toEqual(EMPTY_ATTRIBUTION);
    expect(attributionFromMetadata(null)).toEqual(EMPTY_ATTRIBUTION);
  });
});

describe("orderAttributionColumns", () => {
  it("shapes the three columns, empty objects and null when there is nothing", () => {
    expect(orderAttributionColumns(null)).toEqual({ utm_first: {}, utm_last: {}, referrer: null });
    expect(orderAttributionColumns({ first: { utm_source: "a" }, last: { utm_source: "b" }, referrer: "https://r.test/" })).toEqual({
      utm_first: { utm_source: "a" },
      utm_last: { utm_source: "b" },
      referrer: "https://r.test/",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/attribution.test.ts`
Expected: FAIL — cannot resolve `@/lib/attribution`.

- [ ] **Step 3: Write the module**

```ts
// lib/attribution.ts
/**
 * Where a buyer came from, as the ads team labels it.
 *
 * Pure: no Next, no Supabase, no `server-only`, so the proxy, the client
 * tracker, the checkout and the tests all read the same rules.
 *
 * Labels describe the ad, not the person, so they are captured for everyone
 * — the consent gate stays on click ids, IP and user agent, which is where it
 * belongs. The one guard kept is `@`: several ESPs build per-recipient links,
 * and `utm_campaign=jane@example.com` names a person.
 *
 * Both first touch and last touch are kept. First is the ad that brought
 * them; last is the one they clicked most recently before buying, which is
 * what Ads Manager attributes to. Storing both costs a few bytes and answers
 * either question later without a rebuild.
 */

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_adset",
  "utm_content",
  "utm_term",
  "utm_id",
] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type Labels = Partial<Record<UtmKey, string>>;

export type Attribution = { first: Labels; last: Labels; referrer: string | null };
export const EMPTY_ATTRIBUTION: Attribution = { first: {}, last: {}, referrer: null };

export const UTM_COOKIE = "gi_utm";
/** A year, the same as gi_anon. */
export const UTM_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Long enough for Meta's `{{campaign.name}}`, short enough that seven of
 *  them twice over plus a referrer stay well under the 4 KB cookie limit. */
const MAX_LABEL = 120;
const MAX_REFERRER = 200;

/**
 * What the cookie holds. Short keys on purpose: this rides on every request
 * for a year. `f` first touch, `l` last touch, `fa`/`la` when each was seen,
 * `r` the landing referrer.
 */
export type StoredAttribution = { f?: Labels; l?: Labels; fa?: string; la?: string; r?: string };

export function parseLabels(search: string): Labels {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    // A query that cannot be parsed is not a reason to fail a page render.
    return {};
  }
  const out: Labels = {};
  for (const k of UTM_KEYS) {
    const raw = params.get(k);
    if (raw == null) continue;
    const v = raw.trim().slice(0, MAX_LABEL);
    // The @ is refused before anything else, and that order is the point:
    // cleaning first would turn this guard into decoration.
    if (!v || v.includes("@")) continue;
    out[k] = v;
  }
  return out;
}

/**
 * The page that sent them, if it was not one of ours.
 *
 * Origin and path only. A referrer's query can carry an identifier (a
 * per-recipient token, a session id), and this is stored for everyone.
 */
export function landingReferrer(
  referer: string | null | undefined,
  siteUrl: string | undefined,
): string | null {
  const ref = (referer ?? "").trim();
  if (!ref) return null;
  try {
    const u = new URL(ref);
    if (siteUrl && u.hostname === new URL(siteUrl).hostname) return null;
    return `${u.origin}${u.pathname}`.slice(0, MAX_REFERRER);
  } catch {
    return null;
  }
}

export function parseCookie(raw: string | null | undefined): StoredAttribution | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const s = v as Record<string, unknown>;
    const labels = (x: unknown): Labels | undefined => {
      if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
      const out: Labels = {};
      for (const k of UTM_KEYS) {
        const val = (x as Record<string, unknown>)[k];
        if (typeof val === "string" && val) out[k] = val.slice(0, MAX_LABEL);
      }
      return out;
    };
    const str = (x: unknown): string | undefined => (typeof x === "string" && x ? x : undefined);
    return {
      f: labels(s.f),
      l: labels(s.l),
      fa: str(s.fa),
      la: str(s.la),
      r: str(s.r)?.slice(0, MAX_REFERRER),
    };
  } catch {
    // An unparseable cookie is an absent one. Never an error on a page render.
    return null;
  }
}

export function hasLabels(l: Labels | undefined): boolean {
  return !!l && Object.keys(l).length > 0;
}

/** Same keys in UTM_KEYS order with the same values. Both parsers emit that order. */
export function sameLabels(a: Labels | undefined, b: Labels | undefined): boolean {
  return UTM_KEYS.every((k) => (a?.[k] ?? "") === (b?.[k] ?? ""));
}

/**
 * The record to store after this request, or null when nothing should be
 * written — which is most requests, and is what keeps `Set-Cookie` off every
 * page view after landing.
 *
 * Rules:
 * - labels, no first touch stored yet → first and last are both this set;
 *   a referrer already stored is kept, else the landing one is taken;
 * - labels, first stored → last is replaced unless it is the same set;
 * - no labels, no cookie, foreign referrer → a referrer-only record;
 * - anything else → nothing.
 */
export function mergeAttribution(
  existing: StoredAttribution | null,
  labels: Labels,
  referrer: string | null,
  now: Date,
): StoredAttribution | null {
  const at = now.toISOString();
  if (hasLabels(labels)) {
    if (!existing || !hasLabels(existing.f)) {
      const r = existing?.r ?? referrer ?? undefined;
      return { f: labels, l: labels, fa: at, la: at, ...(r ? { r } : {}) };
    }
    if (sameLabels(existing.l, labels)) return null;
    return { ...existing, l: labels, la: at };
  }
  if (!existing && referrer) return { r: referrer };
  return null;
}

/** Next encodes cookie values itself (encodeURIComponent), so this is plain JSON. */
export function serializeCookie(s: StoredAttribution): string {
  return JSON.stringify(s);
}

export function attributionOf(s: StoredAttribution | null): Attribution {
  return { first: s?.f ?? {}, last: s?.l ?? {}, referrer: s?.r ?? null };
}

export function attributionFromCookie(raw: string | null | undefined): Attribution {
  return attributionOf(parseCookie(raw));
}

/**
 * The labels as Stripe metadata: `utm_*` for last touch, `first_utm_*` for
 * first, `referrer`. Only keys with a value, so an organic sale adds nothing.
 * Spread AFTER a bag's existing keys; nothing in the store uses these names.
 */
export function stripeAttributionMetadata(a: Attribution | null | undefined): Record<string, string> {
  if (!a) return {};
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) if (a.last[k]) out[k] = a.last[k]!;
  for (const k of UTM_KEYS) if (a.first[k]) out[`first_${k}`] = a.first[k]!;
  if (a.referrer) out.referrer = a.referrer;
  return out;
}

/** The reverse, for the offer checkout: completion runs from the webhook too, where there is no cookie. */
export function attributionFromMetadata(md: Record<string, string> | null | undefined): Attribution {
  const first: Labels = {};
  const last: Labels = {};
  for (const k of UTM_KEYS) {
    if (md?.[k]) last[k] = md[k];
    if (md?.[`first_${k}`]) first[k] = md[`first_${k}`];
  }
  return { first, last, referrer: md?.referrer || null };
}

/** The three `orders` columns (migration 0079), for an insert. */
export function orderAttributionColumns(
  a: Attribution | null | undefined,
): { utm_first: Labels; utm_last: Labels; referrer: string | null } {
  return { utm_first: a?.first ?? {}, utm_last: a?.last ?? {}, referrer: a?.referrer ?? null };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/attribution.test.ts`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add lib/attribution.ts lib/attribution.test.ts
git commit -m "Add the pure attribution module: labels, first and last touch, cookie shape, Stripe metadata

Campaign labels are captured for everyone; the consent gate stays on click
ids and the visitor row. A value carrying @ is refused before any cleaning.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The cookie, written by the proxy; the client tracker keeps adset

**Files:**
- Create: `lib/attribution-cookie.ts`
- Test: `lib/attribution-cookie.test.ts`
- Modify: `proxy.ts` (the block that sets `gi_anon`, lines 90-97)
- Modify: `components/attribution-tracker.tsx` (`UTM_KEYS` constant and `utm: pick(UTM_KEYS)`)

**Interfaces:**
- Consumes: Task 1.
- Produces: `applyAttributionCookie(req: NextRequest, res: NextResponse, now?: Date): boolean` — true when a cookie was written.

- [ ] **Step 1: Write the failing test**

```ts
// lib/attribution-cookie.test.ts
import { describe, it, expect } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { applyAttributionCookie } from "@/lib/attribution-cookie";
import { UTM_COOKIE, serializeCookie } from "@/lib/attribution";

const SITE = "http://localhost:3000";

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, SITE), { headers });
}

const stored = (labels: Record<string, string>) =>
  serializeCookie({ f: labels, l: labels, fa: "2026-09-01T00:00:00.000Z", la: "2026-09-01T00:00:00.000Z" });

describe("the gi_utm cookie", () => {
  it("is written on a request carrying labels, httpOnly, for a year", () => {
    const req = request("/p/validator?utm_source=meta&utm_campaign=AJ%20%7C%20LAL&utm_adset=LAL%201%25");
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res, new Date("2026-09-10T00:00:00.000Z"))).toBe(true);
    const c = res.cookies.get(UTM_COOKIE)!;
    expect(c).toBeTruthy();
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("lax");
    expect(c.maxAge).toBe(60 * 60 * 24 * 365);
    expect(c.path).toBe("/");
    const parsed = JSON.parse(c.value);
    expect(parsed.f).toEqual({ utm_source: "meta", utm_campaign: "AJ | LAL", utm_adset: "LAL 1%" });
    expect(parsed.l).toEqual(parsed.f);
    expect(parsed.fa).toBe("2026-09-10T00:00:00.000Z");
  });

  it("is not written on a plain request with a cookie already", () => {
    const req = request("/p/validator", { cookie: `${UTM_COOKIE}=${encodeURIComponent(stored({ utm_source: "meta" }))}` });
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res)).toBe(false);
    expect(res.cookies.get(UTM_COOKIE)).toBeUndefined();
  });

  it("is not written when the same labels arrive again", () => {
    const req = request("/p/validator?utm_source=meta", {
      cookie: `${UTM_COOKIE}=${encodeURIComponent(stored({ utm_source: "meta" }))}`,
    });
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res)).toBe(false);
  });

  it("replaces last touch and keeps first touch on a different ad", () => {
    const req = request("/p/validator?utm_source=ig&utm_campaign=B", {
      cookie: `${UTM_COOKIE}=${encodeURIComponent(stored({ utm_source: "meta", utm_campaign: "A" }))}`,
    });
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res, new Date("2026-09-11T00:00:00.000Z"))).toBe(true);
    const parsed = JSON.parse(res.cookies.get(UTM_COOKIE)!.value);
    expect(parsed.f).toEqual({ utm_source: "meta", utm_campaign: "A" });
    expect(parsed.l).toEqual({ utm_source: "ig", utm_campaign: "B" });
    expect(parsed.la).toBe("2026-09-11T00:00:00.000Z");
  });

  it("writes a referrer-only record for a foreign landing with no labels and no cookie", () => {
    const req = request("/p/validator", { referer: "https://someblog.example/post?x=1" });
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res)).toBe(true);
    expect(JSON.parse(res.cookies.get(UTM_COOKIE)!.value)).toEqual({ r: "https://someblog.example/post" });
  });

  it("ignores our own pages as a referrer", () => {
    const req = request("/checkout", { referer: `${SITE}/p/validator` });
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res)).toBe(false);
  });

  it("treats a corrupt cookie as absent", () => {
    const req = request("/p/validator?utm_source=meta", { cookie: `${UTM_COOKIE}=%7Bnot-json` });
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res)).toBe(true);
    expect(JSON.parse(res.cookies.get(UTM_COOKIE)!.value).f).toEqual({ utm_source: "meta" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/attribution-cookie.test.ts`
Expected: FAIL — cannot resolve `@/lib/attribution-cookie`.

- [ ] **Step 3: Write the helper**

```ts
// lib/attribution-cookie.ts
import type { NextRequest, NextResponse } from "next/server";
import {
  UTM_COOKIE,
  UTM_COOKIE_MAX_AGE,
  landingReferrer,
  mergeAttribution,
  parseCookie,
  parseLabels,
  serializeCookie,
} from "@/lib/attribution";

/**
 * Maintain the gi_utm cookie for this request.
 *
 * Its own file, not a block in proxy.ts, so it can be exercised with a bare
 * NextRequest and no Supabase session lookup in the way. The proxy calls it
 * beside gi_anon and does nothing clever itself.
 *
 * Returns whether a cookie was written. Most requests write nothing — that is
 * what keeps Set-Cookie off every page view after landing.
 */
export function applyAttributionCookie(req: NextRequest, res: NextResponse, now = new Date()): boolean {
  const labels = parseLabels(req.nextUrl.search);
  const stored = parseCookie(req.cookies.get(UTM_COOKIE)?.value);
  const referrer = landingReferrer(req.headers.get("referer"), process.env.NEXT_PUBLIC_SITE_URL);
  const next = mergeAttribution(stored, labels, referrer, now);
  if (!next) return false;
  res.cookies.set(UTM_COOKIE, serializeCookie(next), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: UTM_COOKIE_MAX_AGE,
    path: "/",
  });
  return true;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/attribution-cookie.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the proxy**

In `proxy.ts`, add the import at the top:

```ts
import { applyAttributionCookie } from "@/lib/attribution-cookie";
```

and replace the `gi_anon` block at the end of `proxy()` with:

```ts
  if (!req.cookies.get("gi_anon")) {
    res.cookies.set("gi_anon", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  // The campaign that brought them, captured on the server so a visitor who
  // bounces before JavaScript runs is still recorded, and kept for a year so
  // a purchase weeks later still carries it. Labels only — the consent gate
  // stays on click ids, IP and user agent (see lib/attribution.ts).
  applyAttributionCookie(req, res);
  return res;
```

Also update the file's header comment (the `// - Ensures a first-party anon id cookie` line) by adding one line beneath it:

```ts
// - Maintains the gi_utm cookie: first-touch and last-touch campaign labels
//   plus the landing referrer, for everyone, no JavaScript needed.
```

- [ ] **Step 6: The client tracker keeps every one of the seven keys**

In `components/attribution-tracker.tsx`:

- add `import { parseLabels } from "@/lib/attribution";` under the react import;
- delete the line `const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];`
- change `utm: pick(UTM_KEYS),` to `utm: parseLabels(window.location.search),`
- above that line add the comment:

```ts
      // The same seven keys the server keeps (lib/attribution.ts), so the
      // consented visitor row and the order can never disagree about which
      // labels exist. The old fixed five dropped utm_adset — the one key the
      // ads team's template is built around.
```

`pick` is still used for `CLICK_KEYS`; leave it.

- [ ] **Step 7: Typecheck and run the two suites plus the tracker's neighbours**

Run: `npx tsc --noEmit && npx vitest run lib/attribution.test.ts lib/attribution-cookie.test.ts`
Expected: tsc exit 0; both PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/attribution-cookie.ts lib/attribution-cookie.test.ts proxy.ts components/attribution-tracker.tsx
git commit -m "Capture campaign labels in a gi_utm cookie from the proxy, for everyone

Written on the server from the landing request, so a visitor who bounces
before hydration is still recorded. First touch and last touch, plus the
landing referrer, for a year. The client tracker now keeps utm_adset too.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Migration 0079, and the product checkout writes the order and the intents

**Files:**
- Create: `supabase/migrations/0079_orders_attribution.sql`
- Modify: `docs/DATABASE.md` (the `orders` table, after the `livemode` row)
- Modify: `lib/checkout.ts` — `CheckoutInput` (after `sourceUrl?: string | null;`), the SetupIntent metadata (ends `newAccount,` near line 476), the recurring-branch `orders` insert (line ~488), the PaymentIntent metadata (ends `newAccount,` near line 636), the one-time `orders` insert (line ~644)
- Modify: `app/(store)/checkout/actions.ts` (the `anonId` block, line ~82, and the `createCheckoutIntent` call)
- Test: `lib/checkout.integration.test.ts` (new `it` inside the existing `describe.skipIf(!canRun)`)

**Interfaces:**
- Consumes: `Attribution`, `stripeAttributionMetadata`, `orderAttributionColumns`, `attributionFromCookie`, `UTM_COOKIE` from Task 1.
- Produces: `CheckoutInput.attribution?: Attribution | null`. Orders columns `utm_first jsonb`, `utm_last jsonb`, `referrer text`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0079_orders_attribution.sql
--
-- Where an order came from, as the ads team labels it.
--
-- A snapshot on the order rather than a pointer: orders.visitor_id points at
-- a row that exists only with cookie consent, which most buyers never give —
-- 5 of 13 paid orders could be attributed through it. The labels describe the
-- ad, not the person, so they are captured for everyone and copied here at
-- creation. Written by lib/checkout.ts (product checkout), lib/offer-checkout.ts
-- (offer checkout, from the intent's metadata because completion also runs
-- from the webhook) and lib/renewals.ts (copied from the origin order).
--
-- Shape: {"utm_source": "meta", "utm_medium": "paid_social", ...} — the seven
-- keys in lib/attribution.ts, with their utm_ prefix. utm_first is the ad that
-- brought them, utm_last the one they clicked most recently before buying.
-- Empty object means no labels, which the admin reads as "direct".

alter table orders
  add column if not exists utm_first jsonb not null default '{}'::jsonb,
  add column if not exists utm_last  jsonb not null default '{}'::jsonb,
  add column if not exists referrer  text;

comment on column orders.utm_first is 'First-touch campaign labels (utm_source … utm_id) snapshotted at order creation. {} when none. See lib/attribution.ts.';
comment on column orders.utm_last  is 'Last-touch campaign labels snapshotted at order creation. {} when none. What the Orders page and Stripe metadata show.';
comment on column orders.referrer  is 'Landing referrer, origin + path, foreign hosts only. Null when direct or unknown.';

-- Recover what the consented visitor rows already know. Only utm_* keys —
-- visitors.utm was written by the client tracker from whatever the URL
-- carried — and only onto orders that have nothing yet, so this can be
-- re-run without overwriting a real snapshot.
update orders o
   set utm_first = coalesce((select jsonb_object_agg(t.k, t.val) from jsonb_each_text(vis.utm) as t(k, val) where t.k like 'utm\_%' and t.val <> ''), '{}'::jsonb),
       utm_last  = coalesce((select jsonb_object_agg(t.k, t.val) from jsonb_each_text(vis.utm) as t(k, val) where t.k like 'utm\_%' and t.val <> ''), '{}'::jsonb),
       referrer  = coalesce(o.referrer, left(vis.referrer, 200))
  from visitors vis
 where vis.id = o.visitor_id
   and vis.utm <> '{}'::jsonb
   and o.utm_first = '{}'::jsonb;
```

- [ ] **Step 2: Apply it to the local database and reload PostgREST**

Run:
```bash
docker exec -i supabase_db_gi-membership psql -U postgres -d postgres < supabase/migrations/0079_orders_attribution.sql
```
(If the local container name differs, `docker ps --format '{{.Names}}' | grep supabase_db` and use that.) Then in psql: `notify pgrst, 'reload schema';`. Expected: `ALTER TABLE`, three `COMMENT`, `UPDATE n`.

- [ ] **Step 3: Document the columns**

In `docs/DATABASE.md`, in the `orders` table, add after the `livemode` row:

```markdown
| `utm_first` | jsonb | no | `'{}'::jsonb` | First-touch campaign labels (utm_source … utm_id), snapshotted at creation. Migration 0079. |
| `utm_last` | jsonb | no | `'{}'::jsonb` | Last-touch campaign labels, snapshotted at creation. Shown on the Orders page; mirrored into Stripe metadata. |
| `referrer` | text | yes |  | Landing referrer, origin + path, foreign hosts only. |
```

- [ ] **Step 4: Write the failing integration test**

Add inside `describe.skipIf(!canRun)("checkout money path (integration)", …)` in `lib/checkout.integration.test.ts`:

```ts
  it("writes the campaign it came from onto the order and the PaymentIntent, beside the keys already there", async () => {
    const email = `it_${Date.now()}_utm@example.com`;
    createdEmails.push(email);
    const attribution = {
      first: { utm_source: "ig", utm_medium: "paid", utm_campaign: "Launch A" },
      last: {
        utm_source: "meta",
        utm_medium: "paid_social",
        utm_campaign: "AJ | LAL | Book Writer",
        utm_adset: "LAL 1%",
        utm_content: "Reel 3",
      },
      referrer: "https://l.facebook.com/l.php",
    };
    const res = await createCheckoutIntent({
      productSlug: "placeholder-offer",
      email,
      fullName: "Test Buyer",
      bumpChoice: "none",
      attribution,
    });
    if (!res.ok) throw new Error(`createCheckoutIntent failed: ${res.error}`);
    const piId = res.clientSecret.split("_secret_")[0];

    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("utm_first, utm_last, referrer")
      .eq("stripe_payment_intent_id", piId)
      .single();
    expect(order?.utm_last).toEqual(attribution.last);
    expect(order?.utm_first).toEqual(attribution.first);
    expect(order?.referrer).toBe(attribution.referrer);

    const pi = await stripe().paymentIntents.retrieve(piId);
    expect(pi.metadata.utm_source).toBe("meta");
    expect(pi.metadata.utm_adset).toBe("LAL 1%");
    expect(pi.metadata.first_utm_source).toBe("ig");
    expect(pi.metadata.referrer).toBe(attribution.referrer);
    // The keys another platform already reads must be exactly where they were.
    expect(pi.metadata.store_created).toBe("true");
    expect(pi.metadata.productSlug).toBe("placeholder-offer");
  });
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run lib/checkout.integration.test.ts -t "campaign it came from"`
Expected: FAIL — tsc/vitest complains `attribution` is not in `CheckoutInput`, or the order columns come back `{}`.

- [ ] **Step 6: Thread attribution through the product checkout**

In `lib/checkout.ts`:

Add to the imports:
```ts
import { stripeAttributionMetadata, orderAttributionColumns, type Attribution } from "@/lib/attribution";
```

In `CheckoutInput`, after `sourceUrl?: string | null;`:
```ts
  /**
   * The campaign that brought them, off the gi_utm cookie — read by the
   * action layer, never from the client payload. Snapshotted onto the order
   * and mirrored into the intent's metadata so the platform the ads team
   * reads from Stripe can tell a paid sale from an organic one.
   */
  attribution?: Attribution | null;
```

In the recurring branch's `setupIntents.create` metadata, after the line `newAccount,` (just before the closing `},` of `metadata`), add:
```ts
        // Last touch as utm_*, first touch as first_utm_*, plus referrer.
        // Spread last: nothing above uses these names, and the keys another
        // platform already reads stay exactly where they are.
        ...stripeAttributionMetadata(input.attribution),
```

In the recurring branch's `orders` insert, after `visitor_id: visitor,`:
```ts
      ...orderAttributionColumns(input.attribution),
```

In the one-time branch's `paymentIntents.create` metadata, after `newAccount,`:
```ts
        ...stripeAttributionMetadata(input.attribution),
```

In the one-time branch's `orders` insert, after `visitor_id: visitorId,`:
```ts
      ...orderAttributionColumns(input.attribution),
```

There are exactly two `newAccount,` lines inside metadata objects in `createCheckoutIntent` and exactly two `visitor_id:` lines in its inserts. Touch all four.

- [ ] **Step 7: Read the cookie in the action**

In `app/(store)/checkout/actions.ts`:

Add the import:
```ts
import { UTM_COOKIE, attributionFromCookie } from "@/lib/attribution";
```

After `const anonId = jar.get("gi_anon")?.value ?? null;` add:
```ts
  // The campaign labels, for everyone — no consent needed for a label that
  // describes the ad rather than the person. See lib/attribution.ts.
  const attribution = attributionFromCookie(jar.get(UTM_COOKIE)?.value);
```

Change the return to:
```ts
  return createCheckoutIntent({ ...parsed.data, existingUserId, anonId, trackingConsent, attribution, ...client });
```

- [ ] **Step 8: Run the test and the typecheck**

Run: `npx tsc --noEmit && npx vitest run lib/checkout.integration.test.ts`
Expected: tsc exit 0; every test in the file PASS, including the new one.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0079_orders_attribution.sql docs/DATABASE.md lib/checkout.ts "app/(store)/checkout/actions.ts" lib/checkout.integration.test.ts
git commit -m "Snapshot the campaign onto every product order and its Stripe intent

Migration 0079 adds utm_first, utm_last and referrer to orders and
backfills them from the consented visitor rows. The product checkout writes
them on both branches and mirrors them into the SetupIntent's and
PaymentIntent's metadata after the keys already there.

Migration must be applied by hand before this image serves traffic.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The offer checkout carries it through the intent

**Files:**
- Modify: `lib/offer-checkout.ts` — `startOfferCheckout` args (line ~120), the `metadata` object (line ~234, ends `newAccount: args.isNewAccount ? "true" : "false",`), the `orders` insert in `completeOfferCheckout` (line ~548, after `buyer_country: normalizeCountry(country) ?? null,`)
- Modify: `app/(store)/checkout/offer/actions.ts` (`startOfferCheckout` call, line ~60)
- Test: `lib/offer-checkout-intent.integration.test.ts` (two new `it`s in the existing describe)
- Test: `lib/offer-checkout-complete.integration.test.ts` (one new `it` in the existing describe)

**Interfaces:**
- Consumes: Task 1.
- Produces: `startOfferCheckout({ …, attribution?: Attribution | null })`.

Why metadata and not the cookie at completion: `completeOfferCheckout` is reached from the return route AND from the Stripe webhook, which has no cookies. The intent is the one thing both paths hold, and Stripe needs the keys anyway.

- [ ] **Step 1: Write the failing tests**

In `lib/offer-checkout-intent.integration.test.ts`, inside the describe, add:

```ts
  it("carries the campaign onto a one-time offer's PaymentIntent beside the existing keys", async () => {
    const { userId, email } = await member();
    const offerId = await offerOf("one_time");
    const res = await startOfferCheckout({
      userId,
      email,
      offerId,
      attribution: {
        first: { utm_source: "ig" },
        last: { utm_source: "meta", utm_medium: "paid_social", utm_adset: "LAL 1%" },
        referrer: "https://l.facebook.com/l.php",
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const pi = await stripe().paymentIntents.retrieve(res.clientSecret.split("_secret_")[0]);
    expect(pi.metadata.utm_source).toBe("meta");
    expect(pi.metadata.utm_adset).toBe("LAL 1%");
    expect(pi.metadata.first_utm_source).toBe("ig");
    expect(pi.metadata.referrer).toBe("https://l.facebook.com/l.php");
    expect(pi.metadata.store_created).toBe("true");
    expect(pi.metadata.offerId).toBe(offerId);
  });

  it("carries the campaign onto a trial's SetupIntent too", async () => {
    const { userId, email } = await member();
    const offerId = await offerOf("recurring");
    const res = await startOfferCheckout({
      userId,
      email,
      offerId,
      attribution: { first: { utm_source: "meta" }, last: { utm_source: "meta" }, referrer: null },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const si = await stripe().setupIntents.retrieve(res.clientSecret.split("_secret_")[0]);
    expect(si.metadata?.utm_source).toBe("meta");
    expect(si.metadata?.first_utm_source).toBe("meta");
    expect(si.metadata?.offerId).toBe(offerId);
  });
```

In `lib/offer-checkout-complete.integration.test.ts`, inside `describe.skipIf(!canRun)("completeOfferCheckout's claim on a race (0070)", …)`, after the `beforeAll`/`afterAll`, add:

```ts
  it("writes the campaign from the intent's metadata onto the order — there is no cookie on the webhook path", async () => {
    const db = createServiceClient();
    const { userId } = await buyer("utm");
    const storeId = await getStoreId();
    const piId = `pi_utm_${crypto.randomUUID()}`;
    PI_RESPONSES.set(piId, {
      id: piId,
      object: "payment_intent",
      status: "succeeded",
      amount: PRICE_CENTS,
      customer: `cus_utm_${crypto.randomUUID()}`,
      payment_method: `pm_utm_${crypto.randomUUID()}`,
      metadata: {
        userId,
        offerId: fixtureOfferId,
        storeId,
        offerPriceId: "",
        couponCode: "",
        newAccount: "false",
        utm_source: "meta",
        utm_medium: "paid_social",
        utm_campaign: "AJ | LAL",
        first_utm_source: "ig",
        referrer: "https://l.facebook.com/l.php",
      },
    });
    const res = await completeOfferCheckout(piId);
    expect(res.ok).toBe(true);
    const { data: order } = await db
      .from("orders")
      .select("id, utm_first, utm_last, referrer")
      .eq("stripe_payment_intent_id", piId)
      .single();
    orderIds.push(order!.id as string);
    expect(order?.utm_last).toEqual({ utm_source: "meta", utm_medium: "paid_social", utm_campaign: "AJ | LAL" });
    expect(order?.utm_first).toEqual({ utm_source: "ig" });
    expect(order?.referrer).toBe("https://l.facebook.com/l.php");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/offer-checkout-intent.integration.test.ts lib/offer-checkout-complete.integration.test.ts`
Expected: the three new tests FAIL (unknown `attribution` arg; `utm_last` comes back `{}`).

- [ ] **Step 3: Thread it through `lib/offer-checkout.ts`**

Add the import:
```ts
import { stripeAttributionMetadata, attributionFromMetadata, orderAttributionColumns, type Attribution } from "@/lib/attribution";
```

In `startOfferCheckout`'s args, after `isNewAccount?: boolean;`:
```ts
  /**
   * The campaign that brought them, off the gi_utm cookie, read by the action.
   * Stashed in the intent's metadata rather than read again at completion:
   * completeOfferCheckout also runs from the Stripe webhook, which has no
   * cookies, and the intent is the one thing both paths hold.
   */
  attribution?: Attribution | null;
```

In the `metadata` object, after `newAccount: args.isNewAccount ? "true" : "false",`:
```ts
    // Last touch as utm_*, first touch as first_utm_*, plus referrer — for
    // the platform the ads team reads from Stripe, and read back at
    // completion to write the order. Spread last; the keys above are what
    // that platform already filters on and they do not move.
    ...stripeAttributionMetadata(args.attribution),
```

In `completeOfferCheckout`'s `orders` insert, after `buyer_country: normalizeCountry(country) ?? null,`:
```ts
      // From the metadata WE wrote at start, never from a request: the
      // webhook has no cookie, and the return route's cookie could have moved
      // on to a later ad by the time Stripe sends the buyer back.
      ...orderAttributionColumns(attributionFromMetadata(si.metadata as Record<string, string> | null)),
```

- [ ] **Step 4: Read the cookie in the offer action**

In `app/(store)/checkout/offer/actions.ts`:

Add imports:
```ts
import { cookies } from "next/headers";
import { UTM_COOKIE, attributionFromCookie } from "@/lib/attribution";
```

Before `const res = await startOfferCheckout({`, add:
```ts
  const jar = await cookies();
  const attribution = attributionFromCookie(jar.get(UTM_COOKIE)?.value);
```

and add `attribution,` to the `startOfferCheckout({ … })` call after `bumpChoice: parsedBump.data,`.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx tsc --noEmit && npx vitest run lib/offer-checkout-intent.integration.test.ts lib/offer-checkout-complete.integration.test.ts`
Expected: tsc exit 0; all PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/offer-checkout.ts "app/(store)/checkout/offer/actions.ts" lib/offer-checkout-intent.integration.test.ts lib/offer-checkout-complete.integration.test.ts
git commit -m "Carry the campaign through the offer checkout's intent onto the order

Stashed in the intent's metadata at start, because completion also runs from
the Stripe webhook where there is no cookie. Read back at completion to
write utm_first, utm_last and referrer.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `fulfilOffer` stamps every subscription and off-session charge; renewals copy the columns

**Files:**
- Modify: `lib/checkout.ts` — `fulfilOffer` (the `subscriptions.create` metadata ending `offerName: offer.name,` near line 818, and the one-time `paymentIntents.create` metadata ending `offerName: offer.name,` near line 890)
- Modify: `lib/renewals.ts` — the origin select (line ~237) and return (line ~249), the `orders` insert (line ~95)
- Test: `lib/renewals.test.ts` (extend the existing "carries the attribution" test)
- Test: `lib/offer-checkout.integration.test.ts` (one new `it` — see below for where)

**Interfaces:**
- Consumes: Task 1, Task 3's columns.
- Produces: nothing new; every caller of `fulfilOffer` (offer checkout, bump, upsell accept, library one-tap) gets the metadata without being changed.

- [ ] **Step 1: Write the failing tests**

In `lib/renewals.test.ts`, replace the body of the test `"carries the attribution the sale was won with"` with:

```ts
    // A conversion with no match data is one Meta can count but not learn from.
    // And a renewal belongs to the campaign that made the sale, so the labels
    // come along with the visitor.
    for (const f of ["visitor_id", "tracking_consent", "buyer_country", "utm_first", "utm_last", "referrer"]) {
      expect(renewals, f).toContain(f);
    }
```

In `lib/offer-checkout.integration.test.ts`, find the first test that completes a RECURRING offer checkout and ends with a subscription id it can read (search the file for `subscriptions.retrieve` or `stripe_subscription_id`). Add a new `it` in the same describe, using that test's own fixture helpers (the same offer-creation and buyer helpers it calls), with this body once a subscription id `subId` is in hand — the setup lines are whatever that test already does to reach a subscription, with `attribution` added to its `startOfferCheckout` call:

```ts
    // Setup: exactly as the test above reaches a subscription, but with
    // `attribution: { first: { utm_source: "ig" }, last: { utm_source: "meta", utm_campaign: "AJ | LAL" }, referrer: null }`
    // passed to startOfferCheckout. Then:
    const sub = await stripe().subscriptions.retrieve(subId);
    expect(sub.metadata.utm_source).toBe("meta");
    expect(sub.metadata.utm_campaign).toBe("AJ | LAL");
    expect(sub.metadata.first_utm_source).toBe("ig");
    expect(sub.metadata.store_created).toBe("true");
    expect(sub.metadata.offerName).toBeTruthy();
```

Name it `"stamps the campaign onto the subscription fulfilOffer creates"`. If no existing test in that file reaches a subscription id, put the new test in `lib/subscription-sync.integration.test.ts` instead, whose second describe (`"releases the single-use token when fulfilOffer ITSELF throws"`) already builds a recurring upsell through `acceptOto`; there, read the subscription id off the `order_items` row `acceptOto` writes (`stripe_subscription_id` where `kind = 'oto'`) after a successful accept, and note in the report which file you chose and why.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/renewals.test.ts lib/offer-checkout.integration.test.ts`
Expected: the renewals test FAILS on `utm_first`; the subscription test FAILS on `utm_source` undefined.

- [ ] **Step 3: `fulfilOffer` reads the order's labels once and stamps both branches**

In `lib/checkout.ts`, inside `fulfilOffer`, immediately after the line `const idem = …;` and before `if (offer.billingType === "recurring") {`, add:

```ts
  // The campaign this order came from, for the subscription's or charge's
  // metadata. Read off the order rather than passed by every caller: the
  // offer checkout, the bump, the upsell accept and the library's one-tap
  // all reach here, and one read is how none of them forgets. Empty for an
  // organic sale, which adds no keys.
  const { data: orderRow } = await createServiceClient()
    .from("orders")
    .select("utm_first, utm_last, referrer")
    .eq("id", order.id)
    .maybeSingle();
  const campaign = stripeAttributionMetadata({
    first: (orderRow?.utm_first as Labels | null) ?? {},
    last: (orderRow?.utm_last as Labels | null) ?? {},
    referrer: (orderRow?.referrer as string | null) ?? null,
  });
```

Extend the Task 3 import line in `lib/checkout.ts` to:
```ts
import { stripeAttributionMetadata, orderAttributionColumns, type Attribution, type Labels } from "@/lib/attribution";
```

In the `subscriptions.create` metadata, after `offerName: offer.name,`:
```ts
          ...campaign,
```

In the one-time `paymentIntents.create` metadata (the one with `off_session: true, confirm: true`), after `offerName: offer.name,`:
```ts
        ...campaign,
```

- [ ] **Step 4: Renewals copy the three columns**

In `lib/renewals.ts`:

In the origin select, change the string to:
```ts
      "store_id, user_id, email, currency, stripe_customer_id, visitor_id, tracking_consent, buyer_country, utm_first, utm_last, referrer",
```

In the returned object, after `buyerCountry: …,` add:
```ts
    utmFirst: (order.utm_first as Record<string, string> | null) ?? {},
    utmLast: (order.utm_last as Record<string, string> | null) ?? {},
    referrer: (order.referrer as string | null) ?? null,
```

Find the type that object is declared against (the function's return type, or an `Origin` type near the top of the file) and add the three fields to it:
```ts
  utmFirst: Record<string, string>;
  utmLast: Record<string, string>;
  referrer: string | null;
```

In the renewal `orders` insert, after `buyer_country: origin.buyerCountry,`:
```ts
      // The campaign that won the sale owns its renewals too.
      utm_first: origin.utmFirst,
      utm_last: origin.utmLast,
      referrer: origin.referrer,
```

- [ ] **Step 5: Run the tests, the typecheck, and the FULL suite**

Run: `npx tsc --noEmit && npx vitest run lib/renewals.test.ts lib/offer-checkout.integration.test.ts lib/subscription-sync.integration.test.ts`
Expected: PASS.

Then: `npx vitest run; echo "exit=$?"`
Expected: every file passes and `exit=0`.

- [ ] **Step 6: Commit**

```bash
git add lib/checkout.ts lib/renewals.ts lib/renewals.test.ts lib/offer-checkout.integration.test.ts lib/subscription-sync.integration.test.ts
git commit -m "Stamp the campaign onto every subscription and off-session charge; renewals inherit it

fulfilOffer reads the order's labels once, so the offer checkout, the bump,
the upsell accept and the library's one-tap all carry them without being
changed. A renewal copies them from the origin order the way it copies the
visitor.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Meta and GA4 events carry the labels, server and browser

**Files:**
- Modify: `lib/tracking.ts` — `PurchaseEvent` (after `numItems?: number;`), `buildMetaEvent` `custom_data`, `buildGa4Event` `params`
- Modify: `lib/checkout.ts` — `buyerContextFor` (select and return)
- Modify: `lib/tracking-receipt.ts` — `TrackingReceipt`, `receiptFor`, `reportTrialConverted`
- Modify: `components/track-purchase.tsx`
- Modify: `app/(store)/checkout/thank-you/page.tsx` and `app/(store)/checkout/oto/page.tsx` (`<TrackPurchase … />`)
- Modify: `app/api/track/event/route.ts`
- Test: `lib/tracking.test.ts`

**Interfaces:**
- Consumes: `Attribution`, `UTM_KEYS`, `attributionFromCookie`, `UTM_COOKIE`.
- Produces: `PurchaseEvent.attribution?: Attribution | null`; `TrackingReceipt.attribution: Attribution`; `TrackPurchase` prop `attribution?: Attribution | null`; a pure `adEventParams(a): Record<string,string>` exported from `lib/attribution.ts` (added here, tested here).

- [ ] **Step 1: Write the failing tests**

Append to `lib/tracking.test.ts`:

```ts
describe("the campaign on an event", () => {
  const attribution = {
    first: { utm_source: "ig", utm_campaign: "B" },
    last: { utm_source: "meta", utm_medium: "paid_social", utm_campaign: "A", utm_adset: "LAL 1%", utm_content: "Reel", utm_term: "t", utm_id: "1" },
    referrer: "https://l.facebook.com/l.php",
  };

  it("rides in Meta's custom_data beside the money, last as utm_*, first as first_utm_*", () => {
    const meta = buildMetaEvent({ ...event, attribution });
    const cd = meta.data[0].custom_data as Record<string, unknown>;
    expect(cd.value).toBe(27);
    expect(cd.utm_source).toBe("meta");
    expect(cd.utm_adset).toBe("LAL 1%");
    expect(cd.first_utm_source).toBe("ig");
    expect(cd.first_utm_campaign).toBe("B");
    expect(cd.referrer).toBe("https://l.facebook.com/l.php");
  });

  it("rides in GA4 params under GA4's own campaign names, with adset and first touch as custom params", () => {
    const ga = buildGa4Event({ ...event, attribution });
    const p = ga.events[0].params as Record<string, unknown>;
    expect(p.transaction_id).toBe("order-1");
    expect(p.source).toBe("meta");
    expect(p.medium).toBe("paid_social");
    expect(p.campaign).toBe("A");
    expect(p.content).toBe("Reel");
    expect(p.term).toBe("t");
    expect(p.campaign_id).toBe("1");
    expect(p.adset).toBe("LAL 1%");
    expect(p.first_source).toBe("ig");
    expect(p.first_campaign).toBe("B");
    expect(p.referrer).toBe("https://l.facebook.com/l.php");
    expect("first_medium" in p).toBe(false);
  });

  it("adds no keys at all to an event without one", () => {
    const cd = buildMetaEvent(event).data[0].custom_data as Record<string, unknown>;
    expect(Object.keys(cd).some((k) => k.startsWith("utm_") || k.startsWith("first_") || k === "referrer")).toBe(false);
    const p = buildGa4Event({ ...event, attribution: { first: {}, last: {}, referrer: null } }).events[0].params as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual(["currency", "transaction_id", "value"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/tracking.test.ts`
Expected: the three new tests FAIL (`attribution` not a known field; keys missing).

- [ ] **Step 3: The GA4 name mapping, in the pure module**

Append to `lib/attribution.ts`:

```ts
/**
 * GA4's own parameter names for a campaign, so its attribution reports read
 * them: campaign_id, campaign, source, medium, term, content. `utm_adset` has
 * no GA4 name and first touch has none either — those go as custom params
 * (adset, first_source, first_medium, first_campaign, referrer), which GA4
 * stores and shows only once somebody registers each as a custom dimension.
 */
export function ga4CampaignParams(a: Attribution | null | undefined): Record<string, string> {
  if (!a) return {};
  const out: Record<string, string> = {};
  const l = a.last;
  if (l.utm_id) out.campaign_id = l.utm_id;
  if (l.utm_campaign) out.campaign = l.utm_campaign;
  if (l.utm_source) out.source = l.utm_source;
  if (l.utm_medium) out.medium = l.utm_medium;
  if (l.utm_term) out.term = l.utm_term;
  if (l.utm_content) out.content = l.utm_content;
  if (l.utm_adset) out.adset = l.utm_adset;
  if (a.first.utm_source) out.first_source = a.first.utm_source;
  if (a.first.utm_medium) out.first_medium = a.first.utm_medium;
  if (a.first.utm_campaign) out.first_campaign = a.first.utm_campaign;
  if (a.referrer) out.referrer = a.referrer;
  return out;
}
```

- [ ] **Step 4: The event carries it**

In `lib/tracking.ts`:

Add the import:
```ts
import { stripeAttributionMetadata, ga4CampaignParams, type Attribution } from "@/lib/attribution";
```

In `PurchaseEvent`, after `numItems?: number;`:
```ts
  /**
   * The campaign the order came from, off the order row. Sent to Meta as
   * custom_data keys (for reading in Events Manager — Meta attributes by
   * fbc, not by this) and to GA4 under its own campaign parameter names.
   */
  attribution?: Attribution | null;
```

In `buildMetaEvent`, change the `custom_data` block to:
```ts
        custom_data: compact({
          order_id: e.orderId,
          value: NO_VALUE.includes(e.eventName) ? undefined : major(e.valueCents),
          currency: NO_VALUE.includes(e.eventName) ? undefined : e.currency.toUpperCase(),
          ...content,
          // The same keys the Stripe metadata carries, so the ads team reads
          // one vocabulary in both places.
          ...stripeAttributionMetadata(e.attribution),
        }),
```

In `buildGa4Event`, change `params` to:
```ts
        params: {
          transaction_id: e.orderId, // GA4 dedupes replays on this
          ...money,
          ...ga4CampaignParams(e.attribution),
        },
```

- [ ] **Step 5: Every server event site gets it through `buyerContextFor`**

In `lib/checkout.ts`, in `buyerContextFor`:

Change the select string to:
```ts
      "id, email, user_id, visitor_id, buyer_country, client_ip, client_user_agent, source_url, utm_first, utm_last, referrer",
```

In the returned object, after `numItems: (items ?? []).length || undefined,`:
```ts
    attribution: {
      first: (order.utm_first as Labels | null) ?? {},
      last: (order.utm_last as Labels | null) ?? {},
      referrer: (order.referrer as string | null) ?? null,
    } satisfies Attribution,
```

`finalizeOrder`, `trackOfferSale`, `recordRenewal` and `reportReversal` all spread `...who`, so they now carry it with no other change.

- [ ] **Step 6: The receipt and the browser copy**

In `lib/tracking-receipt.ts`:

Add the import:
```ts
import { EMPTY_ATTRIBUTION, type Attribution, type Labels } from "@/lib/attribution";
```

In `TrackingReceipt`, after `email: string | null;`:
```ts
  /** For the browser copy, so both halves of a deduplicated event carry the same labels. */
  attribution: Attribution;
```

In `receiptFor`, change the select to `"id, total_cents, currency, email, status, utm_first, utm_last, referrer"` and add to the returned object:
```ts
      attribution: {
        first: (order.utm_first as Labels | null) ?? {},
        last: (order.utm_last as Labels | null) ?? {},
        referrer: (order.referrer as string | null) ?? null,
      },
```

In `reportTrialConverted`, change the order select to `"visitor_id, buyer_country, client_ip, client_user_agent, source_url, utm_first, utm_last, referrer"` and add to the `trackServerEvent({ … })` call, after `sourceUrl: …,`:
```ts
    attribution: order
      ? {
          first: (order.utm_first as Labels | null) ?? {},
          last: (order.utm_last as Labels | null) ?? {},
          referrer: (order.referrer as string | null) ?? null,
        }
      : EMPTY_ATTRIBUTION,
```

In `components/track-purchase.tsx`:

Add the import:
```ts
import { stripeAttributionMetadata, type Attribution } from "@/lib/attribution";
```

Add the prop `attribution?: Attribution | null;` after `customEvent?: …;` with the doc comment:
```ts
  /** Off the order row, via the receipt — never off the URL. Same keys the server copy sends. */
  attribution?: Attribution | null;
```

Inside the effect, before the first `track(` call, add `const campaign = stripeAttributionMetadata(attribution);` and spread `...campaign` into the params object of each of the three calls (`track("Purchase", { value…, order_id: orderId, ...campaign }, …)`, the `StartTrial` params, and the `trackNamedCustom` params). Add `attribution` to the effect's dependency array.

In `app/(store)/checkout/thank-you/page.tsx` and `app/(store)/checkout/oto/page.tsx`, add `attribution={receipt.attribution}` to the `<TrackPurchase … />` element.

- [ ] **Step 7: Upper-funnel server copies read the cookie**

In `app/api/track/event/route.ts`:

Add the import:
```ts
import { UTM_COOKIE, attributionFromCookie } from "@/lib/attribution";
```

In the `trackServerEvent({ … })` call, after `contentName: body.contentName,`:
```ts
    // Off the cookie, never the body: a caller can say which event happened,
    // not which campaign it belongs to.
    attribution: attributionFromCookie(jar.get(UTM_COOKIE)?.value),
```

- [ ] **Step 8: Run the tests and the FULL suite**

Run: `npx tsc --noEmit && npx vitest run lib/tracking.test.ts lib/attribution.test.ts`
Expected: PASS.

Then: `npx vitest run; echo "exit=$?"`
Expected: `exit=0`. (Files that assert the shape of `custom_data` or GA4 `params` exactly — `lib/tracking-match.test.ts` is the likely one — must still pass; an event without attribution emits no new keys, so they should. If one fails on a new key, the fix is in this task's code, not in that test.)

- [ ] **Step 9: Commit**

```bash
git add lib/attribution.ts lib/tracking.ts lib/tracking.test.ts lib/checkout.ts lib/tracking-receipt.ts components/track-purchase.tsx "app/(store)/checkout/thank-you/page.tsx" "app/(store)/checkout/oto/page.tsx" app/api/track/event/route.ts
git commit -m "Send the campaign to Meta and GA4 on every event, server and browser

Meta gets the same utm_* / first_utm_* keys as the Stripe metadata in
custom_data. GA4 gets its own campaign parameter names, with adset and first
touch as custom params. buyerContextFor carries it, so every server event
site has it; the receipt carries it to the browser copy.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The Orders page — name, source pill, popover, filter

**Files:**
- Modify: `lib/orders.ts` (`OrderRow`, `listOrders` select and mapping)
- Modify: `lib/order-view.ts` (`OrderFilter.source`, `filterFrom`, `filterHref`, `applyFilter`, `haystack`)
- Create: `components/admin/attribution-popover.tsx`
- Modify: `components/admin/order-row.tsx`
- Modify: `app/admin/orders/page.tsx`
- Test: `components/admin/order-page.test.tsx` (extend), `lib/order-view.test.ts` (create if absent; extend if present)

**Interfaces:**
- Consumes: Task 1 types; Task 3 columns.
- Produces:
  ```ts
  // lib/orders.ts
  OrderRow.buyerName: string | null; OrderRow.utmFirst: Labels; OrderRow.utmLast: Labels; OrderRow.referrer: string | null;
  // lib/order-view.ts
  OrderFilter.source: string;  // "" = all
  export function sourcesIn(orders: OrderRow[]): string[];  // distinct last-touch utm_source values present, busiest first, then "direct" if any order has none
  export function sourceLabel(o: OrderRow): string;  // "meta · paid_social" | "meta" | "direct"
  // components/admin/attribution-popover.tsx
  export function SourcePill({ order }: { order: OrderRow }): JSX.Element;     // pill + click popover
  export function AttributionBlock({ order }: { order: OrderRow }): JSX.Element | null; // inline list
  ```

- [ ] **Step 1: Write the failing tests**

Append to `components/admin/order-page.test.tsx` (the `order()` factory must gain the new fields — update it: add `buyerName: "Jane Buyer", utmFirst: {}, utmLast: {}, referrer: null,` after `livemode: true,`):

```tsx
describe("where it came from", () => {
  const paid = () =>
    order({
      utmLast: { utm_source: "meta", utm_medium: "paid_social", utm_campaign: "AJ | LAL", utm_adset: "LAL 1%", utm_content: "Reel 3" },
      utmFirst: { utm_source: "ig", utm_medium: "paid", utm_campaign: "Launch" },
      referrer: "https://l.facebook.com/l.php",
    });

  it("shows the buyer's name above the email", () => {
    const out = row();
    expect(out.indexOf("Jane Buyer")).toBeGreaterThan(-1);
    expect(out.indexOf("Jane Buyer")).toBeLessThan(out.indexOf("buyer@test.com"));
  });

  it("shows source and medium in the row, and nothing more until asked", () => {
    const out = row(paid());
    expect(out).toContain("meta · paid_social");
    expect(out).not.toContain("LAL 1%");
    expect(out).not.toContain("l.facebook.com");
  });

  it("reads direct when there are no labels", () => {
    expect(row()).toContain("direct");
  });
});
```

And, in a new file `components/admin/attribution-popover.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AttributionBlock, SourcePill } from "@/components/admin/attribution-popover";
import type { OrderRow } from "@/lib/orders";

const base: OrderRow = {
  id: "o1",
  email: "b@t.com",
  buyerName: null,
  status: "paid",
  currency: "usd",
  totalCents: 100,
  taxCents: null,
  buyerCountry: null,
  stripePaymentIntentId: null,
  livemode: true,
  createdAt: "2026-09-10T00:00:00Z",
  items: [],
  utmFirst: {},
  utmLast: {},
  referrer: null,
};

describe("AttributionBlock", () => {
  it("lists every last-touch label, first touch only when it differs, and the referrer", () => {
    const out = renderToStaticMarkup(
      <AttributionBlock
        order={{
          ...base,
          utmLast: { utm_source: "meta", utm_medium: "paid_social", utm_campaign: "A", utm_adset: "LAL 1%", utm_content: "Reel", utm_term: "t", utm_id: "1" },
          utmFirst: { utm_source: "ig", utm_campaign: "B" },
          referrer: "https://l.facebook.com/l.php",
        }}
      />,
    );
    for (const v of ["meta", "paid_social", "A", "LAL 1%", "Reel", "t", "1"]) expect(out).toContain(v);
    expect(out).toContain("First touch");
    expect(out).toContain("ig");
    expect(out).toContain("l.facebook.com/l.php");
  });

  it("does not repeat first touch when it is the same as last", () => {
    const same = { utm_source: "meta", utm_campaign: "A" };
    const out = renderToStaticMarkup(<AttributionBlock order={{ ...base, utmLast: same, utmFirst: same }} />);
    expect(out).not.toContain("First touch");
  });

  it("says so when there is nothing but a referrer, and renders nothing when there is nothing at all", () => {
    expect(renderToStaticMarkup(<AttributionBlock order={{ ...base, referrer: "https://someblog.example/post" }} />)).toContain("someblog.example");
    expect(renderToStaticMarkup(<AttributionBlock order={base} />)).toBe("");
  });
});

describe("SourcePill", () => {
  it("reads source · medium, or the source alone, or direct", () => {
    expect(renderToStaticMarkup(<SourcePill order={{ ...base, utmLast: { utm_source: "meta", utm_medium: "paid_social" } }} />)).toContain("meta · paid_social");
    expect(renderToStaticMarkup(<SourcePill order={{ ...base, utmLast: { utm_source: "meta" } }} />)).toContain("meta");
    expect(renderToStaticMarkup(<SourcePill order={base} />)).toContain("direct");
  });

  it("is a button, so a phone can open it", () => {
    expect(renderToStaticMarkup(<SourcePill order={base} />)).toMatch(/<button[^>]*type="button"/);
  });
});
```

And `lib/order-view.test.ts` — create it if it does not exist; if it exists, append the describe:

```ts
import { describe, it, expect } from "vitest";
import { filterFrom, filterHref, applyFilter, sourcesIn, sourceLabel, DEFAULT_FILTER } from "@/lib/order-view";
import type { OrderRow } from "@/lib/orders";

const o = (over: Partial<OrderRow>): OrderRow => ({
  id: Math.random().toString(36).slice(2),
  email: "b@t.com",
  buyerName: null,
  status: "paid",
  currency: "usd",
  totalCents: 100,
  taxCents: null,
  buyerCountry: null,
  stripePaymentIntentId: null,
  livemode: true,
  createdAt: "2026-09-10T00:00:00Z",
  items: [],
  utmFirst: {},
  utmLast: {},
  referrer: null,
  ...over,
});

describe("the source filter", () => {
  const orders = [
    o({ utmLast: { utm_source: "meta", utm_medium: "paid_social" } }),
    o({ utmLast: { utm_source: "meta" } }),
    o({ utmLast: { utm_source: "ig" } }),
    o({}),
  ];

  it("lists the sources present, busiest first, then direct", () => {
    expect(sourcesIn(orders)).toEqual(["meta", "ig", "direct"]);
    expect(sourcesIn([o({ utmLast: { utm_source: "meta" } })])).toEqual(["meta"]);
  });

  it("keeps only that source, and direct means no labels", () => {
    expect(applyFilter(orders, { ...DEFAULT_FILTER, source: "meta" })).toHaveLength(2);
    expect(applyFilter(orders, { ...DEFAULT_FILTER, source: "direct" })).toHaveLength(1);
    expect(applyFilter(orders, { ...DEFAULT_FILTER, source: "" })).toHaveLength(4);
  });

  it("is read off the URL only when it names a source that is present — a whitelist, never a parse", () => {
    expect(filterFrom({ source: "meta" }, ["meta", "ig", "direct"]).source).toBe("meta");
    expect(filterFrom({ source: "tiktok" }, ["meta", "ig", "direct"]).source).toBe("");
    expect(filterFrom({ source: "<script>" }, ["meta"]).source).toBe("");
    expect(filterFrom({}, ["meta"]).source).toBe("");
  });

  it("rides in every link and is searchable", () => {
    expect(filterHref({ ...DEFAULT_FILTER, source: "meta" }, {})).toBe("/admin/orders?source=meta");
    expect(applyFilter(orders, { ...DEFAULT_FILTER, q: "paid_social" })).toHaveLength(1);
  });

  it("labels a row for the pill", () => {
    expect(sourceLabel(orders[0])).toBe("meta · paid_social");
    expect(sourceLabel(orders[1])).toBe("meta");
    expect(sourceLabel(orders[3])).toBe("direct");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/admin/order-page.test.tsx components/admin/attribution-popover.test.tsx lib/order-view.test.ts`
Expected: FAIL (missing fields, missing module, missing exports).

- [ ] **Step 3: `lib/orders.ts` — the columns and the name**

Add the import `import type { Labels } from "@/lib/attribution";`.

In `OrderRow`, after `email: string;`:
```ts
  /** users.username, which the checkout fills with the typed full name. Null when unknown. */
  buyerName: string | null;
```
and after `items: OrderItemRow[];`:
```ts
  /** Campaign labels, migration 0079. Empty objects when none — the admin reads that as direct. */
  utmFirst: Labels;
  utmLast: Labels;
  referrer: string | null;
```

In `listOrders`, change the select to:
```ts
      "id, email, status, currency, total_cents, tax_cents, buyer_country, stripe_payment_intent_id, host_offer_id, livemode, created_at, utm_first, utm_last, referrer, users(username)",
```

`orders.user_id` references `users(id)`, so PostgREST embeds the buyer as `users`. In the mapping, add:
```ts
    buyerName: ((o.users as { username?: string | null } | null)?.username as string | null) ?? null,
    utmFirst: (o.utm_first as Labels | null) ?? {},
    utmLast: (o.utm_last as Labels | null) ?? {},
    referrer: (o.referrer as string | null) ?? null,
```

If the embed comes back as an array in this PostgREST version (`o.users` is `[{ username }]`), take `[0]`; write it as `const u = Array.isArray(o.users) ? o.users[0] : o.users;` and read `u?.username`.

Run `npx tsc --noEmit` now: every other place that constructs an `OrderRow` (tests, fixtures) will need the four new fields. Add them there with `buyerName: null, utmFirst: {}, utmLast: {}, referrer: null`.

- [ ] **Step 4: `lib/order-view.ts` — the filter**

Add `import type { Labels } from "@/lib/attribution";` if needed (it is not — `OrderRow` already carries the type; skip).

Change `OrderFilter` to include `source: string;` with the comment `/** A last-touch utm_source present in the loaded rows, "direct", or "" for all. */`, and `DEFAULT_FILTER` to include `source: ""`.

Add:
```ts
/** The pill's words: source and medium of last touch, or direct. */
export function sourceLabel(o: OrderRow): string {
  const s = o.utmLast.utm_source;
  if (!s) return "direct";
  return o.utmLast.utm_medium ? `${s} · ${o.utmLast.utm_medium}` : s;
}

/** The sources present, busiest first, then "direct" if any order has none. The filter's whitelist. */
export function sourcesIn(orders: OrderRow[]): string[] {
  const count = new Map<string, number>();
  let direct = 0;
  for (const o of orders) {
    const s = o.utmLast.utm_source;
    if (s) count.set(s, (count.get(s) ?? 0) + 1);
    else direct += 1;
  }
  const named = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
  return direct > 0 ? [...named, "direct"] : named;
}
```

Change `filterFrom` to take the whitelist: `export function filterFrom(params: …, sources: string[] = []): OrderFilter` and add to the returned object:
```ts
    // A whitelist built from the data: the URL can only name a source that
    // is actually on the page. Anything else is "all".
    source: sources.includes(one("source") ?? "") ? (one("source") as string) : "",
```

In `filterHref`, after the `sort` line: `if (next.source) q.set("source", next.source);`

In `haystack`, add `...Object.values(o.utmLast), ...Object.values(o.utmFirst), o.referrer ?? "",` to the array.

In `applyFilter`, inside the `filter` callback after the status checks:
```ts
    if (filter.source === "direct" && o.utmLast.utm_source) return false;
    if (filter.source && filter.source !== "direct" && o.utmLast.utm_source !== filter.source) return false;
```

`chipCounts` calls `applyFilter` with `{ ...filter, status }` so it already respects the source.

- [ ] **Step 5: The popover component**

```tsx
// components/admin/attribution-popover.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { UTM_KEYS, sameLabels, type Labels } from "@/lib/attribution";
import { sourceLabel } from "@/lib/order-view";
import type { OrderRow } from "@/lib/orders";

/**
 * Where an order came from, on the Orders page.
 *
 * Two shapes of the same facts. SourcePill is the row's cell: "meta ·
 * paid_social" and, on click, a small popover with every label — a click,
 * not a hover, because hover does not exist on a phone. AttributionBlock is
 * the same list inline, for the expanded row, so a screenshot of an order
 * shows its campaign without anybody clicking.
 */

const SHORT: Record<string, string> = {
  utm_source: "Source",
  utm_medium: "Medium",
  utm_campaign: "Campaign",
  utm_adset: "Ad set",
  utm_content: "Ad",
  utm_term: "Term",
  utm_id: "Campaign id",
};

function Rows({ labels }: { labels: Labels }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {UTM_KEYS.filter((k) => labels[k]).map((k) => (
        <div key={k} className="contents">
          <dt className="text-muted">{SHORT[k]}</dt>
          <dd className="break-words">{labels[k]}</dd>
        </div>
      ))}
    </dl>
  );
}

function Referrer({ url }: { url: string }) {
  return (
    <div className="text-xs">
      <span className="text-muted">Referrer </span>
      <span className="break-all">{url.replace(/^https?:\/\//, "")}</span>
    </div>
  );
}

export function AttributionBlock({ order }: { order: OrderRow }) {
  const hasLast = Object.keys(order.utmLast).length > 0;
  const hasFirst = Object.keys(order.utmFirst).length > 0;
  if (!hasLast && !hasFirst && !order.referrer) return null;
  const firstDiffers = hasFirst && !sameLabels(order.utmFirst, order.utmLast);
  return (
    <div className="flex flex-col gap-2">
      {hasLast && <Rows labels={order.utmLast} />}
      {firstDiffers && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <span className="kicker text-muted">First touch</span>
          <Rows labels={order.utmFirst} />
        </div>
      )}
      {order.referrer && <Referrer url={order.referrer} />}
    </div>
  );
}

export function SourcePill({ order }: { order: OrderRow }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside or Escape closes. Registered only while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = sourceLabel(order);
  const empty = !Object.keys(order.utmLast).length && !Object.keys(order.utmFirst).length && !order.referrer;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        // The row toggles on click; this must not.
        onClick={(e) => {
          e.stopPropagation();
          if (!empty) setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-haspopup={empty ? undefined : "dialog"}
        className={`inline-flex max-w-[12rem] items-center truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${
          label === "direct" ? "bg-surface-2 text-muted" : "bg-navy/10 text-navy"
        } ${empty ? "cursor-default" : "cursor-pointer hover:opacity-80"}`}
        title={empty ? undefined : "Show every label"}
      >
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Where this order came from"
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          <AttributionBlock order={order} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: The row**

In `components/admin/order-row.tsx`:

Add the import `import { AttributionBlock, SourcePill } from "@/components/admin/attribution-popover";`.

Change the Buyer cell to:
```tsx
        <td className="px-3 py-2.5">
          {order.buyerName && <span className="block text-sm font-medium">{order.buyerName}</span>}
          <span className={`text-sm ${order.buyerName ? "text-muted" : "font-medium"}`}>{order.email}</span>
          {order.buyerCountry && (
            <span className="ml-2 text-xs text-muted">{order.buyerCountry}</span>
          )}
        </td>
```

After the Status cell (`</td>` that closes the status pill cell) and before the Total cell, add:
```tsx
        <td className="px-3 py-2.5">
          <SourcePill order={order} />
        </td>
```

Change the expanded row's `colSpan={6}` to `colSpan={7}`.

In the expanded row, after the `<dl className="flex min-w-44 flex-col gap-1 text-xs text-muted">…</dl>` block, add:
```tsx
              <div className="min-w-56">
                <AttributionBlock order={order} />
              </div>
```

- [ ] **Step 7: The page**

In `app/admin/orders/page.tsx`:

Add `sourcesIn` to the `@/lib/order-view` import.

Change the body's first lines to:
```tsx
  const all = await listOrders();
  const sources = sourcesIn(all);
  const filter = filterFrom(await searchParams, sources);
```

In the form, after the `sort` hidden input, nothing (the source select is in the form). Add after `<Picker name="sort" … />`:
```tsx
          {sources.length > 0 && (
            <Picker
              name="source"
              value={filter.source}
              options={[{ key: "", label: "Any source" }, ...sources.map((s) => ({ key: s, label: s }))]}
              label="Source"
            />
          )}
```

`Picker` is generic over `T extends string`, and `""` is a string, so this typechecks.

Extend the Clear condition with `|| filter.source`.

In the table header, add `<Th>Source</Th>` between `<Th>Status</Th>` and `<Th right>Total</Th>`, and widen `min-w-[46rem]` to `min-w-[54rem]`.

- [ ] **Step 8: Run the tests and typecheck**

Run: `npx tsc --noEmit && npx vitest run components/admin lib/order-view.test.ts`
Expected: PASS, including every pre-existing test in `components/admin`.

- [ ] **Step 9: Look at it**

Run the dev server and open `/admin/orders` as an admin (or use the headless shoot in `docs/superpowers` / the visual-verification memory if the session has it). Confirm: name above email; a pill per row; clicking a pill opens the popover and does not expand the row; the select filters; `direct` rows have an inert pill. Fix anything wrong before committing.

- [ ] **Step 10: Commit**

```bash
git add lib/orders.ts lib/order-view.ts lib/order-view.test.ts components/admin/attribution-popover.tsx components/admin/attribution-popover.test.tsx components/admin/order-row.tsx components/admin/order-page.test.tsx app/admin/orders/page.tsx
git commit -m "Show who bought and where they came from on the Orders page

The buyer's name above the email, a source · medium pill that opens every
label on click, the same block in the expanded row, and a source filter
whose accepted values are the sources on the page.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The traffic dashboard counts sales per source

**Files:**
- Modify: `lib/traffic-source.ts` (add `sourceOfOrder`)
- Modify: `lib/traffic.ts` (`BoughtRow`, `paidByProduct`, `paidByOffer`)
- Modify: `lib/traffic-funnel.ts` (`BoughtRow`, `SourceSplit`, `buildFunnels`)
- Modify: `lib/traffic-overview.ts` (`overviewRows` call sites keep `ordersKnown` but the page stops passing `false`; `topSource` unchanged)
- Modify: `app/admin/traffic/page.tsx` (the source-filtered `buildFunnels` call and its comment)
- Modify: `components/admin/traffic-overview.tsx` (the Bought cell and the note under a source filter)
- Modify: `components/admin/traffic-funnel.tsx` (the "Came from" split shows Bought)
- Modify: `components/admin/traffic-table.tsx` (`CoverageNote` gains the pre-launch sentence)
- Test: `lib/traffic-source.test.ts`, `lib/traffic-funnel.test.ts`, `lib/traffic-overview.test.ts`, `components/admin/traffic-overview.test.tsx`

**Interfaces:**
- Consumes: Task 3's columns; `Labels`.
- Produces:
  ```ts
  // lib/traffic-source.ts
  export function sourceOfOrder(utmLast: Labels | null | undefined, referrer: string | null | undefined): string;
  // lib/traffic-funnel.ts (re-exported by lib/traffic.ts)
  export type BoughtRow = { product: string; source: string; orders: number };
  export type SourceSplit = { source: string; hits: number; orders: number };
  ```

- [ ] **Step 1: Write the failing tests**

Append to `lib/traffic-source.test.ts` (add `sourceOfOrder` to the import):

```ts
describe("where an order came from", () => {
  it("buckets by the campaign, the same slug a view gets", () => {
    const search = "?utm_campaign=AJ%20%7C%20LAL%20%7C%20Book%20Writer&utm_source=meta";
    expect(sourceOfOrder({ utm_campaign: "AJ | LAL | Book Writer", utm_source: "meta" }, null)).toBe(sourceOf(search, null));
    expect(sourceOfOrder({ utm_campaign: "AJ | LAL | Book Writer" }, null)).toBe("aj-lal-book-writer");
  });

  it("falls back to the source, with Meta's and Google's names folded", () => {
    for (const s of ["fb", "ig", "meta", "facebook", "instagram", "Meta"]) expect(sourceOfOrder({ utm_source: s }, null)).toBe("meta");
    for (const s of ["google", "adwords"]) expect(sourceOfOrder({ utm_source: s }, null)).toBe("google");
    expect(sourceOfOrder({ utm_source: "Newsletter Weekly" }, null)).toBe("newsletter-weekly");
  });

  it("refuses a campaign that names a person and uses the source instead", () => {
    expect(sourceOfOrder({ utm_campaign: "jane@example.com", utm_source: "mail" }, null)).toBe("mail");
  });

  it("calls a foreign referrer a referral and nothing at all direct", () => {
    expect(sourceOfOrder({}, "https://someblog.example/post")).toBe("referral");
    expect(sourceOfOrder({}, `${process.env.NEXT_PUBLIC_SITE_URL}/p/x`)).toBe("direct");
    expect(sourceOfOrder({}, null)).toBe("direct");
    expect(sourceOfOrder(null, undefined)).toBe("direct");
  });
});
```

In `lib/traffic-funnel.test.ts`, every existing `bought` fixture `{ product: "validator", orders: 9 }` gains `source: "direct"` (tsc will list them). Then append:

```ts
describe("bought, per source", () => {
  const views = [
    row({ path: "/p/validator", hits: 100, source: "meta" }),
    row({ path: "/p/validator", hits: 40, source: "direct" }),
  ];
  const bought = [
    { product: "validator", source: "meta", orders: 6 },
    { product: "validator", source: "direct", orders: 3 },
  ];

  it("sums every source into the fourth step", () => {
    const view = buildFunnels(views, bought, NAMES, DAYS);
    expect(view.funnels[0].steps[3].count).toBe(9);
  });

  it("shows orders beside hits in the source split, zero where a source drove views but no sale", () => {
    const view = buildFunnels([...views, row({ path: "/p/validator", hits: 5, source: "referral" })], bought, NAMES, DAYS);
    expect(view.funnels[0].sources).toEqual([
      { source: "meta", hits: 100, orders: 6 },
      { source: "direct", hits: 40, orders: 3 },
      { source: "referral", hits: 5, orders: 0 },
    ]);
  });

  it("lists a source that sold without a counted view, so a sale is never hidden", () => {
    const view = buildFunnels(views, [...bought, { product: "validator", source: "newsletter", orders: 2 }], NAMES, DAYS);
    expect(view.funnels[0].sources.find((s) => s.source === "newsletter")).toEqual({ source: "newsletter", hits: 0, orders: 2 });
    expect(view.funnels[0].steps[3].count).toBe(11);
  });

  it("gives a funnel to an owner that only sold, from any source", () => {
    const view = buildFunnels([], [{ product: "carousels", source: "meta", orders: 1 }], NAMES, DAYS);
    expect(view.funnels.map((f) => f.key)).toEqual(["carousels"]);
  });
});
```

In `components/admin/traffic-overview.test.tsx`, find the test that asserts Bought is blank (an em dash) under a source filter — its name mentions the source filter and "—" or "blank". Change it to assert the opposite: with `filter.source = "meta"` and a row whose `steps[3]` is `6`, the rendered markup contains `6` in the Bought column and does NOT contain the sentence "Orders are not attributed to a source". Keep the test's own fixture; only the expectations change. If the file has no such test, add one:

```tsx
  it("shows Bought under a source filter now that orders carry a source", () => {
    const out = render([rowWith({ steps: [100, 30, 12, 6] })], { ...FILTER, source: "meta" }, ["meta"]);
    expect(out).toContain(">6<");
    expect(out).not.toContain("Orders are not attributed");
    expect(out).toContain("Showing views and orders from");
  });
```
using whatever `render`/`rowWith`/`FILTER` helpers that file already defines (they exist; the file renders `TrafficOverview` to markup).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/traffic-source.test.ts lib/traffic-funnel.test.ts components/admin/traffic-overview.test.tsx`
Expected: FAIL (no `sourceOfOrder`; `source` missing on `BoughtRow`; blank cell).

- [ ] **Step 3: `sourceOfOrder`**

Append to `lib/traffic-source.ts`:

```ts
const META_SOURCES = new Set(["fb", "ig", "meta", "facebook", "instagram"]);
const GOOGLE_SOURCES = new Set(["google", "adwords"]);

/**
 * Where an ORDER came from, in the same words `sourceOf` uses for a view.
 *
 * Same `campaignSlug`, same order of preference, so a campaign's views and
 * its sales land in one bucket and the Bought step under a source filter is
 * that source's own number. A view has click ids and an order does not, so
 * the Meta/Google fold reads utm_source instead: `fb`, `ig` and `meta` are
 * the names the ads team's own templates have used.
 */
export function sourceOfOrder(
  utmLast: Partial<Record<string, string>> | null | undefined,
  referrer: string | null | undefined,
): string {
  const campaign = utmLast?.utm_campaign?.trim();
  if (campaign) {
    const slug = campaignSlug(campaign);
    if (slug) return slug;
  }
  const source = utmLast?.utm_source?.trim().toLowerCase();
  if (source) {
    if (META_SOURCES.has(source)) return "meta";
    if (GOOGLE_SOURCES.has(source)) return "google";
    const slug = campaignSlug(source);
    if (slug) return slug;
  }
  const ref = (referrer ?? "").trim();
  if (!ref) return "direct";
  try {
    const host = new URL(ref).hostname;
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (site && host === new URL(site).hostname) return "direct";
  } catch {
    return "direct";
  }
  return "referral";
}
```

- [ ] **Step 4: The queries carry a source**

In `lib/traffic-funnel.ts`, change:
```ts
export type BoughtRow = { product: string; source: string; orders: number };
export type SourceSplit = { source: string; hits: number; orders: number };
```

In `lib/traffic.ts`, change its own `BoughtRow` (line 35) identically, and add `import { sourceOf, isBot, sourceOfOrder } from "@/lib/traffic-source";`.

In `paidByProduct`: select `"id, utm_last, referrer"` instead of `"id"` on the orders read (type `{ id: string; utm_last: Record<string,string> | null; referrer: string | null }`), keep a `sourceOfId = new Map(orders.map((o) => [o.id, sourceOfOrder(o.utm_last, o.referrer)]))`, and change the dedup to key on product AND source:

```ts
    // Distinct ORDERS per product and source: an order with two rows for the
    // same product is one sale, and counting rows would inflate the step it
    // feeds. Keyed on the order's source too, so the traffic page can show
    // sales beside views per source.
    const seen = new Map<string, Set<string>>();
    for (const i of items) {
      const slug = slugOf.get(i.product_id);
      if (!slug) continue;
      const key = `${slug} ${sourceOfId.get(i.order_id) ?? "direct"}`;
      const set = seen.get(key) ?? new Set<string>();
      set.add(i.order_id);
      seen.set(key, set);
    }
    return [...seen.entries()].map(([key, set]) => {
      const [product, source] = key.split(" ");
      return { product, source, orders: set.size };
    });
```

In `paidByOffer`: select `"id, host_offer_id, utm_last, referrer"`, and key the set on `${key} ${sourceOfOrder(o.utm_last, o.referrer)}`, returning `{ product, source, orders }` the same way.

- [ ] **Step 5: `buildFunnels` sums per source**

In `lib/traffic-funnel.ts`, replace the `boughtOf` map with two:

```ts
  // Bought per owner (the fourth step) and per owner-and-source (the split).
  // First occurrence of a (product, source) pair wins, for the reason the
  // owners map gives above; the per-owner total is the sum of those.
  const boughtBySource = new Map<string, Map<string, number>>();
  for (const b of bought) {
    const m = per(boughtBySource, b.product, () => new Map<string, number>());
    if (!m.has(b.source)) m.set(b.source, b.orders);
  }
  const boughtOf = new Map<string, number>();
  for (const [product, m] of boughtBySource) boughtOf.set(product, [...m.values()].reduce((a, n) => a + n, 0));
```

(`per` is defined a few lines below the current `boughtOf`; move the `per` helper above this block.)

In the funnel mapping, change `sources: splitOf(sources.get(key) ?? new Map()),` to:
```ts
        sources: splitOf(sources.get(key) ?? new Map(), boughtBySource.get(key) ?? new Map()),
```

Change `splitOf` to:
```ts
/**
 * Views and sales per source, busiest first. A source that sold without a
 * counted view still appears, with zero hits: hiding a sale is the one
 * direction this page must never be wrong in.
 */
function splitOf(hits: Map<string, number>, orders: Map<string, number> = new Map()): SourceSplit[] {
  const keys = new Set([...hits.keys(), ...orders.keys()]);
  return [...keys]
    .map((source) => ({ source, hits: hits.get(source) ?? 0, orders: orders.get(source) ?? 0 }))
    .sort((a, b) => b.hits - a.hits || b.orders - a.orders || a.source.localeCompare(b.source));
}
```

The `others` rows call `splitOf(o.sources)`; with the default second argument they gain `orders: 0`, which is right — a page with no funnel has no sale.

- [ ] **Step 6: The page passes source-filtered bought rows**

In `app/admin/traffic/page.tsx`, replace the `sourceView` block and its long comment with:

```ts
  // Job 3 of the source filter is not hiding rows — it recomputes the steps,
  // the trend and the totals from that source's rows alone. Orders carry a
  // source now (orders.utm_last, bucketed by sourceOfOrder with the same
  // rules a view gets), so the fourth step is that source's own sales.
  const sourceView = filter.source
    ? buildFunnels(
        counts.filter((c) => c.source === filter.source),
        boughtRows.filter((b) => b.source === filter.source),
        owners,
        days,
      )
    : view;
  const shown = applyOverview(overviewRows(sourceView), filter);
```

In `lib/traffic-overview.ts`, leave `overviewRows(view, ordersKnown = true)` as is (a caller may still have a reason to blank the sale) but shorten its comment to: `// Under a source filter the sale IS known now — orders carry a source — so callers pass the default.` Update the `sourcesIn` doc only if it mentions orders (it does not).

- [ ] **Step 7: The table shows it**

In `components/admin/traffic-overview.tsx`:

Replace the note under a source filter with:
```tsx
      {filter.source && (
        <p className="text-xs text-muted">
          Showing views and orders from <span className="font-medium text-fg">{filter.source}</span>.
          Orders are bucketed the way views are — by campaign name, else by source — so Bought is
          this source&rsquo;s own sales.
        </p>
      )}
```

Change the `blank` computation to:
```ts
                  const blank = r.kind === "other" ? i > 0 : r.steps[i] === null;
```
and its comment to: `// An em dash means "this page has no such step" — a row with no funnel, or an owner with no upsell. Never a zero, which is a measurement.`

In `components/admin/traffic-funnel.tsx`, change the "Came from" pill to show orders:
```tsx
            <span
              key={s.source}
              className="rounded-full border border-border px-2 py-0.5 text-[0.7rem]"
              title={`${n(s.hits)} sales-page views, ${n(s.orders)} bought`}
            >
              {s.source} <span className="tabular-nums text-fg">{n(s.hits)}</span>
              {s.orders > 0 && (
                <span className="ml-1 tabular-nums text-navy">· {n(s.orders)} bought</span>
              )}
            </span>
```
and change the trailing `sales-page views only` label to `sales-page views · bought`.

In `components/admin/traffic-table.tsx`, extend `CoverageNote`'s paragraph with one more sentence at the end:
```tsx
      {" "}Orders placed before 11 Sep 2026 carry no campaign unless the buyer had accepted cookies,
      and sit under <span className="font-medium text-fg">direct</span>.
```

Set that date to the day this ships if it differs.

- [ ] **Step 8: Run the tests and typecheck**

Run: `npx tsc --noEmit && npx vitest run lib/traffic-source.test.ts lib/traffic-funnel.test.ts lib/traffic-overview.test.ts lib/traffic-owners.test.ts lib/traffic-wiring.test.ts components/admin/traffic-overview.test.tsx components/admin/traffic-funnel.test.tsx components/admin/traffic-table.test.tsx lib/traffic.integration.test.ts`
Expected: PASS. Any pre-existing test that pinned "Bought blank under a source filter" or `bought = []` must be updated to the new behaviour with the same care as Step 1, not deleted.

- [ ] **Step 9: Commit**

```bash
git add lib/traffic-source.ts lib/traffic-source.test.ts lib/traffic.ts lib/traffic-funnel.ts lib/traffic-funnel.test.ts lib/traffic-overview.ts app/admin/traffic/page.tsx components/admin/traffic-overview.tsx components/admin/traffic-overview.test.tsx components/admin/traffic-funnel.tsx components/admin/traffic-table.tsx
git commit -m "Count sales per source on the traffic dashboard

Orders bucket the way views do — campaign slug, else a folded source, else
referrer — so the Bought step is a real number under a source filter and
the per-source split shows sales beside views.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Docs, the lesson, and the full suite

**Files:**
- Modify: `docs/products-and-offers.md` (a short section)
- Modify: `docs/lessons.md` (one entry)
- Modify: `docs/going-live.md` only if it has a deploy checklist listing migrations (add 0079 to it); skip otherwise

- [ ] **Step 1: Where labels are written**

Append to `docs/products-and-offers.md`:

```markdown
## Where an order's campaign comes from

Every order carries `utm_first`, `utm_last` and `referrer` (migration 0079),
snapshotted at creation from the `gi_utm` cookie the proxy maintains. The
product checkout reads the cookie in its action; the offer checkout stashes
the labels in the intent's metadata at start and reads them back at
completion, because completion also runs from the Stripe webhook; a renewal
copies them from the origin order. `lib/attribution.ts` is the one place the
rules live — seven keys, `@` refused, 120 characters. The same helper turns
them into Stripe metadata (`utm_*`, `first_utm_*`, `referrer`) on every
intent, subscription and charge, and `buyerContextFor` carries them onto
every ad event. The Orders page shows them; the traffic dashboard buckets
them with `sourceOfOrder` so a campaign's views and sales share a row.
```

- [ ] **Step 2: The lesson**

Append to `docs/lessons.md`:

```markdown
**2026-09-11 — attribution was gated on consent, and 8 of 13 sales read as organic.**
The visitor row holds click ids, IP and user agent, so it is rightly
consent-gated. The campaign labels were stored on the same row, so they were
gated too — and most buyers never accept the banner. The labels describe the
ad, not the person; they now ride a first-party cookie from the proxy and are
snapshotted onto the order for everyone. Rule: decide what needs consent per
FIELD, not per table. And the offer checkout's order is created in a function
the webhook also calls — anything that must reach that insert goes through
the intent's metadata, never a cookie. (`lib/attribution.test.ts`,
`lib/offer-checkout-complete.integration.test.ts`)
```

- [ ] **Step 3: The full suite, gated on the exit status**

Run: `npx tsc --noEmit && npx vitest run; echo "exit=$?"`
Expected: `exit=0`, every file green.

- [ ] **Step 4: Commit**

```bash
git add docs/products-and-offers.md docs/lessons.md
git commit -m "Document where an order's campaign comes from, and the consent-per-field lesson

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Deploy order (for the controller, after the final review)

1. Stage `supabase/migrations/0079_orders_attribution.sql` for the owner and apply it to production by hand (reads pass the classifier, writes do not — hand over the one-line `docker exec … psql < file` command). Confirm with `select column_name from information_schema.columns where table_name='orders' and column_name in ('utm_first','utm_last','referrer');`.
2. `notify pgrst, 'reload schema';`
3. Send the 60-second deploy notice, wait the full 60 seconds, push `main`.
4. `gh run list --branch main --limit 1` until green; confirm the container tag.
5. Open `/admin/orders` and `/admin/traffic` on production. Place nothing; just read.
6. Tell the ads team: their template already carries `utm_source`, `utm_medium`, `utm_campaign`, `utm_adset`, `utm_content`; Meta appends `utm_id` and `utm_term`; all seven now reach Stripe as `utm_*` (last click) and `first_utm_*` (first click) with `referrer`. In GA4 they should register custom dimensions for `adset`, `first_source`, `first_medium`, `first_campaign`, `referrer` if they want them in reports. Some of their ads send the campaign name double-encoded (`%257C`), which splits one campaign into two buckets on the traffic page — worth fixing in the ad, not here.
