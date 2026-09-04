# On-site Traffic Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count every visit to the four funnel pages server-side, bucketed by traffic source, and show it in the admin — including the traffic the pixel and GA4 never see.

**Architecture:** A Postgres function increments one row per day per path per source. It is called from the server component of each funnel page, never awaited, so a slow or failed write cannot delay or break a page. No identifier is stored, which is what makes counting a consent-declining visitor defensible. The existing `visitors` table is untouched and shown beside the totals so the gap between them is visible.

**Tech Stack:** Next.js 15 App Router (server components), Supabase/Postgres, vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-traffic-tracking-design.md`

## Global Constraints

- **Migrations run against local AND production before the code that reads them deploys.** A column the database has not got takes down every page that selects it.
- **A migration file is never edited once applied.** Add a new numbered one.
- `lib/` files that touch the database start with `import "server-only";`
- **Nothing in the counting path may throw.** It runs on pages that take money.
- **`path` is the pathname only.** The query string is read for the source bucket and discarded — keeping it would give one row per visitor.
- Tests live beside the code as `*.test.ts`. Integration tests are `*.integration.test.ts` and skip when Supabase is absent.
- Every deploy: full suite green, `npx tsc --noEmit` clean, then the 60-second deploy notice, wait it out, then push.

---

### Task 1: Forward the query string to server components

A server component cannot see the query string unless the page is given
`searchParams`, and two of the four funnel pages are not. Middleware already
forwards the pathname; it forwards the query too now, so one recorder works
for all four pages without changing four different signatures.

**Files:**
- Modify: `middleware.ts:16`
- Test: covered in Task 4's `lib/traffic-wiring.test.ts`, which asserts the
  header is set — a one-line middleware change has no behaviour to test on
  its own, and the thing that would actually break is somebody removing it.

**Interfaces:**
- Produces: request header `x-search`, the raw query string including the
  leading `?`, or `""` when there is none.

- [ ] **Step 1: Add the header**

In `middleware.ts`, directly below the existing `withPath.set("x-pathname", pathname);`:

```ts
  // The query too, for the same reason: a server component cannot read it
  // unless its page happens to take searchParams, and two of the four funnel
  // pages do not. The traffic counter needs it to tell a Meta click from a
  // Google one.
  withPath.set("x-search", req.nextUrl.search);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "Forward the query string to server components

A server component cannot read the query unless its page takes searchParams,
and two of the four funnel pages do not. The pathname was already forwarded;
the query goes with it so one traffic recorder serves all four.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Bucket a visit into a traffic source

Pure logic, no database. Written first because everything else depends on the
answer being right, and it is the part with real rules.

**Files:**
- Create: `lib/traffic-source.ts`
- Create: `lib/traffic-source.test.ts`

**Interfaces:**
- Produces: `sourceOf(search: string, referrer: string | null): string` —
  returns a UTM campaign, or one of `"meta"`, `"google"`, `"direct"`,
  `"referral"`. Never empty, never throws.
- Produces: `isBot(userAgent: string | null): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/traffic-source.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sourceOf, isBot } from "@/lib/traffic-source";

describe("where a visit came from", () => {
  it("prefers the campaign somebody named over one we inferred", () => {
    // A UTM is a deliberate label; a referrer is a guess. When both are
    // present the deliberate one wins, or the advertiser's own naming is
    // silently overridden by ours.
    expect(sourceOf("?utm_campaign=launch-week&fbclid=abc", "https://facebook.com/")).toBe(
      "launch-week",
    );
  });

  it("reads a Meta click id as meta", () => {
    expect(sourceOf("?fbclid=IwcGRvZg", null)).toBe("meta");
  });

  it("reads a Google click id as google", () => {
    expect(sourceOf("?gclid=abc123", null)).toBe("google");
  });

  it("calls a visit with no referrer direct", () => {
    expect(sourceOf("", null)).toBe("direct");
    expect(sourceOf("", "")).toBe("direct");
  });

  it("calls anything else a referral", () => {
    expect(sourceOf("", "https://someblog.example/post")).toBe("referral");
  });

  it("does not count our own pages as a referral", () => {
    // Somebody moving from the sales page to the checkout is not new traffic
    // from a referrer; treating it as one would credit the store for its own
    // visitors.
    expect(sourceOf("", "https://grow.greaterinside.com/p/x")).toBe("direct");
  });

  it("survives a query string that is not valid", () => {
    // Never throws: this runs on a page that takes money.
    expect(sourceOf("?%%%", null)).toBe("direct");
  });

  it("caps a campaign name rather than storing whatever arrives", () => {
    // The value is attacker-controlled — it is a query parameter.
    expect(sourceOf(`?utm_campaign=${"x".repeat(200)}`, null)).toHaveLength(60);
  });
});

describe("obvious robots", () => {
  it("spots the common ones", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "facebookexternalhit/1.1",
      "Slackbot-LinkExpanding 1.0",
      "HeadlessChrome/127.0.0.0",
      "python-requests/2.31",
    ]) {
      expect(isBot(ua), ua).toBe(true);
    }
  });

  it("leaves a real browser alone", () => {
    expect(
      isBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/127.0"),
    ).toBe(false);
  });

  it("treats a missing user agent as a bot", () => {
    // Every real browser sends one. Something that does not is not a person,
    // and counting it inflates the only number this feature exists to give.
    expect(isBot(null)).toBe(true);
    expect(isBot("")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/traffic-source.test.ts`
Expected: FAIL — `Cannot find module '@/lib/traffic-source'`.

- [ ] **Step 3: Write the implementation**

Create `lib/traffic-source.ts`:

```ts
/**
 * Where a visit came from, in one word.
 *
 * No database, no request object, no `server-only` — pure input to output, so
 * it can be tested exhaustively and read at a glance. The rules are ordered on
 * purpose: a UTM is a label somebody chose and beats anything inferred from a
 * click id or a referrer.
 */

/** Long enough for a real campaign name, short enough not to store an essay. */
const MAX_SOURCE = 60;

export function sourceOf(search: string, referrer: string | null): string {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    // A query that cannot be parsed is not a reason to fail a page render.
    params = new URLSearchParams();
  }

  const utm = params.get("utm_campaign")?.trim();
  if (utm) return utm.slice(0, MAX_SOURCE);
  if (params.get("fbclid")) return "meta";
  if (params.get("gclid")) return "google";

  const ref = (referrer ?? "").trim();
  if (!ref) return "direct";

  // Our own pages are not a referrer. Somebody moving from the sales page to
  // the checkout is the same visit, and counting it as new traffic would
  // credit the store with referring itself.
  try {
    const host = new URL(ref).hostname;
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (site && host === new URL(site).hostname) return "direct";
  } catch {
    return "direct";
  }
  return "referral";
}

/**
 * Obvious robots.
 *
 * A short explicit list, not a dependency. It will miss some, and that is
 * accepted: the goal is removing the obvious inflation, not perfect
 * discrimination — a filter that grows into a maintained bot database is a
 * second product.
 */
const BOTS = [
  "bot", "crawl", "spider", "slurp", "preview", "headless",
  "facebookexternalhit", "slackbot", "whatsapp", "telegram",
  "python-requests", "curl/", "wget", "axios", "go-http-client",
];

export function isBot(userAgent: string | null): boolean {
  const ua = (userAgent ?? "").toLowerCase();
  // Every real browser sends one. Something that does not is not a person.
  if (!ua) return true;
  return BOTS.some((b) => ua.includes(b));
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/traffic-source.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/traffic-source.ts lib/traffic-source.test.ts
git commit -m "Work out where a visit came from

Pure input to output, no database and no request object, so the rules can be
tested exhaustively. Ordered on purpose: a UTM is a label somebody chose and
beats a click id or a referrer we inferred. Our own hostname is not a
referral — a buyer moving from the sales page to the checkout is the same
visit, and counting it would credit the store with referring itself.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The table and the counter

**Files:**
- Create: `supabase/migrations/0066_page_counts.sql`
- Create: `lib/traffic.ts`
- Create: `lib/traffic.integration.test.ts`

**Interfaces:**
- Consumes: `sourceOf`, `isBot` from `lib/traffic-source.ts` (Task 2)
- Produces: `recordPageHit(path: string): Promise<void>` — reads
  `x-search`, `referer` and `user-agent` from `headers()` itself. Never
  throws, never rejects.
- Produces: `trafficByPage(days: number): Promise<TrafficRow[]>` where
  `TrafficRow = { path: string; source: string; hits: number }`
- Produces: `consentedVisitorCount(days: number): Promise<number>` — how many
  people the CONSENTED layer saw in the same window, for the comparison the
  spec calls for.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0066_page_counts.sql`:

```sql
-- How many people saw each funnel page, and where they came from.
--
-- Counted on the server as the page renders, so it includes the traffic the
-- pixel and GA4 never see: consent declined, scripts blocked, gone before
-- hydration. Those tools answer "what can we report to an ad platform"; this
-- answers "what actually happened".
--
-- Deliberately holds NO identifier — no cookie, no ip, no user agent. A row
-- says a page was viewed, not who viewed it, and that is what makes counting
-- a visitor who declined tracking defensible. Adding a column that identifies
-- a person turns this from a counter into tracking and changes what consent
-- it needs.
create table if not exists page_counts (
  store_id uuid not null references stores(id) on delete cascade,
  day      date not null,
  -- Pathname only. The query is read for the source and thrown away: an ad
  -- click arrives as /p/x?fbclid=… and keeping that would make every row
  -- unique, which is both useless as a report and unbounded growth.
  path     text not null,
  source   text not null,
  hits     integer not null default 0,
  primary key (store_id, day, path, source)
);

-- One statement per view, and it must be an increment rather than a read then
-- a write: two visitors landing in the same millisecond would otherwise both
-- read 4 and both write 5.
create or replace function bump_page_count(
  p_store uuid, p_day date, p_path text, p_source text
) returns void language sql as $$
  insert into page_counts (store_id, day, path, source, hits)
  values (p_store, p_day, p_path, p_source, 1)
  on conflict (store_id, day, path, source)
  do update set hits = page_counts.hits + 1;
$$;
```

- [ ] **Step 2: Apply it locally**

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f supabase/migrations/0066_page_counts.sql
```
Expected: `CREATE TABLE`, `CREATE FUNCTION`.

- [ ] **Step 3: Write the failing test**

Create `lib/traffic.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { bumpPageCount, trafficByPage } from "@/lib/traffic";

const canRun = !!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1");

describe.skipIf(!canRun)("counting page views (integration)", () => {
  beforeEach(async () => {
    const db = createServiceClient();
    await db.from("page_counts").delete().eq("store_id", await getStoreId());
  });

  it("counts a view", async () => {
    await bumpPageCount("/p/thing", "meta");
    const rows = await trafficByPage(7);
    expect(rows).toContainEqual({ path: "/p/thing", source: "meta", hits: 1 });
  });

  it("increments rather than adding a second row", async () => {
    // The whole point of doing it in one statement: a read-then-write would
    // lose one of two visitors arriving together.
    await bumpPageCount("/p/thing", "meta");
    await bumpPageCount("/p/thing", "meta");
    await bumpPageCount("/p/thing", "meta");
    const rows = (await trafficByPage(7)).filter((r) => r.path === "/p/thing");
    expect(rows).toHaveLength(1);
    expect(rows[0].hits).toBe(3);
  });

  it("keeps sources apart on the same page", async () => {
    await bumpPageCount("/p/thing", "meta");
    await bumpPageCount("/p/thing", "direct");
    const rows = (await trafficByPage(7)).filter((r) => r.path === "/p/thing");
    expect(rows).toHaveLength(2);
  });

  it("returns nothing rather than throwing when there is no traffic", async () => {
    expect(await trafficByPage(7)).toEqual([]);
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `npx vitest run lib/traffic.integration.test.ts`
Expected: FAIL — `Cannot find module '@/lib/traffic'`.

- [ ] **Step 5: Write the implementation**

Create `lib/traffic.ts`:

```ts
import "server-only";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { sourceOf, isBot } from "@/lib/traffic-source";

/**
 * Counting what actually happened on the site.
 *
 * Everything here swallows its own errors. It runs on the pages that take
 * money, and a count is worth less than a page load — a counter that could
 * break a checkout would be a bad trade at any accuracy.
 */

export type TrafficRow = { path: string; source: string; hits: number };

/** The raw increment. Exported for tests; pages call recordPageHit. */
export async function bumpPageCount(path: string, source: string): Promise<void> {
  const db = createServiceClient();
  await db.rpc("bump_page_count", {
    p_store: await getStoreId(),
    p_day: new Date().toISOString().slice(0, 10),
    p_path: path,
    p_source: source,
  });
}

/**
 * Count this view, from whatever the request happens to say.
 *
 * Never awaited by its callers and never throws, so a slow database or a
 * failed write cannot delay a page or break one.
 */
export async function recordPageHit(path: string): Promise<void> {
  try {
    const h = await headers();
    if (isBot(h.get("user-agent"))) return;
    await bumpPageCount(path, sourceOf(h.get("x-search") ?? "", h.get("referer")));
  } catch {
    // Deliberately silent. See the note at the top of this file.
  }
}

/**
 * How many visitors the consented layer saw in the same window.
 *
 * The spec's second layer. Shown beside the true totals so the gap between
 * them is visible: that difference is the share of real traffic the pixel and
 * GA4 never saw, which is the number nobody could measure before this page.
 */
export async function consentedVisitorCount(days: number): Promise<number> {
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const db = createServiceClient();
    const { count } = await db
      .from("visitors")
      .select("id", { count: "exact", head: true })
      .eq("store_id", await getStoreId())
      .gte("first_seen_at", since);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Every page and source with a hit in the last `days` days, busiest first. */
export async function trafficByPage(days: number): Promise<TrafficRow[]> {
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const db = createServiceClient();
    const { data } = await db
      .from("page_counts")
      .select("path, source, hits")
      .eq("store_id", await getStoreId())
      .gte("day", since)
      .order("hits", { ascending: false });
    return (data ?? []) as TrafficRow[];
  } catch {
    return [];
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run lib/traffic.integration.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Apply the migration to production**

```bash
export SSHPASS=$(grep -m1 '^VPS_ROOT_PASSWORD=' ~/Documents/Projects/KVM8-CREDENTIALS.md | cut -d= -f2-)
sshpass -e ssh -o StrictHostKeyChecking=no root@187.127.154.67 \
  "docker exec -i supabase-db-fuv6argrk5j8ogd4y3hi5tu0 psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
  < supabase/migrations/0066_page_counts.sql
```
Expected: `CREATE TABLE`, `CREATE FUNCTION`. This happens BEFORE the code that reads the table deploys.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0066_page_counts.sql lib/traffic.ts lib/traffic.integration.test.ts
git commit -m "Count what actually happened on the funnel pages

One row per day per path per source, incremented in a single statement so two
visitors arriving together cannot both read four and both write five.

It holds no identifier — no cookie, no ip, no user agent — so a row says a
page was viewed and not who viewed it. That is what makes counting a visitor
who declined tracking defensible, and it is a line worth keeping: a column
that identifies a person would turn this from a counter into tracking.

Swallows its own errors. This runs on pages that take money and a count is
worth less than a page load.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Call it from the four funnel pages

**Files:**
- Modify: `app/(store)/p/[slug]/page.tsx` — inside `ProductPage`, after `product` is resolved
- Modify: `app/(store)/o/[key]/page.tsx` — inside `OfferSalesPage`, after `listed` is resolved
- Modify: `app/(store)/checkout/page.tsx` — inside `CheckoutPage`, after `slug` is read
- Modify: `app/(store)/checkout/oto/page.tsx` — inside `OtoPage`, after the token verifies
- Create: `lib/traffic-wiring.test.ts`

**Interfaces:**
- Consumes: `recordPageHit(path)` from `lib/traffic.ts` (Task 3)

- [ ] **Step 1: Write the failing test**

Create `lib/traffic-wiring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Every funnel page counts its own view.
 *
 * A source-reading test because the alternative is rendering four server
 * components against a database, and what actually goes wrong here is a page
 * being added later and nobody remembering the call.
 */
const PAGES = [
  ["app/(store)/p/[slug]/page.tsx", "/p/"],
  ["app/(store)/o/[key]/page.tsx", "/o/"],
  ["app/(store)/checkout/page.tsx", "/checkout"],
  ["app/(store)/checkout/oto/page.tsx", "/checkout/oto"],
] as const;

describe("the funnel pages count their own views", () => {
  for (const [file] of PAGES) {
    it(`${file} records a hit`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("recordPageHit");
    });

    it(`${file} does not await it`, () => {
      // Awaiting would put a database write in front of the page. A count is
      // worth less than a page load, so it is fired and forgotten.
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/await\s+recordPageHit/);
      expect(src).toMatch(/void\s+recordPageHit/);
    });
  }

  it("middleware forwards the query the counter reads", () => {
    // Without this every visit buckets as direct: two of the four pages do
    // not receive searchParams, so the header is the only way the source is
    // knowable. It would fail silently — the counts would look fine and every
    // ad click would be filed as direct traffic.
    expect(readFileSync("middleware.ts", "utf8")).toContain(
      'withPath.set("x-search", req.nextUrl.search)',
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/traffic-wiring.test.ts`
Expected: FAIL — 8 failures, none of the pages mentions `recordPageHit`.

- [ ] **Step 3: Wire the product page**

In `app/(store)/p/[slug]/page.tsx`, add the import at the top with the others:

```ts
import { recordPageHit } from "@/lib/traffic";
```

and immediately after the `notFound()` guard that follows `getProductBySlug`:

```ts
  // Counted here rather than in middleware: this is one of four pages worth
  // counting, and middleware runs on far more. Not awaited — a count is worth
  // less than a page load.
  void recordPageHit(`/p/${slug}`);
```

- [ ] **Step 4: Wire the offer page**

In `app/(store)/o/[key]/page.tsx`, add the same import, and after the two
`notFound()` guards:

```ts
  void recordPageHit(`/o/${key}`);
```

- [ ] **Step 5: Wire the checkout**

In `app/(store)/checkout/page.tsx`, add the same import, and immediately after
`const { product: slug, skin: wantSkin } = await searchParams;`:

```ts
  void recordPageHit("/checkout");
```

- [ ] **Step 6: Wire the upsell**

In `app/(store)/checkout/oto/page.tsx`, add the same import, and immediately
after the `verifyOtoToken` guard that redirects on failure:

```ts
  void recordPageHit("/checkout/oto");
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run lib/traffic-wiring.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 8: Typecheck and full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add "app/(store)/p/[slug]/page.tsx" "app/(store)/o/[key]/page.tsx" \
        "app/(store)/checkout/page.tsx" "app/(store)/checkout/oto/page.tsx" \
        lib/traffic-wiring.test.ts
git commit -m "Count a view on each of the four funnel pages

In the pages rather than in middleware: these are the four worth counting and
middleware runs on far more. Fired and not awaited, so a slow write cannot
delay a page and a failed one cannot break it.

The test reads the source because what goes wrong here is a fifth page being
added later and nobody remembering the call.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The admin page

**Files:**
- Create: `app/admin/traffic/page.tsx`
- Modify: `components/admin/sidebar.tsx:63` — add the nav item above Orders
- Modify: `components/admin/sidebar.test.tsx:34` — add the href to the list it checks
- Create: `app/admin/traffic/traffic-page.test.tsx`

**Interfaces:**
- Consumes: `trafficByPage(days)` and `TrafficRow` from `lib/traffic.ts` (Task 3)

- [ ] **Step 1: Write the failing test**

Create `app/admin/traffic/traffic-page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TrafficTable, CoverageNote } from "@/app/admin/traffic/page";

describe("the traffic table", () => {
  it("totals a page across its sources", () => {
    const html = renderToStaticMarkup(
      <TrafficTable
        rows={[
          { path: "/p/validator", source: "meta", hits: 80 },
          { path: "/p/validator", source: "direct", hits: 20 },
          { path: "/checkout", source: "meta", hits: 30 },
        ]}
      />,
    );
    expect(html).toContain("/p/validator");
    expect(html).toContain("100");
    expect(html).toContain("meta");
  });

  it("says so plainly when there is no traffic yet", () => {
    // A zero-row table reads as broken. A sentence does not.
    const html = renderToStaticMarkup(<TrafficTable rows={[]} />);
    expect(html).toMatch(/No traffic/i);
  });
});

describe("the coverage gap", () => {
  it("states the share the ad tools never saw", () => {
    // The reason there are two layers. A share is actionable; two bare
    // numbers are a puzzle.
    const html = renderToStaticMarkup(<CoverageNote counted={100} consented={69} />);
    expect(html).toContain("31%");
  });

  it("draws nothing before there is any traffic", () => {
    // 0 of 0 is not 100% invisible, it is nothing to say yet.
    expect(renderToStaticMarkup(<CoverageNote counted={0} consented={0} />)).toBe("");
  });

  it("never reports a negative gap", () => {
    // visitors is upserted on later views, so it can briefly exceed the day's
    // counted hits. That is a rounding artefact, not -12% invisible traffic.
    const html = renderToStaticMarkup(<CoverageNote counted={10} consented={14} />);
    expect(html).toContain("0%");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run app/admin/traffic/traffic-page.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the page**

Create `app/admin/traffic/page.tsx`:

```tsx
import { trafficByPage, consentedVisitorCount, type TrafficRow } from "@/lib/traffic";

export const dynamic = "force-dynamic";

/**
 * What actually happened on the site.
 *
 * Counted on the server, so this includes the traffic the pixel and GA4 never
 * see — consent declined, scripts blocked, gone before hydration. It will
 * read HIGHER than either of them, and that difference is the point rather
 * than a discrepancy to reconcile.
 */
export function TrafficTable({ rows }: { rows: TrafficRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted">
        No traffic counted yet. Views appear here as soon as somebody opens a sales page.
      </p>
    );
  }

  const byPath = new Map<string, { total: number; sources: Map<string, number> }>();
  for (const r of rows) {
    const entry = byPath.get(r.path) ?? { total: 0, sources: new Map() };
    entry.total += r.hits;
    entry.sources.set(r.source, (entry.sources.get(r.source) ?? 0) + r.hits);
    byPath.set(r.path, entry);
  }
  const pages = [...byPath.entries()].sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="flex flex-col gap-3">
      {pages.map(([path, entry]) => (
        <div key={path} className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium">{path}</span>
            <span className="font-display text-2xl tabular-nums">{entry.total}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            {[...entry.sources.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([source, hits]) => (
                <span key={source}>
                  {source} <span className="tabular-nums text-fg">{hits}</span>
                </span>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The gap between what happened and what the ad tools saw.
 *
 * The spec's reason for having two layers. Stated as a share rather than two
 * bare numbers, because "31% of your traffic is invisible to Meta" is a
 * sentence somebody can act on and "412 and 284" is not.
 */
export function CoverageNote({ counted, consented }: { counted: number; consented: number }) {
  if (counted === 0) return null;
  const missed = Math.max(0, counted - consented);
  const pct = Math.round((missed / counted) * 100);
  return (
    <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
      <span className="font-medium text-fg">{counted}</span> views counted here.{" "}
      <span className="font-medium text-fg">{consented}</span> visitors accepted cookies, so
      roughly <span className="font-medium text-fg">{pct}%</span> of this traffic is invisible to
      your pixel and to GA4. That gap is why this page exists.
    </p>
  );
}

export default async function AdminTrafficPage() {
  const [rows, consented] = await Promise.all([trafficByPage(30), consentedVisitorCount(30)]);
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
      <TrafficTable rows={rows} />
    </div>
  );
}
```

- [ ] **Step 4: Add the nav item**

In `components/admin/sidebar.tsx`, in the `Customers` group, directly above the Checkout entry:

```ts
        // First in the group because it is the top of the funnel: traffic,
        // then the checkout it reaches, then the orders that come out.
        { href: "/admin/traffic", label: "Traffic", icon: ICON.orders },
```

In `components/admin/sidebar.test.tsx:34`, add `"/admin/traffic"` to the array of hrefs it checks.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run app/admin/traffic/traffic-page.test.tsx components/admin/sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck and full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean, all tests pass.

- [ ] **Step 7: Look at it**

Start the dev server and open `/admin/traffic`. Confirm it renders the empty
state on a store with no counts, then visit `/p/<a real slug>` and confirm a
row appears. Reading the code is not the same as seeing the page.

- [ ] **Step 8: Commit**

```bash
git add app/admin/traffic components/admin/sidebar.tsx components/admin/sidebar.test.tsx
git commit -m "Show what actually happened on the site

Traffic sits above Checkout and Orders because that is the order the funnel
happens in. The page says out loud that its numbers will read higher than the
pixel's: that gap is the reason it exists, not a discrepancy to reconcile.

An empty store gets a sentence rather than a table with no rows, which reads
as broken.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Deploy

- [ ] **Step 1: Confirm the migration is already on production**

```bash
export SSHPASS=$(grep -m1 '^VPS_ROOT_PASSWORD=' ~/Documents/Projects/KVM8-CREDENTIALS.md | cut -d= -f2-)
echo "select count(*) from page_counts;" | sshpass -e ssh -o StrictHostKeyChecking=no \
  root@187.127.154.67 "docker exec -i supabase-db-fuv6argrk5j8ogd4y3hi5tu0 psql -U postgres -d postgres"
```
Expected: a count, not an error. If it errors, Task 3 Step 7 was skipped — do it now. Code that selects a missing table takes down every page that reads it.

- [ ] **Step 2: Full suite and typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean. Do not continue otherwise.

- [ ] **Step 3: Announce the deploy and wait the full 60 seconds**

```bash
CT=$(grep -m1 '^COOLIFY_API_TOKEN=' ~/Documents/Projects/KVM8-CREDENTIALS.md | cut -d= -f2-)
CS=$(curl -s -H "Authorization: Bearer $CT" \
 "https://coolify.gowithepic.com/api/v1/applications/r11f09w16h8afmpt0ilxey2q/envs" \
 | jq -r 'first(.[]|select(.key=="CRON_SECRET")|.value)')
curl -s -X POST "https://grow.greaterinside.com/api/deploy-notice" \
  -H "Authorization: Bearer $CS" -H "Content-Type: application/json" \
  -d '{"seconds":60,"source":"traffic tracking"}'
sleep 64
```

This is a standing rule, not a formality: admins edit pages in production and
a deploy mid-save loses their work. Wait it out before pushing.

- [ ] **Step 4: Push**

```bash
TOKEN=$(awk '/^### gi-membership \(Greater Inside/{f=1} f&&/^GITHUB_TOKEN=/{print substr($0,14); exit}' ~/Documents/Projects/KVM8-CREDENTIALS.md)
git push "https://vikasepic:${TOKEN}@github.com/vikasepic/gi-membership.git" main
```

- [ ] **Step 5: Prove it deployed**

Read the deployment uuid out of the GitHub webhook delivery's RESPONSE body and
poll that uuid until `finished`. The `/api/v1/deployments` collection lists
only in-flight builds, so an empty array means "nothing running", never
"missed".

- [ ] **Step 6: Confirm on the live site**

Open `grow.greaterinside.com/p/digital-product-validator`, then `/admin/traffic`.
A row should appear. Then check the counter is honest about a robot:

```bash
curl -s -A "Googlebot/2.1" -o /dev/null https://grow.greaterinside.com/p/digital-product-validator
```

The count must NOT increase.

---

## Notes for whoever executes this

**The privacy line is the owner's.** The spec says the privacy policy should
mention that page views are counted. That is Ajit's to write and is not a
dependency for any task here.

**Do not add an identifier to `page_counts`.** Not a cookie, not `gi_anon`,
not a hashed IP, however useful uniques would be. The absence of one is what
makes counting a consent-declining visitor defensible, and adding one changes
what consent the table needs. Unique counting stays in `visitors`, which is
gated. If uniques become a requirement, that is a new spec, not a column.

**Expect these numbers to be higher than GA4 and Meta.** That is the feature
working, not a bug to reconcile.
