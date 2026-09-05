# Traffic funnel per product — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin/traffic` from a flat list of paths into a funnel per product — sales page → checkout → upsell → bought — with a daily series and a source split, so `/checkout` stops being one anonymous row for the whole catalogue.

**Architecture:** `page_counts` gains a `product` column that joins its primary key, and the four counted pages each supply the slug they are about. One query pulls the whole window's rows; a pure module (`lib/traffic-funnel.ts`, no `server-only`) assembles them into funnels, sparkline geometry and an "other pages" remainder; the page and components render that. Every number on the page comes from `page_counts` except the last funnel step, which comes from `orders`.

**Tech Stack:** Next.js 15 App Router server components, Supabase (Postgres 15) via `createServiceClient`, vitest (unit + jsdom component + self-skipping `*.integration.test.ts`), Tailwind classes already used across `/admin`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-05-traffic-funnel-design.md`

## Global Constraints

- The new column is `product text not null default ''`. **Never nullable** — it joins the primary key and Postgres rejects NULL there. Empty string means "this page is not about one product".
- The primary key becomes `(store_id, day, path, source, product)` and `bump_page_count` takes a fifth argument `p_product text`.
- `/checkout` writes **`product.slug` from the row it already resolved**, never the raw `?product=` query value. The raw value is attacker-controlled and would let anyone add rows.
- `page_counts` stores **no identifier**. No cookie, no IP, no user agent, no visitor id. `product` is a catalogue slug, never a person. Any change that adds an identifying column is a change of kind, not degree.
- The counter is **never awaited** on a page and **never throws**. A count is worth less than a page load.
- **No charting library.** Hand-rolled inline SVG. The chart renders server-side with the rest of the page.
- Ranges are 7, 30 and 90 days. Default 30.
- The page must state, visibly and not in a footnote, that the first three funnel steps are **views, not people**, so the ratios are directional.
- `lib/traffic.ts` starts with `import "server-only"`. Any module a jsdom component test imports must **not** import it at runtime — types only, or live in `lib/traffic-funnel.ts`.
- Integration tests self-skip on `!process.env.SUPABASE_SERVICE_ROLE_KEY` (`describe.skipIf`). Never guard on a URL or a hostname.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0068_page_counts_product.sql` (create) | Adds `product`, rebuilds the primary key, replaces `bump_page_count` with the five-argument version and drops the four-argument one. |
| `lib/traffic.ts` (modify) | Everything that touches the database: the counter, the window query, the paid-order query, the product-name query. `server-only`. |
| `lib/traffic-funnel.ts` (create) | Pure assembly and geometry: types, `buildFunnels`, `daysInRange`, `sparklinePath`, `rangeFrom`. No I/O, no `server-only`, safe to import from a jsdom test. |
| `components/admin/traffic-funnel.tsx` (create) | The funnel card, the sparkline, the range tabs, the other-pages list. Presentational. |
| `components/admin/traffic-table.tsx` (modify) | Loses `TrafficTable` (replaced by the other-pages list); keeps `CoverageNote`. |
| `app/admin/traffic/page.tsx` (modify) | Reads the range off the URL, fetches, assembles, renders. |
| `app/(store)/p/[slug]/page.tsx`, `app/(store)/o/[key]/page.tsx`, `app/(store)/checkout/page.tsx`, `app/(store)/checkout/oto/page.tsx` (modify) | Each supplies the product its view is about. |

---

## Task 1: The column, the key, and the fifth argument

**Files:**
- Create: `supabase/migrations/0068_page_counts_product.sql`
- Modify: `lib/traffic.ts` (the `bumpPageCountOrThrow` and `recordPageHit` signatures)
- Test: `lib/traffic.integration.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `bumpPageCountOrThrow(path: string, source: string, product?: string): Promise<void>` — `product` defaults to `""`.
  - `recordPageHit(path: string, product?: string): Promise<void>` — `product` defaults to `""`.
  - SQL function `bump_page_count(p_store uuid, p_day date, p_path text, p_source text, p_product text)`.

**The trap this task exists to avoid:** `create or replace function` with a **different argument count creates a second, overloaded function** rather than replacing the first. Leaving the four-argument version behind means a stale call keeps silently writing rows with no product. The migration drops it explicitly.

- [ ] **Step 1: Write the failing test**

Add these two cases to `lib/traffic.integration.test.ts`, inside the existing `describe.skipIf(!canRun)("counting page views (integration)")` block. They read through `trafficByPage`, which is what exists today — Task 3 renames it to `pageCountsSince` and updates these two lines with it.

```ts
  it("keeps two products' checkouts apart", async () => {
    // The whole reason for the column. Before it, both of these were the row
    // "/checkout" and there was no way to know whose checkout it was.
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    await bumpPageCountOrThrow("/checkout", "meta", "carousels");
    const rows = (await trafficByPage(7)).filter((r) => r.path === "/checkout");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.product).sort()).toEqual(["carousels", "validator"]);
  });

  it("still increments now the key has five columns", async () => {
    // The upsert has to conflict on the new key too. If the migration added
    // the column without rebuilding the primary key, this inserts duplicates.
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    const rows = (await trafficByPage(7)).filter((r) => r.path === "/checkout");
    expect(rows).toHaveLength(1);
    expect(rows[0].hits).toBe(2);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/traffic.integration.test.ts`
Expected: FAIL — "keeps two products' checkouts apart" gets 1 row, because without the column both writes collide on `(store_id, day, path, source)`.

If every test in the file is SKIPPED, `SUPABASE_SERVICE_ROLE_KEY` is not set in your shell. Load the local env (`set -a; source .env.local; set +a`) and run again; do not proceed on a skipped suite.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0068_page_counts_product.sql`:

```sql
-- Which product a counted view was about.
--
-- Without it "/checkout" is one row for the whole catalogue: the query string
-- is stripped before the path is stored (deliberately — ?fbclid=… would make
-- every row unique), so a checkout for the validator and one for the carousels
-- guide were the same line and there was no way to tell them apart.
--
-- Not nullable, defaulting to the empty string. It has to join the primary
-- key, and Postgres will not accept a NULL in one — a nullable column here is
-- not a stricter version of this, it is a version that does not run. Empty
-- string means "this page is not about one product".
--
-- Still no identifier. A slug names a thing in the catalogue, not a person,
-- so what makes this table safe to count everyone with is unchanged.
alter table page_counts add column if not exists product text not null default '';

-- Rebuild the key so the upsert conflicts on the product too. Without this the
-- column exists and every write for a given path/source collides on the old
-- key, which looks like the feature working while it silently merges products.
alter table page_counts drop constraint if exists page_counts_pkey;
alter table page_counts add primary key (store_id, day, path, source, product);

create or replace function bump_page_count(
  p_store uuid, p_day date, p_path text, p_source text, p_product text
) returns void language sql as $$
  insert into page_counts (store_id, day, path, source, product, hits)
  values (p_store, p_day, p_path, p_source, p_product, 1)
  on conflict (store_id, day, path, source, product)
  do update set hits = page_counts.hits + 1;
$$;

-- `create or replace` with a different argument count OVERLOADS rather than
-- replaces, so the four-argument version is still here and still callable.
-- Left in place it would keep writing product-less rows from any stale caller,
-- and PostgREST would resolve to it happily. Drop it by its exact signature.
drop function if exists bump_page_count(uuid, date, text, text);
```

- [ ] **Step 4: Apply the migration locally**

Run: `npx supabase db reset`
Expected: every migration applies, including `0068_page_counts_product.sql`, with no error.

`db reset` rebuilds from seed. This is the supported way to pick up a new migration here — the integration tests depend on the seed fixtures, so a partial apply leaves them failing for unrelated reasons.

- [ ] **Step 5: Widen the two functions**

In `lib/traffic.ts`, change `bumpPageCountOrThrow` and `recordPageHit` to carry a product. Replace both function bodies with:

```ts
export async function bumpPageCountOrThrow(
  path: string,
  source: string,
  product = "",
): Promise<void> {
  const db = createServiceClient();
  await db.rpc("bump_page_count", {
    p_store: await getStoreId(),
    p_day: new Date().toISOString().slice(0, 10),
    p_path: path,
    p_source: source,
    p_product: product,
  });
}

/**
 * Count this view, from whatever the request happens to say.
 *
 * `product` is the slug this view was about, and it is the caller's job
 * because only the caller knows: the sales pages have it in their path, the
 * checkout has resolved it to a real row before it renders, and everything
 * else has none. It defaults to "" so a page with no product does not have to
 * say so.
 *
 * Never awaited by its callers and never throws, so a slow database or a
 * failed write cannot delay a page or break one.
 */
export async function recordPageHit(path: string, product = ""): Promise<void> {
  try {
    const h = await headers();
    if (isBot(h.get("user-agent"))) return;
    await bumpPageCountOrThrow(
      path,
      sourceOf(h.get("x-search") ?? "", h.get("referer")),
      product,
    );
  } catch {
    // Deliberately silent. See the note at the top of this file.
  }
}
```

Also add `product` to the row type and to the select in `trafficByPage`, so the new column is readable:

```ts
export type TrafficRow = { path: string; source: string; product: string; hits: number };
```

and in `trafficByPage`, change `.select("path, source, hits")` to `.select("path, source, product, hits")`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/traffic.integration.test.ts`
Expected: PASS, all cases, none skipped.

- [ ] **Step 7: Run the whole suite**

Run: `npx vitest run`
Expected: PASS. `lib/traffic-wiring.test.ts` and `components/admin/traffic-table.test.tsx` still pass — the new argument is optional, so nothing that called the old shape breaks.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0068_page_counts_product.sql lib/traffic.ts lib/traffic.integration.test.ts
git commit -m "Count which product a view was about"
```

---

## Task 2: Each page says which product it is about

**Files:**
- Modify: `app/(store)/p/[slug]/page.tsx:72`
- Modify: `app/(store)/o/[key]/page.tsx:84`
- Modify: `app/(store)/checkout/page.tsx:112`
- Modify: `app/(store)/checkout/oto/page.tsx:46`
- Modify: `lib/traffic.ts` (adds `recordOtoPageHit`)
- Test: `lib/traffic-wiring.test.ts`

**Interfaces:**
- Consumes: `recordPageHit(path: string, product?: string): Promise<void>` from Task 1.
- Produces: `recordOtoPageHit(orderId: string): Promise<void>` — counts `/checkout/oto` under the product the order was for. Never throws.

**Why the upsell needs its own function:** the upsell's product is not on the request. It is behind the order the signed token names, so it takes a query. Doing that query on the page would mean awaiting a lookup before the page renders, which is exactly what the "never delay a page for a count" rule forbids. Wrapping it keeps the page's call fire-and-forget.

**A note on `/o/<key>`:** an offer key is not a product slug, and offers have no row in `products`. Writing the key here follows the spec and makes part 2 easy, but it means offer pages appear in the "other pages" list rather than as funnel cards — Task 4 only builds a card for a slug that exists in `products`. That is deliberate: the spec's funnel starts at `/p/<slug>`.

- [ ] **Step 1: Write the failing test**

Replace the whole of `lib/traffic-wiring.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The four funnel pages each count their own view, under the product it was
 * about.
 *
 * A source-reading test because the alternative is rendering four server
 * components against a database, and the failures this catches are a call
 * being deleted, an await creeping in, and — the new one — a page counting
 * itself with no product, which would put it back in the anonymous
 * "/checkout" bucket this whole change exists to get rid of.
 *
 * It does NOT catch a fifth page added later — that page would have to be
 * added to PAGES too. Discovering funnel pages automatically would mean
 * listing every store page that is deliberately not counted, and that list
 * rots the same way this one does.
 */
const PAGES = [
  // file, the call it must make, the product expression it must pass
  ["app/(store)/p/[slug]/page.tsx", "recordPageHit", "slug"],
  ["app/(store)/o/[key]/page.tsx", "recordPageHit", "key"],
  ["app/(store)/checkout/page.tsx", "recordPageHit", "product.slug"],
  ["app/(store)/checkout/oto/page.tsx", "recordOtoPageHit", "verified.payload.orderId"],
] as const;

describe("the funnel pages count their own views", () => {
  for (const [file, call, arg] of PAGES) {
    it(`${file} records a hit naming ${arg}`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain(`${call}(`);
      expect(src).toContain(arg);
    });

    it(`${file} does not await it`, () => {
      // Awaiting would put a database write in front of the page. A count is
      // worth less than a page load, so it is fired and forgotten.
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(new RegExp(`await\\s+${call}`));
      expect(src).toMatch(new RegExp(`void\\s+${call}`));
    });
  }

  it("the checkout counts the product it resolved, not the query it was given", () => {
    // ?product= is whatever the visitor typed. Counting it would let anyone
    // add rows to the table by loading /checkout with invented slugs, and the
    // funnel would fill with products that do not exist.
    const src = readFileSync("app/(store)/checkout/page.tsx", "utf8");
    expect(src).toMatch(/recordPageHit\("\/checkout",\s*product\.slug\)/);
    expect(src).not.toMatch(/recordPageHit\("\/checkout",\s*slug\)/);
  });

  it("middleware forwards the query the counter reads", () => {
    // Without this every visit buckets as direct: two of the four pages do
    // not receive searchParams, so the header is the only way the source is
    // knowable. It would fail silently — the counts would look fine and every
    // ad click would be filed as direct traffic.
    expect(readFileSync("middleware.ts", "utf8")).toContain(
      'withPath.set("x-search", req.nextUrl.search.slice(0, 2048))',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/traffic-wiring.test.ts`
Expected: FAIL — the oto page has no `recordOtoPageHit`, and the checkout does not yet pass `product.slug`.

- [ ] **Step 3: Add the upsell's counter**

Append to `lib/traffic.ts`, after `recordPageHit`:

```ts
/**
 * The base product an order was for.
 *
 * Two queries rather than a PostgREST embed: the embed's shape depends on how
 * the relationship is detected, and this runs behind a fire-and-forget count
 * where a silently-wrong shape would never surface. `kind = 'product'` is the
 * base row — a bump or an accepted upsell is an offer, not what was bought
 * first.
 */
async function orderProductSlug(orderId: string): Promise<string> {
  const db = createServiceClient();
  const { data: items } = await db
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId)
    .eq("kind", "product")
    .not("product_id", "is", null)
    .limit(1);
  const productId = items?.[0]?.product_id as string | undefined;
  if (!productId) return "";
  const { data: product } = await db
    .from("products")
    .select("slug")
    .eq("id", productId)
    .maybeSingle();
  return (product?.slug as string) ?? "";
}

/**
 * The upsell's own view, filed under the product the order was for.
 *
 * The slug is not on the request — it is behind the order the signed token
 * names — so the lookup happens here rather than on the page, which would
 * have to await it before rendering. Wrapped so the page can still fire and
 * forget: a count must not put a query in front of an upsell.
 */
export async function recordOtoPageHit(orderId: string): Promise<void> {
  try {
    await recordPageHit("/checkout/oto", await orderProductSlug(orderId));
  } catch {
    // Deliberately silent, like everything else in this file.
  }
}
```

- [ ] **Step 4: Point the four pages at it**

`app/(store)/p/[slug]/page.tsx` line 72 — change:

```ts
  void recordPageHit(`/p/${slug}`, slug);
```

`app/(store)/o/[key]/page.tsx` line 84 — change:

```ts
  void recordPageHit(`/o/${key}`, key);
```

`app/(store)/checkout/page.tsx` line 112 — change:

```ts
  // The RESOLVED product, never the ?product= it was given: that value is
  // whatever the visitor typed, and counting it would let anyone add rows.
  void recordPageHit("/checkout", product.slug);
```

`app/(store)/checkout/oto/page.tsx` — change the import on line 18:

```ts
import { recordOtoPageHit } from "@/lib/traffic";
```

and line 46:

```ts
  void recordOtoPageHit(verified.payload.orderId);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/traffic-wiring.test.ts`
Expected: PASS, 10 cases.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/traffic.ts lib/traffic-wiring.test.ts "app/(store)"
git commit -m "Let each counted page say which product it was about"
```

---

## Task 3: The three queries the page needs

**Files:**
- Modify: `lib/traffic.ts`
- Modify: `app/admin/traffic/page.tsx` (only to keep it compiling against the renamed function)
- Test: `lib/traffic.integration.test.ts`

**Interfaces:**
- Consumes: `bumpPageCountOrThrow(path, source, product?)` from Task 1.
- Produces:
  - `pageCountsSince(days: number): Promise<CountRow[]>` where `CountRow = { day: string; path: string; source: string; product: string; hits: number }` — every row in the window, one query. Returns `[]` rather than throwing.
  - `paidByProduct(days: number): Promise<BoughtRow[]>` where `BoughtRow = { product: string; orders: number }` — distinct paid live orders per product slug. Returns `[]` rather than throwing.
  - `productNames(): Promise<ProductName[]>` where `ProductName = { slug: string; title: string }` — every product in the store, published or not. Returns `[]` rather than throwing.
  - `consentedVisitorCount(days: number): Promise<number>` — unchanged, still exported.
  - `TrafficRow` and `trafficByPage` are **removed**; `pageCountsSince` replaces them.

**Why one query and not three views:** the window is at most 90 days of a few dozen rows a day. Pulling all of it once and shaping it in memory is smaller, cheaper to test, and means the funnel, the sparkline, the source split and the other-pages list cannot disagree with each other about what the window contained.

**Why `productNames` returns unpublished products too:** a product that sold and was then unpublished still has orders and still belongs in the funnel. Hiding it would make the page's totals disagree with the orders page.

- [ ] **Step 1: Write the failing test**

Replace `lib/traffic.integration.test.ts` entirely with:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { bumpPageCountOrThrow, pageCountsSince, paidByProduct, productNames } from "@/lib/traffic";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!canRun)("counting page views (integration)", () => {
  beforeEach(async () => {
    const db = createServiceClient();
    await db.from("page_counts").delete().eq("store_id", await getStoreId());
  });

  it("counts a view", async () => {
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    const rows = await pageCountsSince(7);
    expect(rows).toContainEqual(
      expect.objectContaining({ path: "/p/thing", source: "meta", product: "thing", hits: 1 }),
    );
  });

  it("increments rather than adding a second row", async () => {
    // The whole point of doing it in one statement: a read-then-write would
    // lose one of two visitors arriving together.
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    const rows = (await pageCountsSince(7)).filter((r) => r.path === "/p/thing");
    expect(rows).toHaveLength(1);
    expect(rows[0].hits).toBe(3);
  });

  it("keeps sources apart on the same page", async () => {
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    await bumpPageCountOrThrow("/p/thing", "direct", "thing");
    const rows = (await pageCountsSince(7)).filter((r) => r.path === "/p/thing");
    expect(rows).toHaveLength(2);
  });

  it("keeps two products' checkouts apart", async () => {
    // The reason the column exists. Before it, both of these were the row
    // "/checkout" and there was no way to know whose checkout it was.
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    await bumpPageCountOrThrow("/checkout", "meta", "carousels");
    const rows = (await pageCountsSince(7)).filter((r) => r.path === "/checkout");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.product).sort()).toEqual(["carousels", "validator"]);
  });

  it("still increments now the key has five columns", async () => {
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    const rows = (await pageCountsSince(7)).filter((r) => r.path === "/checkout");
    expect(rows).toHaveLength(1);
    expect(rows[0].hits).toBe(2);
  });

  it("returns nothing rather than throwing when there is no traffic", async () => {
    expect(await pageCountsSince(7)).toEqual([]);
  });

  it("names the store's products", async () => {
    const names = await productNames();
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      expect(typeof n.slug).toBe("string");
      expect(typeof n.title).toBe("string");
    }
  });

  it("counts orders per product without throwing", async () => {
    // Asserting the SHAPE, not a figure: the seed's order set is not this
    // test's to pin down, and a test that hard-codes it fails the next time
    // somebody adds a fixture.
    const bought = await paidByProduct(90);
    expect(Array.isArray(bought)).toBe(true);
    for (const b of bought) {
      expect(typeof b.product).toBe("string");
      expect(b.orders).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/traffic.integration.test.ts`
Expected: FAIL at import — `pageCountsSince`, `paidByProduct` and `productNames` are not exported from `@/lib/traffic`.

- [ ] **Step 3: Write the queries**

In `lib/traffic.ts`, delete the `TrafficRow` type and the whole `trafficByPage` function, and add in their place:

```ts
export type CountRow = {
  day: string;
  path: string;
  source: string;
  product: string;
  hits: number;
};
export type BoughtRow = { product: string; orders: number };
export type ProductName = { slug: string; title: string };

/** An ISO date `days` days ago, which is how `page_counts.day` is keyed. */
function sinceDay(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Every counted row in the window, in one query.
 *
 * The funnel, the daily series, the source split and the other-pages list are
 * all shaped from this same list rather than from a query each. At a few dozen
 * rows a day over at most ninety days that is a small read, and it means those
 * four things cannot disagree with each other about what the window held.
 */
export async function pageCountsSince(days: number): Promise<CountRow[]> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("page_counts")
      .select("day, path, source, product, hits")
      .eq("store_id", await getStoreId())
      .gte("day", sinceDay(days))
      .order("day", { ascending: true });
    return (data ?? []) as CountRow[];
  } catch {
    return [];
  }
}

/**
 * How many real orders each product took in the window.
 *
 * The funnel's last step, and the only step that is people rather than views:
 * it comes from the ledger, so the bottom of the funnel reconciles with
 * revenue. Test-mode rows are excluded — two of them are sitting in production
 * and counting them would overstate a launch by a third.
 *
 * Three small queries instead of one embedded join: order volume is tiny, and
 * a PostgREST embed's shape here would be a silent wrong answer rather than an
 * error if the relationship were detected differently.
 */
export async function paidByProduct(days: number): Promise<BoughtRow[]> {
  try {
    const db = createServiceClient();
    const store = await getStoreId();
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data: orders } = await db
      .from("orders")
      .select("id")
      .eq("store_id", store)
      .eq("status", "paid")
      .eq("livemode", true)
      .gte("created_at", since);
    const ids = (orders ?? []).map((o) => o.id as string);
    if (ids.length === 0) return [];

    const { data: items } = await db
      .from("order_items")
      .select("order_id, product_id")
      .in("order_id", ids)
      .eq("kind", "product")
      .not("product_id", "is", null);

    const { data: products } = await db
      .from("products")
      .select("id, slug")
      .eq("store_id", store);
    const slugOf = new Map((products ?? []).map((p) => [p.id as string, p.slug as string]));

    // Distinct ORDERS per product: an order with two rows for the same product
    // is one sale, and counting rows would inflate the step it feeds.
    const seen = new Map<string, Set<string>>();
    for (const i of items ?? []) {
      const slug = slugOf.get(i.product_id as string);
      if (!slug) continue;
      const set = seen.get(slug) ?? new Set<string>();
      set.add(i.order_id as string);
      seen.set(slug, set);
    }
    return [...seen.entries()].map(([product, set]) => ({ product, orders: set.size }));
  } catch {
    return [];
  }
}

/**
 * Every product in the catalogue, published or not.
 *
 * Unpublished ones are included on purpose: a product that sold and was then
 * taken down still has orders, and dropping it would make this page's numbers
 * disagree with the orders page.
 */
export async function productNames(): Promise<ProductName[]> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("products")
      .select("slug, title")
      .eq("store_id", await getStoreId());
    return (data ?? []) as ProductName[];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Keep the existing admin page compiling**

`app/admin/traffic/page.tsx` still imports `trafficByPage`, and `components/admin/traffic-table.tsx` still imports the `TrafficRow` type. Task 5 rewrites both. For now, make the page compile against the new shape by replacing its whole body with:

```tsx
import { pageCountsSince, consentedVisitorCount } from "@/lib/traffic";
import { CoverageNote } from "@/components/admin/traffic-table";

export const dynamic = "force-dynamic";

export default async function AdminTrafficPage() {
  const [rows, consented] = await Promise.all([pageCountsSince(30), consentedVisitorCount(30)]);
  const counted = rows.reduce((n, r) => n + r.hits, 0);
  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">Traffic</h1>
        <p className="text-muted">
          Every view of the last 30 days, counted on the server — including the visitors your
          pixel and GA4 never see. Expect these numbers to read higher than theirs.
        </p>
      </div>
      <CoverageNote counted={counted} consented={consented} />
    </div>
  );
}
```

Then, in `components/admin/traffic-table.tsx`, delete the `import type { TrafficRow } ...` line and the entire `TrafficTable` function, leaving only `CoverageNote` and its doc comment. In `components/admin/traffic-table.test.tsx`, delete the `TrafficTable` import and the whole `describe("the traffic table", …)` block, leaving the `CoverageNote` describe block untouched.

The page is deliberately thin for one commit. Task 5 gives it the funnel.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/traffic.integration.test.ts components/admin/traffic-table.test.tsx`
Expected: PASS, nothing skipped in the integration file.

- [ ] **Step 6: Typecheck and run the whole suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; the suite passes.

- [ ] **Step 7: Commit**

```bash
git add lib/traffic.ts lib/traffic.integration.test.ts app/admin/traffic/page.tsx components/admin/traffic-table.tsx components/admin/traffic-table.test.tsx
git commit -m "Read the whole traffic window, and the orders under it, in one place"
```

---

## Task 4: Building the funnel, in a module that touches nothing

**Files:**
- Create: `lib/traffic-funnel.ts`
- Test: `lib/traffic-funnel.test.ts`

**Interfaces:**
- Consumes: the row types from Task 3 — `CountRow`, `BoughtRow`, `ProductName` — but **re-declares them here** rather than importing from `lib/traffic.ts`. That file begins `import "server-only"`, and a jsdom component test that imports this module would throw. Task 5's components import their types from here. `lib/traffic.ts` keeps its own copies; they are five-field record types and duplicating them is cheaper than the import cycle.
- Produces:
  - `type CountRow = { day: string; path: string; source: string; product: string; hits: number }`
  - `type BoughtRow = { product: string; orders: number }`
  - `type ProductName = { slug: string; title: string }`
  - `type SourceSplit = { source: string; hits: number }`
  - `type DayPoint = { day: string; hits: number }`
  - `type ProductFunnel = { slug: string; title: string; steps: FunnelStep[]; sources: SourceSplit[]; daily: DayPoint[]; salesViews: number }`
  - `type FunnelStep = { label: string; count: number }`
  - `type OtherPage = { path: string; hits: number; sources: SourceSplit[] }`
  - `type FunnelView = { products: ProductFunnel[]; others: OtherPage[]; counted: number }`
  - `buildFunnels(counts: CountRow[], bought: BoughtRow[], names: ProductName[], days: string[]): FunnelView`
  - `daysInRange(days: number, today: string): string[]`
  - `sparklinePath(daily: DayPoint[], width: number, height: number): string | null`
  - `rangeFrom(params: Record<string, string | string[] | undefined>): 7 | 30 | 90`

**The rules this module encodes:**

- A funnel card exists for a slug **only if that slug is in `names`** — a real product. That is what keeps offer keys (written by `/o/<key>` in Task 2) and slugs of deleted products out of the funnel; they fall through to `others`.
- A card renders even with zero everywhere as long as it had views or orders. A product with views and no orders is a real, useful answer, not an empty state.
- Every row that no funnel consumed goes to `others`, grouped by path. That deliberately includes historic `/checkout` rows written before Task 1, which carry `product: ""` — they are real views and hiding them would make the totals lie.
- `daily` is dense over the whole range, zeros included. A line that skips quiet days draws a plateau where there was a gap.
- `sparklinePath` returns `null` when fewer than two days have any hits, so a single point is never drawn as a trend.

- [ ] **Step 1: Write the failing test**

Create `lib/traffic-funnel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildFunnels,
  daysInRange,
  sparklinePath,
  rangeFrom,
  type CountRow,
} from "@/lib/traffic-funnel";

const NAMES = [
  { slug: "validator", title: "Product Validator" },
  { slug: "carousels", title: "Viral Carousels" },
];
const DAYS = ["2026-09-03", "2026-09-04", "2026-09-05"];

function row(p: Partial<CountRow>): CountRow {
  return { day: "2026-09-05", path: "/p/validator", source: "direct", product: "validator", hits: 1, ...p };
}

describe("building the funnel", () => {
  it("walks a product through all four steps", () => {
    const view = buildFunnels(
      [
        row({ path: "/p/validator", hits: 100 }),
        row({ path: "/checkout", hits: 30 }),
        row({ path: "/checkout/oto", hits: 12 }),
      ],
      [{ product: "validator", orders: 9 }],
      NAMES,
      DAYS,
    );
    expect(view.products).toHaveLength(1);
    expect(view.products[0].steps.map((s) => s.count)).toEqual([100, 30, 12, 9]);
    expect(view.products[0].title).toBe("Product Validator");
  });

  it("renders a gap in the middle as a zero, not a missing step", () => {
    // Somebody linking straight to the checkout produces exactly this. A step
    // that disappears would make the funnel look like it has three stages.
    const view = buildFunnels(
      [row({ path: "/p/validator", hits: 40 }), row({ path: "/checkout/oto", hits: 3 })],
      [],
      NAMES,
      DAYS,
    );
    expect(view.products[0].steps.map((s) => s.count)).toEqual([40, 0, 3, 0]);
  });

  it("keeps a product that sold without a single counted view", () => {
    // A direct link, or a sale that predates the counter. Dropping it would
    // hide revenue.
    const view = buildFunnels([], [{ product: "carousels", orders: 2 }], NAMES, DAYS);
    expect(view.products.map((p) => p.slug)).toEqual(["carousels"]);
    expect(view.products[0].steps[3].count).toBe(2);
  });

  it("shows nothing for a product with neither views nor orders", () => {
    expect(buildFunnels([], [], NAMES, DAYS).products).toEqual([]);
  });

  it("sorts products by sales-page views, busiest first", () => {
    const view = buildFunnels(
      [
        row({ path: "/p/validator", product: "validator", hits: 10 }),
        row({ path: "/p/carousels", product: "carousels", hits: 90 }),
      ],
      [],
      NAMES,
      DAYS,
    );
    expect(view.products.map((p) => p.slug)).toEqual(["carousels", "validator"]);
  });

  it("keeps an offer page out of the funnel and in the other-pages list", () => {
    // /o/<key> writes its key as the product, but an offer key is not a
    // product slug and has no row in products. It must not invent a card.
    const view = buildFunnels(
      [row({ path: "/o/funnel-app", product: "funnel-app", hits: 7 })],
      [],
      NAMES,
      DAYS,
    );
    expect(view.products).toEqual([]);
    expect(view.others).toEqual([
      { path: "/o/funnel-app", hits: 7, sources: [{ source: "direct", hits: 7 }] },
    ]);
  });

  it("keeps the checkout rows counted before the product column existed", () => {
    // They carry product "" and belong to no funnel. They are still real
    // views; dropping them would make the page's total disagree with itself.
    const view = buildFunnels([row({ path: "/checkout", product: "", hits: 4 })], [], NAMES, DAYS);
    expect(view.products).toEqual([]);
    expect(view.others[0]).toMatchObject({ path: "/checkout", hits: 4 });
  });

  it("splits the sales page by source, busiest first", () => {
    const view = buildFunnels(
      [
        row({ source: "direct", hits: 20 }),
        row({ source: "meta", hits: 80 }),
      ],
      [],
      NAMES,
      DAYS,
    );
    expect(view.products[0].sources).toEqual([
      { source: "meta", hits: 80 },
      { source: "direct", hits: 20 },
    ]);
  });

  it("gives a dense daily series with the quiet days as zeros", () => {
    const view = buildFunnels(
      [row({ day: "2026-09-03", hits: 5 }), row({ day: "2026-09-05", hits: 7 })],
      [],
      NAMES,
      DAYS,
    );
    expect(view.products[0].daily).toEqual([
      { day: "2026-09-03", hits: 5 },
      { day: "2026-09-04", hits: 0 },
      { day: "2026-09-05", hits: 7 },
    ]);
  });

  it("totals every counted view, funnel or not", () => {
    const view = buildFunnels(
      [row({ hits: 10 }), row({ path: "/o/thing", product: "thing", hits: 3 })],
      [],
      NAMES,
      DAYS,
    );
    expect(view.counted).toBe(13);
  });
});

describe("the days in a range", () => {
  it("ends on today and runs back the requested number of days", () => {
    const days = daysInRange(3, "2026-09-05");
    expect(days).toEqual(["2026-09-03", "2026-09-04", "2026-09-05"]);
  });

  it("crosses a month boundary", () => {
    expect(daysInRange(2, "2026-09-01")).toEqual(["2026-08-31", "2026-09-01"]);
  });
});

describe("the sparkline", () => {
  it("draws nothing from a single day of data", () => {
    // One point is not a trend, and a line drawn through it says one anyway.
    expect(sparklinePath([{ day: "a", hits: 5 }, { day: "b", hits: 0 }], 100, 20)).toBeNull();
  });

  it("draws nothing from no data at all", () => {
    expect(sparklinePath([], 100, 20)).toBeNull();
  });

  it("spans the full width and puts the peak on the top edge", () => {
    const d = sparklinePath(
      [{ day: "a", hits: 0 }, { day: "b", hits: 10 }, { day: "c", hits: 5 }],
      100,
      20,
    );
    expect(d).toBe("0,20 50,0 100,10");
  });

  it("draws an unchanging week as a flat line along its own peak", () => {
    // Normalised against the peak, as every sparkline is: the shape is what
    // it says, never the magnitude. Two flat weeks at 4 and at 400 a day draw
    // the same line, which is why the number beside it is not optional.
    const d = sparklinePath(
      [{ day: "a", hits: 4 }, { day: "b", hits: 4 }],
      100,
      20,
    );
    expect(d).toBe("0,0 100,0");
  });
});

describe("the range on the url", () => {
  it("defaults to thirty days", () => {
    expect(rangeFrom({})).toBe(30);
  });

  it("takes one it recognises", () => {
    expect(rangeFrom({ range: "7" })).toBe(7);
    expect(rangeFrom({ range: "90" })).toBe(90);
  });

  it("refuses anything else", () => {
    // The value reaches a query. Anything not on the list is not a range.
    expect(rangeFrom({ range: "3650" })).toBe(30);
    expect(rangeFrom({ range: ["7", "90"] })).toBe(7);
    expect(rangeFrom({ range: "; drop table" })).toBe(30);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/traffic-funnel.test.ts`
Expected: FAIL — cannot resolve `@/lib/traffic-funnel`.

- [ ] **Step 3: Write the module**

Create `lib/traffic-funnel.ts`:

```ts
/**
 * Turning counted rows into a funnel.
 *
 * Pure input to output: no database, no request, no `server-only`. That is
 * deliberate — `lib/traffic.ts` starts with `import "server-only"` and a jsdom
 * component test that reaches it throws, so the components import their types
 * and their arithmetic from here instead. The row types are declared twice
 * for the same reason; three record types are cheaper than the coupling.
 *
 * The honest limit, which the page must repeat out loud: the first three steps
 * are VIEWS. One person reloading the sales page twice is two of them. The
 * fourth step is orders and is people. So the drop between them is a
 * direction, never a conversion rate.
 */

export type CountRow = {
  day: string;
  path: string;
  source: string;
  product: string;
  hits: number;
};
export type BoughtRow = { product: string; orders: number };
export type ProductName = { slug: string; title: string };

export type SourceSplit = { source: string; hits: number };
export type DayPoint = { day: string; hits: number };
export type FunnelStep = { label: string; count: number };

export type ProductFunnel = {
  slug: string;
  title: string;
  steps: FunnelStep[];
  sources: SourceSplit[];
  daily: DayPoint[];
  /** Sales-page views, which is what the cards are ordered by. */
  salesViews: number;
};

export type OtherPage = { path: string; hits: number; sources: SourceSplit[] };

export type FunnelView = {
  products: ProductFunnel[];
  others: OtherPage[];
  /** Every counted view in the window, funnel or not. */
  counted: number;
};

const STEP_LABELS = ["Saw the sales page", "Reached the checkout", "Saw the upsell", "Bought"];

/** Sorted busiest first, which is the only order anybody reads a split in. */
function splitOf(m: Map<string, number>): SourceSplit[] {
  return [...m.entries()]
    .map(([source, hits]) => ({ source, hits }))
    .sort((a, b) => b.hits - a.hits);
}

function add(m: Map<string, number>, k: string, n: number): void {
  m.set(k, (m.get(k) ?? 0) + n);
}

/**
 * Every product with something to show, and every row that belonged to none.
 *
 * A card exists for a slug only if that slug names a real product. That is
 * what keeps offer keys — `/o/<key>` writes its key as the product — and the
 * slugs of deleted products from inventing funnels; they fall through to
 * `others` with everything else nothing consumed.
 */
export function buildFunnels(
  counts: CountRow[],
  bought: BoughtRow[],
  names: ProductName[],
  days: string[],
): FunnelView {
  const titleOf = new Map(names.map((n) => [n.slug, n.title]));
  const boughtOf = new Map(bought.map((b) => [b.product, b.orders]));

  const sales = new Map<string, number>();
  const checkout = new Map<string, number>();
  const upsell = new Map<string, number>();
  const sources = new Map<string, Map<string, number>>();
  const daily = new Map<string, Map<string, number>>();
  const others = new Map<string, { hits: number; sources: Map<string, number> }>();

  let counted = 0;

  const per = <T>(m: Map<string, T>, k: string, make: () => T): T => {
    const v = m.get(k) ?? make();
    m.set(k, v);
    return v;
  };

  for (const r of counts) {
    counted += r.hits;

    // A sales page names its product in the path; the other two carry it in
    // the column. Either way it only counts if it is a product we have.
    const salesSlug = r.path.startsWith("/p/") ? r.path.slice(3) : null;
    const slug = salesSlug ?? r.product;
    const known = titleOf.has(slug);

    if (known && salesSlug) {
      add(sales, slug, r.hits);
      add(per(sources, slug, () => new Map()), r.source, r.hits);
      add(per(daily, slug, () => new Map()), r.day, r.hits);
      continue;
    }
    if (known && r.path === "/checkout") {
      add(checkout, slug, r.hits);
      continue;
    }
    if (known && r.path === "/checkout/oto") {
      add(upsell, slug, r.hits);
      continue;
    }

    // Nothing claimed it. Offer pages, the store home, a deleted product's
    // page, and the checkout rows counted before the product column existed
    // — all real views, so all shown rather than quietly dropped.
    const o = per(others, r.path, () => ({ hits: 0, sources: new Map<string, number>() }));
    o.hits += r.hits;
    add(o.sources, r.source, r.hits);
  }

  const slugs = new Set<string>([
    ...sales.keys(),
    ...checkout.keys(),
    ...upsell.keys(),
    ...[...boughtOf.keys()].filter((s) => titleOf.has(s)),
  ]);

  const products: ProductFunnel[] = [...slugs]
    .map((slug) => {
      const byDay = daily.get(slug) ?? new Map<string, number>();
      return {
        slug,
        title: titleOf.get(slug) ?? slug,
        steps: [
          sales.get(slug) ?? 0,
          checkout.get(slug) ?? 0,
          upsell.get(slug) ?? 0,
          boughtOf.get(slug) ?? 0,
        ].map((count, i) => ({ label: STEP_LABELS[i], count })),
        sources: splitOf(sources.get(slug) ?? new Map()),
        // Dense: a line that skips the quiet days draws a plateau where there
        // was a gap.
        daily: days.map((day) => ({ day, hits: byDay.get(day) ?? 0 })),
        salesViews: sales.get(slug) ?? 0,
      };
    })
    .sort((a, b) => b.salesViews - a.salesViews || a.slug.localeCompare(b.slug));

  return {
    products,
    others: [...others.entries()]
      .map(([path, o]) => ({ path, hits: o.hits, sources: splitOf(o.sources) }))
      .sort((a, b) => b.hits - a.hits),
    counted,
  };
}

/** Every ISO date in the window, oldest first, ending on `today`. */
export function daysInRange(days: number, today: string): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) =>
    new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

/**
 * The polyline for a sparkline, or nothing.
 *
 * Nothing when fewer than two days carry a hit: one point drawn as a line
 * asserts a trend that a single day cannot support, and an empty chart is a
 * more honest answer than a confident wrong one. That guard is also what makes
 * `peak` safe to divide by — it cannot be zero once two days have hits.
 *
 * Normalised against the peak, so the line describes shape and never
 * magnitude: a flat week at four a day and a flat week at four hundred draw
 * the same line. The figure printed beside it is not decoration.
 */
export function sparklinePath(daily: DayPoint[], width: number, height: number): string | null {
  if (daily.filter((d) => d.hits > 0).length < 2) return null;
  const peak = Math.max(...daily.map((d) => d.hits));
  const step = width / (daily.length - 1);
  return daily
    .map((d, i) => `${Math.round(i * step)},${Math.round(height - (d.hits / peak) * height)}`)
    .join(" ");
}

const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

/**
 * The range off the URL, refusing anything not on the list.
 *
 * It reaches a query, so it is a whitelist rather than a parse: an unbounded
 * number here would be a request for the whole table.
 */
export function rangeFrom(params: Record<string, string | string[] | undefined>): Range {
  const raw = params.range;
  const one = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const n = Number(one);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : 30;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/traffic-funnel.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/traffic-funnel.ts lib/traffic-funnel.test.ts
git commit -m "Assemble a funnel per product from the counted rows"
```

---

## Task 5: The page

**Files:**
- Create: `components/admin/traffic-funnel.tsx`
- Create: `components/admin/traffic-funnel.test.tsx`
- Modify: `app/admin/traffic/page.tsx`

**Interfaces:**
- Consumes: `pageCountsSince`, `paidByProduct`, `productNames`, `consentedVisitorCount` from `lib/traffic.ts` (Task 3); `buildFunnels`, `daysInRange`, `sparklinePath`, `rangeFrom`, and the view types from `lib/traffic-funnel.ts` (Task 4); `CoverageNote` from `components/admin/traffic-table.tsx`.
- Produces: `FunnelCard({ product }: { product: ProductFunnel })`, `Sparkline({ daily }: { daily: DayPoint[] })`, `RangeTabs({ range }: { range: Range })`, `OtherPages({ pages }: { pages: OtherPage[] })`.

**The visual design is not specified here, on purpose.** Prose is a bad medium for it and would produce a worse page than the design skill working against real data. Step 3 is where that happens.

**Non-negotiable content requirements, which the design may not drop:**

1. A product per card, ordered by sales-page views, busiest first.
2. All four steps on every card, including the zeros, with the drop between them legible.
3. The sparkline where `sparklinePath` returns a path; **nothing at all** where it returns `null` — never a placeholder box, never a flat line standing in for absent data.
4. The source split for each product.
5. The other-pages list below the cards, outside the funnel, visibly a different kind of thing.
6. A range control offering 7 / 30 / 90, current one marked, each a **link** — the range lives in the URL so a view can be sent to somebody.
7. **The views-not-people caveat, in the page's own words, above the cards.** Not a tooltip, not a footnote. Somebody will make a spending decision off these ratios.
8. The existing empty state when there is no traffic at all.
9. Server-rendered throughout. No `"use client"`, no chart library, no `useEffect`-fetched data.

- [ ] **Step 1: Write the failing test**

Create `components/admin/traffic-funnel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FunnelCard, Sparkline, RangeTabs, OtherPages } from "@/components/admin/traffic-funnel";
import type { ProductFunnel } from "@/lib/traffic-funnel";

const PRODUCT: ProductFunnel = {
  slug: "validator",
  title: "Product Validator",
  steps: [
    { label: "Saw the sales page", count: 412 },
    { label: "Reached the checkout", count: 88 },
    { label: "Saw the upsell", count: 21 },
    { label: "Bought", count: 19 },
  ],
  sources: [
    { source: "meta", hits: 300 },
    { source: "direct", hits: 112 },
  ],
  daily: [
    { day: "2026-09-03", hits: 100 },
    { day: "2026-09-04", hits: 200 },
    { day: "2026-09-05", hits: 112 },
  ],
  salesViews: 412,
};

describe("a product's funnel card", () => {
  it("names the product and every step", () => {
    const html = renderToStaticMarkup(<FunnelCard product={PRODUCT} />);
    expect(html).toContain("Product Validator");
    expect(html).toContain("412");
    expect(html).toContain("88");
    expect(html).toContain("21");
    expect(html).toContain("19");
  });

  it("shows a zero step rather than hiding it", () => {
    // A product with views and no sales is a real answer. A card that drops
    // the step reads as three stages and hides the thing worth knowing.
    const html = renderToStaticMarkup(
      <FunnelCard
        product={{ ...PRODUCT, steps: PRODUCT.steps.map((s, i) => (i === 3 ? { ...s, count: 0 } : s)) }}
      />,
    );
    expect(html).toContain("Bought");
    expect(html).toMatch(/>0</);
  });

  it("shows where the traffic came from", () => {
    const html = renderToStaticMarkup(<FunnelCard product={PRODUCT} />);
    expect(html).toContain("meta");
    expect(html).toContain("direct");
  });
});

describe("the sparkline", () => {
  it("draws a polyline when there is a trend", () => {
    const html = renderToStaticMarkup(<Sparkline daily={PRODUCT.daily} />);
    expect(html).toContain("<svg");
    expect(html).toContain("<polyline");
  });

  it("draws nothing at all from a single day", () => {
    // Not an empty box, not a flat line — nothing. Either would assert a
    // shape the data does not have.
    const html = renderToStaticMarkup(
      <Sparkline daily={[{ day: "2026-09-05", hits: 9 }, { day: "2026-09-04", hits: 0 }]} />,
    );
    expect(html).toBe("");
  });
});

describe("the range control", () => {
  it("offers all three as links so a view can be sent to somebody", () => {
    const html = renderToStaticMarkup(<RangeTabs range={30} />);
    expect(html).toContain("/admin/traffic?range=7");
    expect(html).toContain("/admin/traffic?range=90");
    expect(html).toContain("href");
  });
});

describe("the pages outside the funnel", () => {
  it("lists them with their totals", () => {
    const html = renderToStaticMarkup(
      <OtherPages pages={[{ path: "/o/funnel-app", hits: 7, sources: [{ source: "direct", hits: 7 }] }]} />,
    );
    expect(html).toContain("/o/funnel-app");
    expect(html).toContain("7");
  });

  it("renders nothing when there are none", () => {
    expect(renderToStaticMarkup(<OtherPages pages={[]} />)).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/admin/traffic-funnel.test.tsx`
Expected: FAIL — cannot resolve `@/components/admin/traffic-funnel`.

- [ ] **Step 3: Design and build the components**

**Invoke the `dashboard-redesign` skill** (`Skill` tool, `skill: "dashboard-redesign"`) and follow it to design `components/admin/traffic-funnel.tsx` — the funnel card, the sparkline, the range tabs and the other-pages list.

Give the skill:
- the nine content requirements listed at the head of this task, as hard constraints;
- the existing admin visual language to match — read `components/admin/traffic-table.tsx` and `app/admin/orders/page.tsx` for the card, chip and range-tab patterns, and use the same Tailwind tokens (`border-border`, `bg-surface`, `bg-surface-2`, `text-muted`, `text-fg`, `font-display`, `tabular-nums`, `rounded-2xl`);
- the constraint that everything renders on the server, with no client component and no chart dependency;
- `sparklinePath(daily, width, height)` from `lib/traffic-funnel.ts` as the only source of the chart's geometry — the component picks the viewBox and passes the same numbers to it, and renders `<polyline points={d} />` inside an `<svg viewBox={...}>`; when it returns `null` the component returns `null`.

The four exports and their props are fixed by the Interfaces block above and by the test in Step 1; the skill decides everything else about how they look.

- [ ] **Step 4: Run the component tests to verify they pass**

Run: `npx vitest run components/admin/traffic-funnel.test.tsx`
Expected: PASS, all cases.

- [ ] **Step 5: Rewrite the page**

Replace `app/admin/traffic/page.tsx` entirely:

```tsx
import { pageCountsSince, paidByProduct, productNames, consentedVisitorCount } from "@/lib/traffic";
import { buildFunnels, daysInRange, rangeFrom } from "@/lib/traffic-funnel";
import { FunnelCard, RangeTabs, OtherPages } from "@/components/admin/traffic-funnel";
import { CoverageNote } from "@/components/admin/traffic-table";

export const dynamic = "force-dynamic";

export default async function AdminTrafficPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const range = rangeFrom(await searchParams);
  const [counts, bought, names, consented] = await Promise.all([
    pageCountsSince(range),
    paidByProduct(range),
    productNames(),
    consentedVisitorCount(range),
  ]);
  const days = daysInRange(range, new Date().toISOString().slice(0, 10));
  const view = buildFunnels(counts, bought, names, days);

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl">Traffic</h1>
          <p className="text-muted">
            Counted on the server as each page renders, so this includes the visitors your pixel
            and GA4 never see. Expect it to read higher than theirs.
          </p>
        </div>
        <RangeTabs range={range} />
      </div>

      {view.counted === 0 ? (
        <p className="text-muted">
          No traffic counted yet. Views appear here as soon as somebody opens a sales page.
        </p>
      ) : (
        <>
          {/*
            Said out loud, above the numbers, because somebody will make a
            spending decision on the drop between two of these steps. The
            first three count VIEWS — one person reloading the sales page
            twice is two of them — and only the last counts people.
          */}
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
            The first three steps count <span className="font-medium text-fg">views, not people</span>
            : one visitor reloading a page counts twice. Only <span className="font-medium text-fg">Bought</span>{" "}
            counts people, from real paid orders. Read the drop between steps as a direction, not a
            conversion rate.
          </p>
          <CoverageNote counted={view.counted} consented={consented} />
          <div className="flex flex-col gap-4">
            {view.products.map((p) => (
              <FunnelCard key={p.slug} product={p} />
            ))}
          </div>
          <OtherPages pages={view.others} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the whole suite and typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; the suite passes.

- [ ] **Step 7: See the page**

Start the dev server via the Browser pane (`preview_start` with the repo's `.claude/launch.json` entry — never `npm run dev` through Bash), open `/admin/traffic`, and check with `read_page` and a screenshot:
- the caveat paragraph is above the cards and readable;
- each product card shows four steps including zeros;
- `?range=7` and `?range=90` change the numbers and mark the current tab;
- the other-pages list is visibly separate from the funnel cards;
- `read_console_messages` is clean.

Local data is thin. If no card renders, seed some rows first with a few `bumpPageCountOrThrow` calls through a scratch script rather than concluding the page is broken. Give the page a full minute to settle before deciding anything is missing — measuring this app too early has produced two confident wrong bug reports.

- [ ] **Step 8: Commit**

```bash
git add components/admin/traffic-funnel.tsx components/admin/traffic-funnel.test.tsx app/admin/traffic/page.tsx
git commit -m "Show a funnel per product instead of a list of paths"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| `product text not null default ''` | 1 |
| PK becomes five columns; `bump_page_count` takes a fifth argument | 1 |
| Sales pages set product to their slug | 2 |
| `/checkout` sets the resolved slug, never the raw query | 2 (asserted explicitly) |
| `/checkout/oto` sets it from the order behind its token | 2 |
| Everything else writes `''` | 1 (the default) |
| Four-step funnel per product | 4 |
| Last step from paid + livemode orders | 3 |
| Daily series over the range | 3 (query), 4 (dense series) |
| Ranges 7 / 30 / 90, default 30 | 4 (`rangeFrom`), 5 (`RangeTabs`) |
| Hand-rolled SVG, server-rendered, no library | 4 (`sparklinePath`), 5 |
| Card per product, ordered by traffic | 4 (sort), 5 |
| Drop-off between steps visible | 5 (requirement 2) |
| Source split per product | 4, 5 |
| Non-product pages in a short list below | 4 (`others`), 5 (`OtherPages`) |
| Views-not-people caveat on the page | 5 (requirement 7, and the page's own copy) |
| Empty state when there is no traffic | 5 |
| Product with views but no orders renders with a zero | 4 (test), 5 (test) |
| Sparkline omitted below two days | 4 (`sparklinePath` returns `null`), 5 (renders nothing) |
| Visual design done by the design skill, not specified in prose | 5, Step 3 |
| No unique people, no per-person paths, no source-to-purchase attribution | Nothing implements these; that is the point |

No gaps.

**2. Placeholder scan.** No "TBD", no "handle edge cases", no "similar to Task N". Every code step carries the code. The one deliberately unspecified thing is the visual design in Task 5 Step 3, which the spec explicitly assigns to the design skill and which the nine content requirements and the Step 1 test constrain.

**3. Type consistency.** `CountRow`, `BoughtRow` and `ProductName` are declared in `lib/traffic.ts` (Task 3) and again in `lib/traffic-funnel.ts` (Task 4) with identical fields — deliberate, and the reason is stated in both places. `pageCountsSince` / `paidByProduct` / `productNames` / `buildFunnels` / `daysInRange` / `sparklinePath` / `rangeFrom` / `recordOtoPageHit` are spelled the same everywhere they appear. `ProductFunnel.salesViews` is the sort key in Task 4 and the field the Task 5 fixture sets. Task 1's test uses `trafficByPage` and Task 3 renames it in the same file, which is called out in Task 1 Step 1 so a reader of Task 1 alone is not left with a name that later disappears.
