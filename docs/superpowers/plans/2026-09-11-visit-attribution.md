# Visit Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every visit to any store page with the link that brought it, and give the admin four screens that read it back.

**Architecture:** A `void recordVisit()` in the store layout writes one `visits` row per visitor per 30-minute idle window through a Postgres function that does find-or-create atomically, the same way `bump_page_count` already avoids a read-then-write race. Milestones land in `visit_steps`; orders gain `visit_id`. Three SQL rollup functions aggregate in the database, and `lib/visit-reports.ts` is the only thing that calls them.

**Tech Stack:** Next.js 16 App Router, Supabase/PostgREST (Postgres 15), vitest (node + react-dom/server markup tests).

**Spec:** `docs/superpowers/specs/2026-09-11-visit-attribution-design.md`

## Global Constraints

- **Coverage: everyone, personal bits hashed.** Landing URL, referrer, campaign labels and device are recorded with NO consent gate. The IP is stored only as a salted sha256. Click ids never enter `visits` — they stay in the consent-gated `visitors` row.
- **Depth: entry plus milestones.** One `visits` row per visit; `visit_steps` rows only for `checkout`, `upsell`, `purchase`. Never a row per page view.
- **Capture hangs off the store layout**, not a list of paths, so every page including the home page is an entry point.
- A visit is `gi_anon` + a 30-minute idle window on `last_seen_at`.
- **Nothing here may throw.** `lib/visits.ts` swallows every error, is `void`-called and never awaited, exactly like `lib/traffic.ts`. It runs on pages that take money.
- Same-host referrers are NOT recorded. Foreign referrers are kept whole, capped at 500 characters.
- Landing query is kept verbatim including `fbclid`, EXCEPT any parameter whose value contains `@` (ESP links carry per-recipient addresses). Capped at 500 characters.
- `isBot(user-agent)` opens no visit. No `gi_anon` cookie opens no visit.
- Migration numbers are `0080` and `0081`. Migrations do NOT run on deploy: apply by hand, `notify pgrst, 'reload schema';`, verify through the API, THEN push.
- Every value read off a URL is a whitelist, never a parse.
- PostgREST truncates at 1000 rows silently. Use `allRows` for anything that grows; aggregate in Postgres, never by pulling every visit into Node.
- A test must be able to fail. Three vacuous assertions were caught on the previous branch; do not add a fourth.
- Run the FULL suite before every commit and gate on the runner's own exit status, not on grep.
- Commit messages: imperative subject, a body saying why, and the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

**Ruling made while writing this plan, and why:** the spec left the concurrency guard open, weighing a unique index on a `date_trunc` expression against a looser one. Both are wrong. This codebase already solved exactly this problem once — `bump_page_count` is an RPC precisely because "two visitors landing in the same millisecond would otherwise both read 4 and both write 5". Find-or-create goes in a Postgres function for the same reason, and no expression index is needed. The residual race is two simultaneous first page loads by the same visitor with no prior visit, which inserts two rows; that is rare enough to accept and is written down in the migration.

---

## File map

| File | Responsibility |
|---|---|
| `lib/visit-fields.ts` (new) | Pure: device/browser/os from a user agent, query and referrer sanitising, IP hashing. No Next, no Supabase, no `server-only`. |
| `lib/visit-fields.test.ts` (new) | Its behaviour tests. |
| `supabase/migrations/0080_visits.sql` (new) | `visits`, `visit_steps`, `orders.visit_id`, indexes, the `record_visit` function, the one-time seed from `visitors`. |
| `supabase/migrations/0081_visit_rollups.sql` (new) | `visit_campaign_rollup`, `visit_referrer_rollup`, `visit_landing_rollup`. |
| `lib/visits.ts` (new) | `server-only`. `recordVisit`, `currentVisitId`, `recordVisitStep`. Swallows everything. |
| `lib/visits.integration.test.ts` (new) | The window, the bot guard, the missing-cookie guard, milestone idempotency. |
| `app/(store)/layout.tsx` | `void recordVisit()`. |
| `app/(store)/checkout/page.tsx`, `checkout/offer/page.tsx`, `checkout/oto/page.tsx` | `void recordVisitStep(...)`. |
| `app/(store)/checkout/actions.ts`, `checkout/offer/actions.ts` | Read `currentVisitId()` and pass it in. |
| `lib/checkout.ts`, `lib/offer-checkout.ts` | Write `visit_id` on the order; record the `purchase` milestone. |
| `lib/visit-reports.ts` (new) | One read per screen, over the rollups. |
| `lib/visit-reports.test.ts` (new) | Shaping and filtering, pure parts. |
| `app/admin/attribution/page.tsx` (new) | Campaigns. |
| `app/admin/attribution/visits/page.tsx` (new) | The visit log. |
| `app/admin/attribution/sources/page.tsx` (new) | Referrers and landing pages. |
| `components/admin/campaign-table.tsx` (new) | The campaigns table. |
| `components/admin/visit-row.tsx` (new) | One visit, expandable. |
| `lib/visit-filter.ts` (new) | The visit log's filter predicate, so the page whitelists and the module matches. |
| `components/admin/attribution-popover.tsx` | An open two-column block for the expanded order row. |
| `components/admin/sidebar.tsx` | The Attribution group. |
| `lib/orders.ts` | `visitId` on `OrderRow`. |
| `app/api/cron/prune-visits/route.ts` (new) | Deletes visits older than 400 days. |
| `docs/DATABASE.md`, `docs/lessons.md`, `docs/products-and-offers.md` | The tables and what this cost. |

---

### Task 1: The pure field helpers

**Files:**
- Create: `lib/visit-fields.ts`
- Test: `lib/visit-fields.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Device = "phone" | "tablet" | "desktop";
  export function deviceOf(ua: string | null | undefined): Device;
  export function browserOf(ua: string | null | undefined): string;   // Chrome | Safari | Firefox | Edge | Samsung Internet | Other
  export function osOf(ua: string | null | undefined): string;        // iOS | Android | macOS | Windows | Linux | Other
  export function sanitizeQuery(search: string | null | undefined): string | null;
  export function foreignReferrer(referer: string | null | undefined, siteUrl: string | undefined): { url: string; host: string } | null;
  export function hashIp(ip: string | null | undefined, salt: string | undefined): string | null;
  export function clientIpOf(forwardedFor: string | null, realIp: string | null): string | null;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/visit-fields.test.ts
import { describe, it, expect } from "vitest";
import {
  deviceOf, browserOf, osOf, sanitizeQuery, foreignReferrer, hashIp, clientIpOf,
} from "@/lib/visit-fields";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const SAMSUNG = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36";
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const WIN_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const LINUX_FF = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";

describe("deviceOf", () => {
  it("calls a phone a phone and a tablet a tablet", () => {
    expect(deviceOf(IPHONE)).toBe("phone");
    expect(deviceOf(PIXEL)).toBe("phone");
    expect(deviceOf(IPAD)).toBe("tablet");
  });
  it("calls everything else desktop, including nothing at all", () => {
    expect(deviceOf(MAC_CHROME)).toBe("desktop");
    expect(deviceOf(WIN_EDGE)).toBe("desktop");
    expect(deviceOf(null)).toBe("desktop");
    expect(deviceOf("")).toBe("desktop");
  });
  it("does not call an Android tablet a phone", () => {
    // Android tablets omit "Mobile"; that absence is the only signal there is.
    expect(deviceOf("Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toBe("tablet");
  });
});

describe("browserOf", () => {
  it("puts Edge and Samsung before Chrome, because both claim to be Chrome", () => {
    expect(browserOf(WIN_EDGE)).toBe("Edge");
    expect(browserOf(SAMSUNG)).toBe("Samsung Internet");
    expect(browserOf(MAC_CHROME)).toBe("Chrome");
  });
  it("puts Chrome before Safari, because Chrome claims to be Safari", () => {
    expect(browserOf(PIXEL)).toBe("Chrome");
    expect(browserOf(IPHONE)).toBe("Safari");
  });
  it("reads Firefox, and gives up honestly", () => {
    expect(browserOf(LINUX_FF)).toBe("Firefox");
    expect(browserOf("curl/8.4.0")).toBe("Other");
    expect(browserOf(null)).toBe("Other");
  });
});

describe("osOf", () => {
  it("reads each family", () => {
    expect(osOf(IPHONE)).toBe("iOS");
    expect(osOf(IPAD)).toBe("iOS");
    expect(osOf(PIXEL)).toBe("Android");
    expect(osOf(MAC_CHROME)).toBe("macOS");
    expect(osOf(WIN_EDGE)).toBe("Windows");
    expect(osOf(LINUX_FF)).toBe("Linux");
    expect(osOf(null)).toBe("Other");
  });
  it("does not read an Android device as Linux, though it says Linux", () => {
    expect(osOf(PIXEL)).not.toBe("Linux");
  });
});

describe("sanitizeQuery", () => {
  it("keeps the whole query, click ids included — it is the link the ad used", () => {
    expect(sanitizeQuery("?utm_source=meta&fbclid=IwZXh0bgNhZW0")).toBe("utm_source=meta&fbclid=IwZXh0bgNhZW0");
  });
  it("drops a parameter whose value names a person", () => {
    expect(sanitizeQuery("?utm_campaign=jane@example.com&utm_source=mail")).toBe("utm_source=mail");
  });
  it("returns null for nothing at all", () => {
    expect(sanitizeQuery("")).toBeNull();
    expect(sanitizeQuery("?")).toBeNull();
    expect(sanitizeQuery(null)).toBeNull();
    expect(sanitizeQuery("?email=a@b.com")).toBeNull();
  });
  it("caps at 500 characters and never throws on rubbish", () => {
    expect(sanitizeQuery(`?x=${"y".repeat(900)}`)!.length).toBe(500);
    expect(() => sanitizeQuery("?%E0%A4%A")).not.toThrow();
  });
});

describe("foreignReferrer", () => {
  const SITE = "https://grow.greaterinside.com";
  it("keeps a foreign referrer whole, query and all, with its host", () => {
    expect(foreignReferrer("https://l.facebook.com/l.php?u=abc&h=def", SITE)).toEqual({
      url: "https://l.facebook.com/l.php?u=abc&h=def",
      host: "l.facebook.com",
    });
  });
  it("ignores our own pages — an internal move is not a referral", () => {
    expect(foreignReferrer(`${SITE}/p/x`, SITE)).toBeNull();
  });
  it("drops one that names a person, and anything unparseable", () => {
    expect(foreignReferrer("https://mail.example/r?to=jane@example.com", SITE)).toBeNull();
    expect(foreignReferrer("not a url", SITE)).toBeNull();
    expect(foreignReferrer(null, SITE)).toBeNull();
    expect(foreignReferrer("   ", SITE)).toBeNull();
  });
  it("caps the url at 500 characters", () => {
    const r = foreignReferrer(`https://a.test/${"p".repeat(900)}`, SITE)!;
    expect(r.url.length).toBe(500);
    expect(r.host).toBe("a.test");
  });
});

describe("hashIp", () => {
  it("is stable, salted, and never the address", () => {
    const a = hashIp("203.0.113.9", "pepper")!;
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toBe(hashIp("203.0.113.9", "pepper"));
    expect(a).not.toBe(hashIp("203.0.113.9", "other-pepper"));
    expect(a).not.toContain("203.0.113.9");
  });
  it("returns null rather than falling back to a raw address", () => {
    expect(hashIp("203.0.113.9", undefined)).toBeNull();
    expect(hashIp("203.0.113.9", "")).toBeNull();
    expect(hashIp(null, "pepper")).toBeNull();
  });
});

describe("clientIpOf", () => {
  it("takes the first entry of the forwarded list, which is the client", () => {
    expect(clientIpOf("203.0.113.9, 10.0.0.1, 10.0.0.2", null)).toBe("203.0.113.9");
  });
  it("falls back to x-real-ip, then to nothing", () => {
    expect(clientIpOf(null, "198.51.100.4")).toBe("198.51.100.4");
    expect(clientIpOf(null, null)).toBeNull();
    expect(clientIpOf("  ", "  ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/visit-fields.test.ts`
Expected: FAIL — cannot resolve `@/lib/visit-fields`.

- [ ] **Step 3: Write the module**

```ts
// lib/visit-fields.ts
import { createHash } from "node:crypto";

/**
 * What a request says about itself, reduced to something worth storing.
 *
 * Pure: no Next, no Supabase, no `server-only`, so the capture path and the
 * tests read the same rules. Everything here is a best effort over a string
 * the client controls — a wrong guess costs a column in a report, so each
 * function has an honest "Other" rather than an invented answer.
 */

const MAX_URLISH = 500;

export type Device = "phone" | "tablet" | "desktop";

/**
 * Phone, tablet or desktop.
 *
 * `Mobile` is the token every phone browser sends and tablets deliberately
 * omit — that absence is the whole signal for an Android tablet, which is
 * otherwise identical to a phone.
 */
export function deviceOf(ua: string | null | undefined): Device {
  const s = ua ?? "";
  if (/iPad|Tablet/i.test(s)) return "tablet";
  if (/Android/i.test(s) && !/Mobile/i.test(s)) return "tablet";
  if (/Mobile|iPhone|iPod|Android/i.test(s)) return "phone";
  return "desktop";
}

/**
 * Order matters and is the only hard part. Edge and Samsung Internet both
 * carry `Chrome` in their strings, and Chrome carries `Safari` in its — so
 * the most specific claim has to be tested first or everything reads Chrome.
 */
export function browserOf(ua: string | null | undefined): string {
  const s = ua ?? "";
  if (/Edg\//i.test(s)) return "Edge";
  if (/SamsungBrowser/i.test(s)) return "Samsung Internet";
  if (/Firefox\/|FxiOS/i.test(s)) return "Firefox";
  if (/Chrome\/|CriOS/i.test(s)) return "Chrome";
  if (/Safari\//i.test(s)) return "Safari";
  return "Other";
}

/** Android says Linux, so it has to be asked about first. */
export function osOf(ua: string | null | undefined): string {
  const s = ua ?? "";
  if (/Android/i.test(s)) return "Android";
  if (/iPhone|iPad|iPod|iOS/i.test(s)) return "iOS";
  if (/Mac OS X|Macintosh/i.test(s)) return "macOS";
  if (/Windows/i.test(s)) return "Windows";
  if (/Linux|X11/i.test(s)) return "Linux";
  return "Other";
}

/** A value that names a person. Same guard the campaign labels use. */
const namesAPerson = (v: string) => v.includes("@");

/**
 * The landing query, kept as the link actually was.
 *
 * Click ids stay: this column exists to answer "what exactly did they
 * click", and a landing URL with `fbclid` removed answers half of it. What
 * does not stay is a value carrying an address — ESP links build
 * per-recipient URLs, and one of those in an exported column is a leak.
 */
export function sanitizeQuery(search: string | null | undefined): string | null {
  const raw = (search ?? "").replace(/^\?/, "");
  if (!raw) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return null;
  }
  const kept = new URLSearchParams();
  for (const [k, v] of params) {
    if (!v || namesAPerson(v)) continue;
    kept.append(k, v);
  }
  const out = kept.toString();
  return out ? out.slice(0, MAX_URLISH) : null;
}

/**
 * The referring page, when it was not one of ours.
 *
 * Kept whole, query included, unlike `orders.referrer` which is origin plus
 * path: the visit log is where somebody goes to ask what exactly this was,
 * and the referring page's own query is part of that answer. An internal
 * move — sales page to checkout — is not a referral and is dropped, or every
 * navigation in the store would look like incoming traffic.
 */
export function foreignReferrer(
  referer: string | null | undefined,
  siteUrl: string | undefined,
): { url: string; host: string } | null {
  const ref = (referer ?? "").trim();
  if (!ref || namesAPerson(ref)) return null;
  try {
    const u = new URL(ref);
    if (siteUrl && u.hostname === new URL(siteUrl).hostname) return null;
    return { url: ref.slice(0, MAX_URLISH), host: u.hostname };
  } catch {
    return null;
  }
}

/**
 * The address, as something that cannot be turned back into an address.
 *
 * Null without a salt rather than a bare hash: an unsalted sha256 of an IPv4
 * is reversible by brute force in seconds, so a missing secret must mean no
 * column, never a weaker one.
 */
export function hashIp(ip: string | null | undefined, salt: string | undefined): string | null {
  const v = (ip ?? "").trim();
  if (!v || !salt) return null;
  return createHash("sha256").update(`${salt}:${v}`).digest("hex");
}

/** `x-forwarded-for` is a list; the first entry is the client, the rest are proxies. */
export function clientIpOf(forwardedFor: string | null, realIp: string | null): string | null {
  const first = (forwardedFor ?? "").split(",")[0]?.trim();
  if (first) return first;
  const real = (realIp ?? "").trim();
  return real || null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/visit-fields.test.ts`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add lib/visit-fields.ts lib/visit-fields.test.ts
git commit -m "Add the pure visit-field helpers: device, browser, os, query, referrer, hashed ip

Every value here is a best effort over a string the client controls, so each
has an honest Other rather than an invented answer. The IP is null without a
salt: an unsalted hash of an IPv4 is reversible in seconds.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 0080 — the tables, the function, the seed

**Files:**
- Create: `supabase/migrations/0080_visits.sql`
- Modify: `docs/DATABASE.md`

**Interfaces:**
- Produces: tables `visits` and `visit_steps`; column `orders.visit_id`; function `record_visit(...) returns uuid` with the exact signature below, which Task 3 calls by name through `db.rpc`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0080_visits.sql
--
-- Visits, and the milestones inside them.
--
-- page_counts answers "how many views did this path get today". It cannot
-- answer "where did THIS person come from", which is the question an owner
-- actually asks, and it never saw the home page at all: only five paths call
-- recordPageHit. A visit row is written from the store LAYOUT, so every page
-- is an entry point.
--
-- Recorded for everyone, with no consent gate, because a landing URL and a
-- campaign describe the ad rather than the person. The address is stored only
-- as a salted hash and click ids are not here at all — those stay in the
-- consent-gated `visitors` row. See docs/superpowers/specs/2026-09-11-visit-attribution-design.md.

create table if not exists visits (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references stores(id) on delete cascade,
  -- The first-party gi_anon cookie. Not a person: the same person on a phone
  -- and a laptop is two visitors, as in every tool that does not require a login.
  anon_id        text not null,
  started_at     timestamptz not null default now(),
  -- Drives the 30-minute idle window in record_visit below.
  last_seen_at   timestamptz not null default now(),
  landing_path   text not null,
  -- The query as the link actually was, click ids included, minus any value
  -- carrying an address. This is what makes a "direct" visit explainable.
  landing_query  text,
  -- The whole referring URL, foreign hosts only. An internal move is not a referral.
  referrer       text,
  referrer_host  text,
  utm_first      jsonb not null default '{}'::jsonb,
  utm_last       jsonb not null default '{}'::jsonb,
  device         text,
  browser        text,
  os             text,
  -- sha256 of salt:ip. Null when ATTRIBUTION_IP_SALT is unset — never a raw address.
  ip_hash        text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index if not exists visits_store_started_idx on visits (store_id, started_at desc);
create index if not exists visits_window_idx on visits (store_id, anon_id, last_seen_at desc);
create index if not exists visits_referrer_host_idx on visits (store_id, referrer_host) where referrer_host is not null;

create table if not exists visit_steps (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  visit_id    uuid not null references visits(id) on delete cascade,
  step        text not null check (step in ('checkout','upsell','purchase')),
  order_id    uuid references orders(id) on delete set null,
  value_cents integer,
  at          timestamptz not null default now(),
  -- A refresh is not a second milestone.
  unique (visit_id, step)
);

create index if not exists visit_steps_store_at_idx on visit_steps (store_id, at desc);

-- Which visit produced this order. Forward-only: rows older than this keep null.
alter table orders add column if not exists visit_id uuid references visits(id) on delete set null;
comment on column orders.visit_id is 'The visit this order was placed in. Null for orders predating migration 0080.';

-- Find-or-create, in ONE statement, for the same reason bump_page_count is an
-- RPC: done as a read in Node and then a write, two page loads in the same
-- millisecond both read "no recent visit" and both insert.
--
-- The residual race is two SIMULTANEOUS first page loads by the same visitor
-- with no prior visit, which still inserts twice. That is rare enough to
-- accept, and cheaper than an expression index on a date_trunc whose
-- immutability varies by Postgres version.
create or replace function record_visit(
  p_store uuid, p_anon text, p_path text, p_query text,
  p_referrer text, p_referrer_host text,
  p_utm_first jsonb, p_utm_last jsonb,
  p_device text, p_browser text, p_os text,
  p_ip_hash text, p_user_agent text
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  update visits
     set last_seen_at = now()
   where id = (
     select id from visits
      where store_id = p_store
        and anon_id = p_anon
        and last_seen_at > now() - interval '30 minutes'
      order by last_seen_at desc
      limit 1
   )
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  insert into visits (
    store_id, anon_id, landing_path, landing_query, referrer, referrer_host,
    utm_first, utm_last, device, browser, os, ip_hash, user_agent
  ) values (
    p_store, p_anon, p_path, p_query, p_referrer, p_referrer_host,
    coalesce(p_utm_first, '{}'::jsonb), coalesce(p_utm_last, '{}'::jsonb),
    p_device, p_browser, p_os, p_ip_hash, p_user_agent
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Seed what the consented visitor rows already know, once.
--
-- Those rows have a landing_url with its query and a referrer, but never had
-- a device, a browser or an address: that was not captured. They are marked
-- by a null user_agent, and the visit log says "before visit tracking" rather
-- than rendering blanks that read as a bug.
insert into visits (store_id, anon_id, started_at, last_seen_at, landing_path, landing_query, referrer, referrer_host, utm_first, utm_last)
select v.store_id,
       v.anon_id,
       v.first_seen_at,
       v.first_seen_at,
       coalesce(nullif(split_part(split_part(v.landing_url, '?', 1), '://', 2), ''), '/') ,
       nullif(split_part(v.landing_url, '?', 2), ''),
       v.referrer,
       nullif(split_part(split_part(coalesce(v.referrer, ''), '://', 2), '/', 1), ''),
       coalesce((select jsonb_object_agg(t.k, t.val) from jsonb_each_text(v.utm) as t(k, val) where t.k like 'utm\_%' and t.val <> ''), '{}'::jsonb),
       coalesce((select jsonb_object_agg(t.k, t.val) from jsonb_each_text(v.utm) as t(k, val) where t.k like 'utm\_%' and t.val <> ''), '{}'::jsonb)
  from visitors v
 where not exists (select 1 from visits x where x.store_id = v.store_id and x.anon_id = v.anon_id)
   and v.landing_url is not null;
```

Note on the seed's `landing_path`: `split_part(url, '://', 2)` yields
`host/path`, which still carries the host. That is deliberate and cheap —
these 164 rows are historical and the log labels them — but say so in the
`docs/DATABASE.md` note rather than pretending the column is uniform.

- [ ] **Step 2: Apply it locally and reload PostgREST**

Find the container: `docker ps --format '{{.Names}}' | grep supabase_db`. Then:

```bash
docker exec -i <container> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/0080_visits.sql
docker exec -i <container> psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"
```

Expected: `CREATE TABLE` twice, three `CREATE INDEX`, `ALTER TABLE`, `COMMENT`, `CREATE FUNCTION`, `INSERT 0 n`. If Docker is not running, report BLOCKED — Task 3's tests cannot pass without these tables.

- [ ] **Step 3: Verify the function works and the window holds**

```bash
docker exec -i <container> psql -U postgres -d postgres <<'SQL'
select record_visit('00000000-0000-0000-0000-000000000001','zz-plan-check','/','utm_source=meta',null,null,'{}'::jsonb,'{}'::jsonb,'desktop','Chrome','macOS',null,'ua') as first_call;
select record_visit('00000000-0000-0000-0000-000000000001','zz-plan-check','/','utm_source=meta',null,null,'{}'::jsonb,'{}'::jsonb,'desktop','Chrome','macOS',null,'ua') as second_call;
select count(*) as should_be_one from visits where anon_id = 'zz-plan-check';
delete from visits where anon_id = 'zz-plan-check';
SQL
```

Expected: both calls return the SAME uuid, and `should_be_one` is 1. Paste this output into your report — it is the evidence the function is find-or-create and not create-always.

- [ ] **Step 4: Document the tables**

In `docs/DATABASE.md`, add `visits` and `visit_steps` in the same table format the file uses for every other table, and add a row for `orders.visit_id` in the `orders` table. In the `visits` note, say plainly that rows seeded from `visitors` have a null `user_agent`, no device data, and a `landing_path` that still carries the host.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0080_visits.sql docs/DATABASE.md
git commit -m "Add visits and visit_steps, with find-or-create in one statement

page_counts cannot say where one person came from, and never saw the home
page at all. A visit row is written from the store layout instead, so every
page is an entry point.

Find-or-create lives in a Postgres function for the same reason
bump_page_count does: as a read then a write in Node, two page loads in the
same millisecond both insert.

Migration must be applied by hand before the image that calls it serves traffic.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `lib/visits.ts` and the store-layout hook

**Files:**
- Create: `lib/visits.ts`
- Create: `lib/visits.integration.test.ts`
- Modify: `app/(store)/layout.tsx`

**Interfaces:**
- Consumes: Task 1's helpers; Task 2's `record_visit` RPC.
- Produces:
  ```ts
  export async function recordVisit(): Promise<void>;                 // fire-and-forget, from the layout
  export async function currentVisitId(): Promise<string | null>;     // read-only lookup, for milestones and orders
  export async function recordVisitStep(
    step: "checkout" | "upsell" | "purchase",
    opts?: { orderId?: string | null; valueCents?: number | null; visitId?: string | null },
  ): Promise<void>;
  ```

- [ ] **Step 1: Write the failing integration test**

```ts
// lib/visits.integration.test.ts
import { describe, it, expect, afterAll, vi } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// The capture path reads the request through next/headers and next/cookies.
// Both are mocked per-test so one file can exercise a phone, a bot and a
// visitor with no cookie without standing up a server.
const REQ = vi.hoisted(() => ({ headers: new Map<string, string>(), cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => REQ.headers.get(k.toLowerCase()) ?? null }),
  cookies: async () => ({ get: (k: string) => (REQ.cookies.has(k) ? { value: REQ.cookies.get(k) } : undefined) }),
}));

const { recordVisit, currentVisitId, recordVisitStep } = await import("@/lib/visits");

const UA_PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";
const anonIds: string[] = [];

function request(anon: string, over: Record<string, string> = {}) {
  REQ.headers = new Map(Object.entries({
    "x-pathname": "/p/zz-plan",
    "x-search": "?utm_source=meta&utm_campaign=ZZ%20Plan",
    "user-agent": UA_PHONE,
    "x-forwarded-for": "203.0.113.9",
    ...over,
  }));
  REQ.cookies = new Map(anon ? [["gi_anon", anon]] : []);
}

function fresh(tag: string) {
  const id = `zz-visit-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  anonIds.push(id);
  return id;
}

async function visitsFor(anon: string) {
  const db = createServiceClient();
  const { data } = await db
    .from("visits")
    .select("id, landing_path, landing_query, device, browser, os, ip_hash, utm_last, referrer, referrer_host, last_seen_at")
    .eq("anon_id", anon)
    .order("started_at", { ascending: true });
  return data ?? [];
}

describe.skipIf(!canRun)("recording a visit (integration)", () => {
  it("writes one row carrying the link, the campaign and the device", async () => {
    const anon = fresh("basic");
    request(anon, { referer: "https://l.facebook.com/l.php?u=abc" });
    await recordVisit();
    const rows = await visitsFor(anon);
    expect(rows).toHaveLength(1);
    expect(rows[0].landing_path).toBe("/p/zz-plan");
    expect(rows[0].landing_query).toBe("utm_source=meta&utm_campaign=ZZ+Plan");
    expect(rows[0].device).toBe("phone");
    expect(rows[0].browser).toBe("Safari");
    expect(rows[0].os).toBe("iOS");
    expect(rows[0].referrer).toBe("https://l.facebook.com/l.php?u=abc");
    expect(rows[0].referrer_host).toBe("l.facebook.com");
    expect(rows[0].utm_last).toMatchObject({ utm_source: "meta", utm_campaign: "ZZ Plan" });
  });

  it("touches the same visit inside the window instead of opening a second", async () => {
    const anon = fresh("window");
    request(anon);
    await recordVisit();
    await recordVisit();
    const rows = await visitsFor(anon);
    expect(rows).toHaveLength(1);
  });

  it("opens a new visit once the window has passed", async () => {
    const anon = fresh("reopen");
    request(anon);
    await recordVisit();
    const db = createServiceClient();
    // Age the row past the 30-minute idle window rather than waiting for it.
    await db.from("visits").update({ last_seen_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq("anon_id", anon);
    await recordVisit();
    expect(await visitsFor(anon)).toHaveLength(2);
  });

  it("records nothing for a bot, and nothing without the anonymous cookie", async () => {
    const bot = fresh("bot");
    request(bot, { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" });
    await recordVisit();
    expect(await visitsFor(bot)).toHaveLength(0);

    const none = fresh("nocookie");
    request("");
    await recordVisit();
    expect(await visitsFor(none)).toHaveLength(0);
  });

  it("never hashes an address into the clear, and never stores one", async () => {
    const anon = fresh("ip");
    request(anon);
    await recordVisit();
    const [row] = await visitsFor(anon);
    // With no salt configured the column is null; with one it is a digest.
    if (row.ip_hash !== null) {
      expect(row.ip_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.ip_hash).not.toContain("203.0.113.9");
    }
  });

  it("records a milestone once, however many times it is called", async () => {
    const anon = fresh("step");
    request(anon);
    await recordVisit();
    const id = await currentVisitId();
    expect(id).toBeTruthy();
    await recordVisitStep("checkout");
    await recordVisitStep("checkout");
    const db = createServiceClient();
    const { data } = await db.from("visit_steps").select("id, step").eq("visit_id", id!);
    expect(data).toHaveLength(1);
    expect(data![0].step).toBe("checkout");
  });

  it("returns no visit id for a visitor who has none", async () => {
    request(fresh("empty"));
    expect(await currentVisitId()).toBeNull();
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  const { data } = await db.from("visits").select("id").in("anon_id", anonIds);
  for (const v of data ?? []) await db.from("visit_steps").delete().eq("visit_id", v.id);
  await db.from("visits").delete().in("anon_id", anonIds);
  void (await getStoreId());
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/visits.integration.test.ts`
Expected: FAIL — cannot resolve `@/lib/visits`.

- [ ] **Step 3: Write the module**

```ts
// lib/visits.ts
import "server-only";
import { cookies, headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { isBot } from "@/lib/traffic-source";
import { UTM_COOKIE, attributionFromCookie } from "@/lib/attribution";
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
    const anon = jar.get("gi_anon")?.value;
    // No cookie yet — this is the very first request, and the proxy's
    // Set-Cookie is on its way back. There is no id to key a visit on; the
    // next request has one.
    if (!anon) return;

    const path = h.get("x-pathname") ?? "/";
    const ref = foreignReferrer(h.get("referer"), process.env.NEXT_PUBLIC_SITE_URL);
    const attribution = attributionFromCookie(jar.get(UTM_COOKIE)?.value);

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
    const jar = await cookies();
    const anon = jar.get("gi_anon")?.value;
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
 */
export async function recordVisitStep(
  step: "checkout" | "upsell" | "purchase",
  opts: { orderId?: string | null; valueCents?: number | null; visitId?: string | null } = {},
): Promise<void> {
  try {
    const visitId = opts.visitId ?? (await currentVisitId());
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
```

- [ ] **Step 4: Wire the store layout**

In `app/(store)/layout.tsx`, add the import:

```ts
import { recordVisit } from "@/lib/visits";
```

and, immediately after the `const match = await pixelMatch().catch(() => null);` line, add:

```ts
  // Every store page is an entry point, which is the whole reason this sits in
  // the layout rather than in each page: page_counts only ever saw five paths
  // and never the home page at all. Not awaited — a record of a visit must
  // never delay one.
  void recordVisit();
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx tsc --noEmit && npx vitest run lib/visits.integration.test.ts`
Expected: tsc exit 0; all tests PASS.

- [ ] **Step 6: Run the FULL suite**

Run: `npx vitest run; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 7: Commit**

```bash
git add lib/visits.ts lib/visits.integration.test.ts "app/(store)/layout.tsx"
git commit -m "Record a visit from the store layout, so every page is an entry point

page_counts only ever saw five paths and never the home page, so a visitor
arriving from an outside site left no trace. This writes one visit per
visitor per 30-minute idle window, with the landing link, the referrer, the
campaign and the device, for everyone.

Swallows every error and is never awaited: it runs on pages that take money.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Milestones and `orders.visit_id`

**Files:**
- Modify: `app/(store)/checkout/page.tsx` (beside `void recordPageHit("/checkout", product.slug);`)
- Modify: `app/(store)/checkout/offer/page.tsx` (beside `void recordPageHit("/checkout/offer", offer.key);`)
- Modify: `app/(store)/checkout/oto/page.tsx` (beside `void recordOtoPageHit(...)`)
- Modify: `app/(store)/checkout/actions.ts`, `app/(store)/checkout/offer/actions.ts`
- Modify: `lib/checkout.ts`, `lib/offer-checkout.ts`
- Test: `lib/visits-milestones.integration.test.ts` (new)

**Interfaces:**
- Consumes: `recordVisitStep`, `currentVisitId` from Task 3.
- Produces: `CheckoutInput.visitId?: string | null`; `startOfferCheckout({ …, visitId })`; `orders.visit_id` written at both inserts; a `purchase` step written after an order is paid.

- [ ] **Step 1: Add the three page milestones**

In `app/(store)/checkout/page.tsx`, after the existing `void recordPageHit("/checkout", product.slug);`:

```ts
  // The same moment, on the visit rather than the day's tally. One says
  // "12 people reached a checkout today"; this says which visit did.
  void recordVisitStep("checkout");
```

In `app/(store)/checkout/offer/page.tsx`, after `void recordPageHit("/checkout/offer", offer.key);`:

```ts
  void recordVisitStep("checkout");
```

In `app/(store)/checkout/oto/page.tsx`, after `void recordOtoPageHit(verified.payload.orderId);`:

```ts
  void recordVisitStep("upsell");
```

Each file needs `import { recordVisitStep } from "@/lib/visits";`.

- [ ] **Step 2: Carry the visit id into order creation**

In `app/(store)/checkout/actions.ts`, beside the existing `const attribution = …` line:

```ts
  // Which visit this checkout belongs to, resolved here where the cookies
  // are, for the same reason anonId and attribution are.
  const visitId = await currentVisitId();
```

and add `visitId` to the `createCheckoutIntent({ … })` call. Import `currentVisitId` from `@/lib/visits`.

In `app/(store)/checkout/offer/actions.ts`, do the same and add `visitId` to the `startOfferCheckout({ … })` call.

In `lib/checkout.ts`, add to `CheckoutInput` after `attribution?: Attribution | null;`:

```ts
  /** The visit this checkout happened in, for the attribution screens. */
  visitId?: string | null;
```

and add `visit_id: input.visitId ?? null,` to BOTH `orders` inserts in `createCheckoutIntent` — the recurring branch's and the one-time branch's, beside the `...orderAttributionColumns(input.attribution),` line each already has.

In `lib/offer-checkout.ts`, add `visitId?: string | null;` to `startOfferCheckout`'s args, add `visitId: args.visitId ?? ""` into the `metadata` object it builds (Stripe metadata is strings), and in `completeOfferCheckout`'s `orders` insert add:

```ts
      // From the metadata we wrote at start: completion also runs from the
      // Stripe webhook, which has no cookies to resolve a visit from.
      visit_id: si.metadata?.visitId || null,
```

- [ ] **Step 3: Record the purchase milestone**

In `lib/checkout.ts`, inside `finalizeOrder`, in the same `try` that reports tracking (right after the `trackPurchase({...})` call), add:

```ts
    // The visit that produced the sale. Read off the order rather than the
    // request: finalizeOrder also runs from the Stripe webhook, where there
    // is no visitor.
    void recordVisitStep("purchase", {
      visitId: (order.visit_id as string | null) ?? null,
      orderId: order.id as string,
      valueCents: pi.amount,
    });
```

`COLUMNS` in that file must also select `visit_id` — add it to the string alongside `utm_first, utm_last, referrer`.

In `lib/offer-checkout.ts`, after the `orders` insert succeeds in `completeOfferCheckout`:

```ts
  void recordVisitStep("purchase", {
    visitId: (si.metadata?.visitId as string | undefined) || null,
    orderId: inserted!.id as string,
    valueCents: totalCents,
  });
```

- [ ] **Step 4: Write the failing test**

```ts
// lib/visits-milestones.integration.test.ts
import { describe, it, expect, afterAll, vi } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const REQ = vi.hoisted(() => ({ headers: new Map<string, string>(), cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => REQ.headers.get(k.toLowerCase()) ?? null }),
  cookies: async () => ({ get: (k: string) => (REQ.cookies.has(k) ? { value: REQ.cookies.get(k) } : undefined) }),
}));

const { recordVisit, currentVisitId, recordVisitStep } = await import("@/lib/visits");

const anonIds: string[] = [];

describe.skipIf(!canRun)("milestones on a visit (integration)", () => {
  it("keeps each milestone once and carries the order and its value on the purchase", async () => {
    const anon = `zz-ms-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    anonIds.push(anon);
    REQ.headers = new Map([["x-pathname", "/p/zz"], ["user-agent", "Mozilla/5.0 (Macintosh) Chrome/130.0 Safari/537.36"]]);
    REQ.cookies = new Map([["gi_anon", anon]]);
    await recordVisit();
    const visitId = await currentVisitId();

    await recordVisitStep("checkout");
    await recordVisitStep("upsell");
    await recordVisitStep("purchase", { visitId, orderId: null, valueCents: 4900 });
    await recordVisitStep("purchase", { visitId, orderId: null, valueCents: 9999 });

    const db = createServiceClient();
    const { data } = await db.from("visit_steps").select("step, value_cents").eq("visit_id", visitId!).order("step");
    expect(data!.map((s) => s.step).sort()).toEqual(["checkout", "purchase", "upsell"]);
    // The second purchase call must not overwrite the first with a different value.
    expect(data!.find((s) => s.step === "purchase")!.value_cents).toBe(4900);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  const { data } = await db.from("visits").select("id").in("anon_id", anonIds);
  for (const v of data ?? []) await db.from("visit_steps").delete().eq("visit_id", v.id);
  await db.from("visits").delete().in("anon_id", anonIds);
  void (await getStoreId());
});
```

- [ ] **Step 5: Run it, then the full suite**

Run: `npx vitest run lib/visits-milestones.integration.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npx vitest run; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 6: Commit**

```bash
git add "app/(store)/checkout" lib/checkout.ts lib/offer-checkout.ts lib/visits-milestones.integration.test.ts
git commit -m "Mark checkout, upsell and purchase on the visit that reached them

page_counts says twelve people reached a checkout today. This says which
visits did, and which of those bought. The purchase milestone reads its
visit off the order, because finalizeOrder also runs from the Stripe webhook
where there is no visitor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The rollups and the report reads

**Files:**
- Create: `supabase/migrations/0081_visit_rollups.sql`
- Create: `lib/visit-reports.ts`
- Create: `lib/visit-reports.test.ts`

**Interfaces:**
- Consumes: Task 2's tables.
- Produces:
  ```ts
  export type CampaignRow = { source: string; medium: string; campaign: string; adset: string; ad: string; visits: number; checkouts: number; orders: number; revenueCents: number };
  export type SourceRow = { key: string; visits: number; orders: number; revenueCents: number };
  export type VisitRow = { id: string; startedAt: string; landingPath: string; landingQuery: string | null; referrer: string | null; referrerHost: string | null; utmFirst: Record<string,string>; utmLast: Record<string,string>; device: string | null; browser: string | null; os: string | null; userAgent: string | null; steps: { step: string; at: string; orderId: string | null; valueCents: number | null }[] };
  export async function campaignRows(range: DayRange): Promise<CampaignRow[]>;
  export async function referrerRows(range: DayRange): Promise<SourceRow[]>;
  export async function landingRows(range: DayRange): Promise<SourceRow[]>;
  export async function recentVisits(range: DayRange, limit?: number): Promise<VisitRow[]>;
  export function outcomeOf(v: VisitRow): "bought" | "upsell" | "checkout" | "browsed";
  export function labelPairs(labels: Record<string,string>): { label: string; value: string }[];
  ```

- [ ] **Step 1: Write the rollup migration**

```sql
-- supabase/migrations/0081_visit_rollups.sql
--
-- Grouped in Postgres, not in Node. Pulling every visit row into the app to
-- group it in JavaScript is the version of this that stops working in six
-- months, and PostgREST truncates at 1000 rows silently while it does.

create or replace function visit_campaign_rollup(p_store uuid, p_from timestamptz, p_to timestamptz)
returns table (
  source text, medium text, campaign text, adset text, ad text,
  visits bigint, checkouts bigint, orders bigint, revenue_cents bigint
)
language sql stable
as $$
  select coalesce(nullif(v.utm_last->>'utm_source',''), 'direct')  as source,
         coalesce(nullif(v.utm_last->>'utm_medium',''), '—')       as medium,
         coalesce(nullif(v.utm_last->>'utm_campaign',''), '—')     as campaign,
         coalesce(nullif(v.utm_last->>'utm_adset',''), '—')        as adset,
         coalesce(nullif(v.utm_last->>'utm_content',''), '—')      as ad,
         count(distinct v.id)                                       as visits,
         count(distinct s_checkout.visit_id)                        as checkouts,
         count(distinct s_purchase.visit_id)                        as orders,
         coalesce(sum(s_purchase.value_cents), 0)                   as revenue_cents
    from visits v
    left join visit_steps s_checkout on s_checkout.visit_id = v.id and s_checkout.step = 'checkout'
    left join visit_steps s_purchase on s_purchase.visit_id = v.id and s_purchase.step = 'purchase'
   where v.store_id = p_store and v.started_at >= p_from and v.started_at < p_to
   group by 1,2,3,4,5;
$$;

create or replace function visit_referrer_rollup(p_store uuid, p_from timestamptz, p_to timestamptz)
returns table (key text, visits bigint, orders bigint, revenue_cents bigint)
language sql stable
as $$
  select coalesce(nullif(v.referrer_host,''), 'direct') as key,
         count(distinct v.id),
         count(distinct s.visit_id),
         coalesce(sum(s.value_cents), 0)
    from visits v
    left join visit_steps s on s.visit_id = v.id and s.step = 'purchase'
   where v.store_id = p_store and v.started_at >= p_from and v.started_at < p_to
   group by 1;
$$;

create or replace function visit_landing_rollup(p_store uuid, p_from timestamptz, p_to timestamptz)
returns table (key text, visits bigint, orders bigint, revenue_cents bigint)
language sql stable
as $$
  select v.landing_path as key,
         count(distinct v.id),
         count(distinct s.visit_id),
         coalesce(sum(s.value_cents), 0)
    from visits v
    left join visit_steps s on s.visit_id = v.id and s.step = 'purchase'
   where v.store_id = p_store and v.started_at >= p_from and v.started_at < p_to
   group by 1;
$$;
```

Apply it locally and reload PostgREST the same way Task 2 did.

- [ ] **Step 2: Write the failing test for the pure parts**

```ts
// lib/visit-reports.test.ts
import { describe, it, expect } from "vitest";
import { outcomeOf, labelPairs, type VisitRow } from "@/lib/visit-reports";

const visit = (steps: VisitRow["steps"]): VisitRow => ({
  id: "v1", startedAt: "2026-09-11T10:00:00Z", landingPath: "/", landingQuery: null,
  referrer: null, referrerHost: null, utmFirst: {}, utmLast: {},
  device: "desktop", browser: "Chrome", os: "macOS", userAgent: "ua", steps,
});

describe("outcomeOf", () => {
  it("reports the furthest point reached, not the last one recorded", () => {
    expect(outcomeOf(visit([]))).toBe("browsed");
    expect(outcomeOf(visit([{ step: "checkout", at: "", orderId: null, valueCents: null }]))).toBe("checkout");
    expect(outcomeOf(visit([{ step: "upsell", at: "", orderId: null, valueCents: null }, { step: "checkout", at: "", orderId: null, valueCents: null }]))).toBe("upsell");
    expect(outcomeOf(visit([{ step: "checkout", at: "", orderId: null, valueCents: null }, { step: "purchase", at: "", orderId: "o1", valueCents: 4900 }]))).toBe("bought");
  });
});

describe("labelPairs", () => {
  it("names each label in the order a reader expects, skipping the absent ones", () => {
    expect(labelPairs({ utm_campaign: "A", utm_source: "meta", utm_adset: "LAL" })).toEqual([
      { label: "Source", value: "meta" },
      { label: "Campaign", value: "A" },
      { label: "Ad set", value: "LAL" },
    ]);
  });
  it("returns nothing for an empty set", () => {
    expect(labelPairs({})).toEqual([]);
  });
});
```

- [ ] **Step 3: Write `lib/visit-reports.ts`**

```ts
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { UTM_KEYS } from "@/lib/attribution";
import type { DayRange } from "@/lib/traffic-funnel";

/**
 * Reading the visits back.
 *
 * Every aggregate is a Postgres function (migration 0081), never a group-by
 * in JavaScript over rows pulled through PostgREST — which truncates at 1000
 * silently and would quietly understate every number on these screens.
 */

export type CampaignRow = {
  source: string; medium: string; campaign: string; adset: string; ad: string;
  visits: number; checkouts: number; orders: number; revenueCents: number;
};
export type SourceRow = { key: string; visits: number; orders: number; revenueCents: number };
export type VisitStep = { step: string; at: string; orderId: string | null; valueCents: number | null };
export type VisitRow = {
  id: string; startedAt: string; landingPath: string; landingQuery: string | null;
  referrer: string | null; referrerHost: string | null;
  utmFirst: Record<string, string>; utmLast: Record<string, string>;
  device: string | null; browser: string | null; os: string | null; userAgent: string | null;
  steps: VisitStep[];
};

const SHORT: Record<string, string> = {
  utm_source: "Source", utm_medium: "Medium", utm_campaign: "Campaign",
  utm_adset: "Ad set", utm_content: "Ad", utm_term: "Term", utm_id: "Campaign id",
};

/** The labels a reader sees, in UTM_KEYS order rather than object order. */
export function labelPairs(labels: Record<string, string>): { label: string; value: string }[] {
  return UTM_KEYS.filter((k) => labels[k]).map((k) => ({ label: SHORT[k], value: labels[k] }));
}

/** The furthest point a visit reached. */
export function outcomeOf(v: VisitRow): "bought" | "upsell" | "checkout" | "browsed" {
  const has = (s: string) => v.steps.some((x) => x.step === s);
  if (has("purchase")) return "bought";
  if (has("upsell")) return "upsell";
  if (has("checkout")) return "checkout";
  return "browsed";
}

function bounds(range: DayRange): { from: string; to: string } {
  return {
    from: `${range.start}T00:00:00.000Z`,
    to: new Date(Date.parse(`${range.end}T00:00:00Z`) + 86_400_000).toISOString(),
  };
}

async function rollup<T>(fn: string, range: DayRange): Promise<T[]> {
  try {
    const { from, to } = bounds(range);
    const db = createServiceClient();
    const { data } = await db.rpc(fn, { p_store: await getStoreId(), p_from: from, p_to: to });
    return (data as T[]) ?? [];
  } catch {
    // Same rule as lib/traffic.ts: an admin screen that cannot count must
    // render empty, not throw.
    return [];
  }
}

export async function campaignRows(range: DayRange): Promise<CampaignRow[]> {
  const raw = await rollup<Record<string, unknown>>("visit_campaign_rollup", range);
  return raw
    .map((r) => ({
      source: String(r.source), medium: String(r.medium), campaign: String(r.campaign),
      adset: String(r.adset), ad: String(r.ad),
      visits: Number(r.visits), checkouts: Number(r.checkouts),
      orders: Number(r.orders), revenueCents: Number(r.revenue_cents),
    }))
    .sort((a, b) => b.visits - a.visits || a.campaign.localeCompare(b.campaign));
}

const sourceRows = (raw: Record<string, unknown>[]): SourceRow[] =>
  raw
    .map((r) => ({ key: String(r.key), visits: Number(r.visits), orders: Number(r.orders), revenueCents: Number(r.revenue_cents) }))
    .sort((a, b) => b.visits - a.visits || a.key.localeCompare(b.key));

export async function referrerRows(range: DayRange): Promise<SourceRow[]> {
  return sourceRows(await rollup<Record<string, unknown>>("visit_referrer_rollup", range));
}

export async function landingRows(range: DayRange): Promise<SourceRow[]> {
  return sourceRows(await rollup<Record<string, unknown>>("visit_landing_rollup", range));
}

/** The visit log. Bounded by `limit` because this one is not an aggregate. */
export async function recentVisits(range: DayRange, limit = 100): Promise<VisitRow[]> {
  try {
    const { from, to } = bounds(range);
    const db = createServiceClient();
    const { data } = await db
      .from("visits")
      .select("id, started_at, landing_path, landing_query, referrer, referrer_host, utm_first, utm_last, device, browser, os, user_agent, visit_steps(step, at, order_id, value_cents)")
      .eq("store_id", await getStoreId())
      .gte("started_at", from)
      .lt("started_at", to)
      .order("started_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map((v) => ({
      id: v.id as string,
      startedAt: v.started_at as string,
      landingPath: v.landing_path as string,
      landingQuery: (v.landing_query as string) ?? null,
      referrer: (v.referrer as string) ?? null,
      referrerHost: (v.referrer_host as string) ?? null,
      utmFirst: (v.utm_first as Record<string, string>) ?? {},
      utmLast: (v.utm_last as Record<string, string>) ?? {},
      device: (v.device as string) ?? null,
      browser: (v.browser as string) ?? null,
      os: (v.os as string) ?? null,
      userAgent: (v.user_agent as string) ?? null,
      steps: ((v.visit_steps as Record<string, unknown>[]) ?? []).map((s) => ({
        step: String(s.step), at: String(s.at),
        orderId: (s.order_id as string) ?? null,
        valueCents: (s.value_cents as number) ?? null,
      })),
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run the tests, then the full suite**

Run: `npx tsc --noEmit && npx vitest run lib/visit-reports.test.ts`
Expected: PASS.

Run: `npx vitest run; echo "exit=$?"` → `exit=0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0081_visit_rollups.sql lib/visit-reports.ts lib/visit-reports.test.ts
git commit -m "Aggregate visits in Postgres, and read them back in one place

Three rollup functions, because a group-by in JavaScript over rows pulled
through PostgREST silently truncates at 1000 and would understate every
number on these screens.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The Campaigns screen and the sidebar group

**Files:**
- Create: `app/admin/attribution/page.tsx`
- Create: `components/admin/campaign-table.tsx`
- Create: `components/admin/campaign-table.test.tsx`
- Modify: `components/admin/sidebar.tsx`

**Interfaces:**
- Consumes: `campaignRows`, `CampaignRow` from Task 5; `presetFrom`, `rangeOf`, `PRESETS`, `todayUtc` from `lib/traffic-funnel.ts` and `lib/traffic.ts`.
- Produces: `CampaignTable({ rows, sort, dir, hrefFor })`.

- [ ] **Step 1: Write the failing component test**

```tsx
// components/admin/campaign-table.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CampaignTable } from "@/components/admin/campaign-table";
import type { CampaignRow } from "@/lib/visit-reports";

const row = (over: Partial<CampaignRow> = {}): CampaignRow => ({
  source: "meta", medium: "paid_social", campaign: "AJ Sept Push", adset: "LAL Buyers", ad: "Testimonial Reel",
  visits: 140, checkouts: 21, orders: 7, revenueCents: 34300, ...over,
});

const html = (rows: CampaignRow[]) =>
  renderToStaticMarkup(<CampaignTable rows={rows} sort="visits" dir="desc" hrefFor={() => "#"} />);

describe("the campaigns table", () => {
  it("names the campaign, its ad set and its ad", () => {
    const out = html([row()]);
    expect(out).toContain("AJ Sept Push");
    expect(out).toContain("LAL Buyers");
    expect(out).toContain("Testimonial Reel");
  });

  it("shows the money as money, not as cents", () => {
    expect(html([row()])).toContain("$343.00");
  });

  it("shows direct traffic as its own row rather than dropping it", () => {
    const out = html([row({ source: "direct", medium: "—", campaign: "—", adset: "—", ad: "—", orders: 2 })]);
    expect(out).toContain("direct");
  });

  it("says so plainly when there is nothing yet, rather than drawing an empty table", () => {
    const out = html([]);
    expect(out).toContain("No visits in this range");
    expect(out).not.toContain("<tbody");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/admin/campaign-table.test.tsx`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Write the component**

```tsx
// components/admin/campaign-table.tsx
import Link from "next/link";
import { money } from "@/lib/money";
import { formatCount as n } from "@/lib/traffic-funnel";
import type { CampaignRow } from "@/lib/visit-reports";

/**
 * Every campaign, and what it was worth.
 *
 * Direct and referral traffic are rows like any other. A table that showed
 * only paid traffic could not tell you what share of the store paid traffic
 * actually is, which is the first question anybody asks of one.
 */
const COLUMNS = [
  { key: "visits", label: "Visits" },
  { key: "checkouts", label: "Checkout" },
  { key: "orders", label: "Orders" },
  { key: "revenue", label: "Revenue" },
] as const;

export type CampaignSort = (typeof COLUMNS)[number]["key"];

export function CampaignTable({
  rows, sort, dir, hrefFor,
}: {
  rows: CampaignRow[];
  sort: CampaignSort;
  dir: "asc" | "desc";
  hrefFor: (sort: CampaignSort, dir: "asc" | "desc") => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-5 py-10 text-center text-muted">
        No visits in this range yet. Visits are recorded from the day this shipped; nothing before it can be recovered.
      </p>
    );
  }
  const rate = (a: number, b: number) => (b === 0 ? "—" : `${Math.round((a / b) * 100)}%`);
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[62rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <Th>Campaign</Th>
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted">
                <Link href={hrefFor(c.key, sort === c.key && dir === "desc" ? "asc" : "desc")} className="hover:text-fg">
                  {c.label}
                  {sort === c.key ? (dir === "desc" ? " ↓" : " ↑") : ""}
                </Link>
              </th>
            ))}
            <Th right>To checkout</Th>
            <Th right>To order</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-b-0">
              <td className="px-3 py-2.5">
                <span className="font-medium">{r.campaign}</span>
                <span className="block text-xs text-muted">
                  {r.source} · {r.medium}
                  {r.adset !== "—" && <> · {r.adset}</>}
                  {r.ad !== "—" && <> · {r.ad}</>}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{n(r.visits)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{n(r.checkouts)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{n(r.orders)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{money(r.revenueCents, "usd")}</td>
              <td className="px-3 py-2.5 text-right text-xs text-muted tabular-nums">{rate(r.checkouts, r.visits)}</td>
              <td className="px-3 py-2.5 text-right text-xs text-muted tabular-nums">{rate(r.orders, r.checkouts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
```

- [ ] **Step 4: Write the page**

```tsx
// app/admin/attribution/page.tsx
import Link from "next/link";
import { campaignRows } from "@/lib/visit-reports";
import { CampaignTable, type CampaignSort } from "@/components/admin/campaign-table";
import { PRESETS, presetFrom, rangeOf } from "@/lib/traffic-funnel";
import { todayUtc } from "@/lib/traffic";

export const dynamic = "force-dynamic";

const SORTS: readonly CampaignSort[] = ["visits", "checkouts", "orders", "revenue"];
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined);

export default async function AttributionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preset = presetFrom(params);
  const range = rangeOf(preset, todayUtc());
  // Whitelisted, never parsed: an unrecognised value picks the default.
  const sortRaw = one(params.sort);
  const sort: CampaignSort = SORTS.includes(sortRaw as CampaignSort) ? (sortRaw as CampaignSort) : "visits";
  const dir = one(params.dir) === "asc" ? "asc" : "desc";

  const rows = await campaignRows(range);
  const key = (r: (typeof rows)[number]) =>
    sort === "revenue" ? r.revenueCents : sort === "orders" ? r.orders : sort === "checkouts" ? r.checkouts : r.visits;
  const shown = [...rows].sort((a, b) => (dir === "asc" ? key(a) - key(b) : key(b) - key(a)));

  const href = (over: Record<string, string>) => {
    const q = new URLSearchParams();
    if (preset !== "30") q.set("preset", preset);
    if (sort !== "visits") q.set("sort", sort);
    if (dir !== "desc") q.set("dir", dir);
    for (const [k, v] of Object.entries(over)) v ? q.set(k, v) : q.delete(k);
    const s = q.toString();
    return s ? `/admin/attribution?${s}` : "/admin/attribution";
  };

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">Campaigns</h1>
        <p className="max-w-3xl text-muted">
          Every visit recorded on the server, grouped by the campaign that brought it. Direct and referral
          traffic are rows here too, so the share that is paid is readable rather than assumed.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Link
            key={p.key}
            href={href({ preset: p.key === "30" ? "" : p.key })}
            aria-current={preset === p.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              preset === p.key ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted hover:border-fg hover:text-fg"
            }`}
          >
            {p.label}
          </Link>
        ))}
        <Link href="/admin/attribution/visits" className="ml-auto text-xs text-muted underline-offset-4 hover:underline">
          Every visit →
        </Link>
        <Link href="/admin/attribution/sources" className="text-xs text-muted underline-offset-4 hover:underline">
          Referrers and landing pages →
        </Link>
      </div>

      <CampaignTable
        rows={shown}
        sort={sort}
        dir={dir}
        hrefFor={(s, d) => href({ sort: s === "visits" ? "" : s, dir: d === "desc" ? "" : d })}
      />
    </div>
  );
}
```

- [ ] **Step 5: Add the sidebar group**

In `components/admin/sidebar.tsx`, add an icon to `ICON`:

```ts
  // A funnel: wide at the top, narrow at the bottom. Where traffic goes.
  attribution: "M3 4h18l-7 8v7l-4 2v-9L3 4Z",
```

and, in the Customers group, immediately after the Traffic item:

```ts
        // Traffic answers "how many". This answers "who from".
        { href: "/admin/attribution", label: "Attribution", icon: ICON.attribution },
```

- [ ] **Step 6: Run the tests and the full suite**

Run: `npx tsc --noEmit && npx vitest run components/admin/campaign-table.test.tsx`
Expected: PASS.

Run: `npx vitest run; echo "exit=$?"` → `exit=0`. Existing sidebar tests may pin the item list; update them to include Attribution rather than loosening what they assert.

- [ ] **Step 7: Commit**

```bash
git add app/admin/attribution/page.tsx components/admin/campaign-table.tsx components/admin/campaign-table.test.tsx components/admin/sidebar.tsx
git commit -m "Add the Campaigns screen: every campaign, its visits, its orders, its revenue

Direct and referral are rows like any other, because a table showing only
paid traffic cannot say what share of the store paid traffic is.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The visit log

**Files:**
- Create: `app/admin/attribution/visits/page.tsx`
- Create: `components/admin/visit-row.tsx`
- Create: `components/admin/visit-row.test.tsx`

**Interfaces:**
- Consumes: `recentVisits`, `VisitRow`, `outcomeOf`, `labelPairs` from Task 5.
- Produces: `VisitRowView({ visit })`, a client component with an expandable detail, matching `components/admin/order-row.tsx`'s shape.

- [ ] **Step 1: Write the failing component test**

```tsx
// components/admin/visit-row.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VisitRowView } from "@/components/admin/visit-row";
import type { VisitRow } from "@/lib/visit-reports";

const visit = (over: Partial<VisitRow> = {}): VisitRow => ({
  id: "v1",
  startedAt: "2026-09-11T10:04:00Z",
  landingPath: "/p/digital-product-validator",
  landingQuery: "utm_source=meta&fbclid=IwZXBRAND",
  referrer: "https://l.facebook.com/l.php?u=abc",
  referrerHost: "l.facebook.com",
  utmFirst: { utm_source: "instaparty" },
  utmLast: { utm_source: "meta", utm_campaign: "Spring Push", utm_adset: "LAL Buyers" },
  device: "phone", browser: "Safari", os: "iOS",
  userAgent: "Mozilla/5.0 (iPhone)",
  steps: [],
  ...over,
});

const html = (v: VisitRow) =>
  renderToStaticMarkup(<table><tbody><VisitRowView visit={v} /></tbody></table>);

describe("a visit row", () => {
  it("names the landing page and where it came from", () => {
    const out = html(visit());
    expect(out).toContain("/p/digital-product-validator");
    expect(out).toContain("Spring Push");
  });

  it("shows the referrer host when there is no campaign", () => {
    const out = html(visit({ utmLast: {}, utmFirst: {} }));
    expect(out).toContain("l.facebook.com");
  });

  it("says direct when there is neither", () => {
    const out = html(visit({ utmLast: {}, utmFirst: {}, referrer: null, referrerHost: null }));
    expect(out).toContain("direct");
  });

  it("reports the furthest point the visit reached", () => {
    expect(html(visit({ steps: [{ step: "purchase", at: "2026-09-11T10:09:00Z", orderId: "o1", valueCents: 4900 }] }))).toContain("$49.00");
    expect(html(visit({ steps: [{ step: "checkout", at: "2026-09-11T10:06:00Z", orderId: null, valueCents: null }] }))).toContain("checkout");
  });

  it("keeps the full link out of the row until it is asked for", () => {
    const out = html(visit());
    expect(out).not.toContain("fbclid=IwZXBRAND");
  });

  it("labels a seeded row rather than showing blank device columns", () => {
    const out = html(visit({ userAgent: null, device: null, browser: null, os: null }));
    expect(out).toContain("before visit tracking");
  });
});
```

- [ ] **Step 2: Run to verify it fails, then write the component**

```tsx
// components/admin/visit-row.tsx
"use client";

import { useState } from "react";
import { money } from "@/lib/money";
import { labelPairs, outcomeOf, type VisitRow } from "@/lib/visit-reports";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * One visit, and its detail only when asked for.
 *
 * The same shape as an order row, because it is the same job: scan a list,
 * find the one you are looking for, open it. The full landing link lives in
 * the detail rather than the row — it is the longest thing here and the
 * least often needed.
 */
export function VisitRowView({ visit }: { visit: VisitRow }) {
  const [open, setOpen] = useState(false);
  const last = labelPairs(visit.utmLast);
  const first = labelPairs(visit.utmFirst);
  const purchase = visit.steps.find((s) => s.step === "purchase");
  const outcome = outcomeOf(visit);
  const seeded = visit.userAgent === null;

  const cameFrom =
    visit.utmLast.utm_campaign || visit.utmLast.utm_source || visit.referrerHost || "direct";

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`cursor-pointer border-b border-border/60 transition-colors last:border-b-0 ${open ? "bg-surface-2" : "hover:bg-surface-2"}`}
      >
        <td className="px-3 py-2.5 text-sm text-muted">{when(visit.startedAt)}</td>
        <td className="px-3 py-2.5 text-sm">
          <span className="line-clamp-1">{visit.landingPath}</span>
        </td>
        <td className="px-3 py-2.5 text-sm text-muted">
          <span className="line-clamp-1">{cameFrom}</span>
        </td>
        <td className="px-3 py-2.5 text-xs text-muted">
          {seeded ? "before visit tracking" : `${visit.device} · ${visit.browser}`}
        </td>
        <td className="px-3 py-2.5 text-right text-sm">
          {purchase ? (
            <span className="font-medium tabular-nums">{money(purchase.valueCents ?? 0, "usd")}</span>
          ) : outcome === "browsed" ? (
            <span className="text-muted">—</span>
          ) : (
            <span className="text-muted">{outcome}</span>
          )}
        </td>
        <td className="pr-3 text-right text-xs text-muted">{open ? "⌄" : "›"}</td>
      </tr>

      {open && (
        <tr className="border-b border-border/60 bg-surface-2 last:border-b-0">
          <td colSpan={6} className="px-3 pb-3">
            <div className="flex flex-wrap items-start gap-x-10 gap-y-4 rounded-xl border border-border bg-surface p-4 text-xs">
              <div className="flex min-w-64 flex-1 flex-col gap-1">
                <span className="kicker text-muted">Landed on</span>
                <span className="break-all">
                  {visit.landingPath}
                  {visit.landingQuery ? `?${visit.landingQuery}` : ""}
                </span>
                {visit.referrer && (
                  <>
                    <span className="kicker mt-2 text-muted">Referrer</span>
                    <span className="break-all">{visit.referrer}</span>
                  </>
                )}
                {visit.userAgent && (
                  <>
                    <span className="kicker mt-2 text-muted">Browser</span>
                    <span className="break-all text-muted">{visit.userAgent}</span>
                  </>
                )}
              </div>

              <div className="flex min-w-48 flex-col gap-1">
                <span className="kicker text-muted">Last touch</span>
                {last.length === 0 ? <span className="text-muted">no campaign</span> : last.map((p) => (
                  <span key={p.label}>
                    <span className="text-muted">{p.label} </span>
                    {p.value}
                  </span>
                ))}
                {first.length > 0 && (
                  <>
                    <span className="kicker mt-2 text-muted">First touch</span>
                    {first.map((p) => (
                      <span key={p.label}>
                        <span className="text-muted">{p.label} </span>
                        {p.value}
                      </span>
                    ))}
                  </>
                )}
              </div>

              <div className="flex min-w-40 flex-col gap-1">
                <span className="kicker text-muted">What happened</span>
                {visit.steps.length === 0 ? (
                  <span className="text-muted">looked, and left</span>
                ) : (
                  [...visit.steps]
                    .sort((a, b) => a.at.localeCompare(b.at))
                    .map((s) => (
                      <span key={s.step}>
                        {s.step}
                        <span className="ml-2 text-muted">{when(s.at)}</span>
                      </span>
                    ))
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
```

- [ ] **Step 3: Write the page**

`app/admin/attribution/visits/page.tsx` renders a table with the header `When · Landed on · Came from · Device · Outcome · (chevron)`, maps `recentVisits(range, limit)` through `VisitRowView`, and carries the same preset tabs as Task 6. Copy the preset-tab block and the `href` helper from Task 6's page verbatim, changing only the base path to `/admin/attribution/visits`; the two pages having their own copy is cheaper than a shared component whose only job is a query string.

**The four filters the spec asks for**, all whitelisted against the values actually present in the loaded rows — never parsed, the same rule every other admin filter follows:

```ts
// Built from the rows on screen, so the URL can only name something real.
const campaignsPresent = [...new Set(all.map((v) => v.utmLast.utm_campaign).filter(Boolean))] as string[];
const hostsPresent = [...new Set(all.map((v) => v.referrerHost).filter(Boolean))] as string[];
const devicesPresent = [...new Set(all.map((v) => v.device).filter(Boolean))] as string[];
const OUTCOMES = ["bought", "upsell", "checkout", "browsed"] as const;

const pick = <T extends string>(raw: string | undefined, allowed: readonly T[]): T | "" =>
  (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : "";

const campaign = pick(one(params.campaign), campaignsPresent);
const host = pick(one(params.host), hostsPresent);
const device = pick(one(params.device), devicesPresent);
const outcome = pick(one(params.outcome), OUTCOMES);

const shown = all.filter((v) =>
  (!campaign || v.utmLast.utm_campaign === campaign) &&
  (!host || v.referrerHost === host) &&
  (!device || v.device === device) &&
  (!outcome || outcomeOf(v) === outcome));
```

`limit` is read the same way, whitelisted against `["100", "250", "500"]` with 100 the default, and is applied by `recentVisits(range, limit)` BEFORE the filters — so the four selects narrow the page you are looking at rather than silently searching the whole history. Say that on the screen in one line, or a reader will assume a filter searched everything.

Render the four as `<select>` elements inside the same GET form pattern `app/admin/orders/page.tsx` uses, with an "Any campaign" / "Any site" / "Any device" / "Any outcome" first option whose value is the empty string, plus a Clear link when any is set.

Empty state: "No visits in this range yet." When filters are set and nothing matches: "Nothing matches that. Widen the range, or clear the filters."

Add to `components/admin/visit-row.test.tsx`'s sibling — a small `lib/visit-filter.test.ts` — a test that an unrecognised value selects "all" and that each filter narrows independently, so the whitelist has a test that can fail:

```ts
import { describe, it, expect } from "vitest";
import { outcomeOf, type VisitRow } from "@/lib/visit-reports";

// The filter predicate, extracted to lib/visit-filter.ts so it can be tested
// without a page: `keepVisit(v, { campaign, host, device, outcome })`.
import { keepVisit } from "@/lib/visit-filter";

const v = (over: Partial<VisitRow>): VisitRow => ({
  id: "v", startedAt: "", landingPath: "/", landingQuery: null, referrer: null, referrerHost: null,
  utmFirst: {}, utmLast: {}, device: "phone", browser: "Safari", os: "iOS", userAgent: "ua", steps: [], ...over,
});

describe("keepVisit", () => {
  it("keeps everything when nothing is set", () => {
    expect(keepVisit(v({}), { campaign: "", host: "", device: "", outcome: "" })).toBe(true);
  });
  it("narrows on each field independently", () => {
    expect(keepVisit(v({ utmLast: { utm_campaign: "A" } }), { campaign: "A", host: "", device: "", outcome: "" })).toBe(true);
    expect(keepVisit(v({ utmLast: { utm_campaign: "A" } }), { campaign: "B", host: "", device: "", outcome: "" })).toBe(false);
    expect(keepVisit(v({ referrerHost: "x.test" }), { campaign: "", host: "x.test", device: "", outcome: "" })).toBe(true);
    expect(keepVisit(v({ device: "desktop" }), { campaign: "", host: "", device: "phone", outcome: "" })).toBe(false);
    expect(keepVisit(v({ steps: [{ step: "purchase", at: "", orderId: null, valueCents: 1 }] }), { campaign: "", host: "", device: "", outcome: "bought" })).toBe(true);
    expect(keepVisit(v({ steps: [] }), { campaign: "", host: "", device: "", outcome: "bought" })).toBe(false);
  });
});
```

`lib/visit-filter.ts` holds only that predicate and its type, so the page keeps the whitelisting and the module keeps the matching:

```ts
import { outcomeOf, type VisitRow } from "@/lib/visit-reports";

export type VisitFilter = { campaign: string; host: string; device: string; outcome: string };

export function keepVisit(v: VisitRow, f: VisitFilter): boolean {
  if (f.campaign && v.utmLast.utm_campaign !== f.campaign) return false;
  if (f.host && v.referrerHost !== f.host) return false;
  if (f.device && v.device !== f.device) return false;
  if (f.outcome && outcomeOf(v) !== f.outcome) return false;
  return true;
}
```

- [ ] **Step 4: Run the tests and the full suite, then commit**

```bash
git add app/admin/attribution/visits components/admin/visit-row.tsx components/admin/visit-row.test.tsx lib/visit-filter.ts lib/visit-filter.test.ts
git commit -m "Add the visit log: what each visitor landed on, from where, and how far they got

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Referrers and landing pages

**Files:**
- Create: `app/admin/attribution/sources/page.tsx`
- Create: `components/admin/source-table.tsx`
- Create: `components/admin/source-table.test.tsx`

**Interfaces:**
- Consumes: `referrerRows`, `landingRows`, `SourceRow` from Task 5.
- Produces: `SourceTable({ title, nameHeader, rows, rank })`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/admin/source-table.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceTable } from "@/components/admin/source-table";
import type { SourceRow } from "@/lib/visit-reports";

const rows: SourceRow[] = [
  { key: "l.facebook.com", visits: 120, orders: 4, revenueCents: 19600 },
  { key: "direct", visits: 80, orders: 1, revenueCents: 4900 },
  { key: "news.ycombinator.com", visits: 12, orders: 0, revenueCents: 0 },
];

const html = (rank: "visits" | "orders") =>
  renderToStaticMarkup(<SourceTable title="Referrers" nameHeader="Site" rows={rows} rank={rank} />);

describe("the source table", () => {
  it("ranks by visits, busiest first", () => {
    const out = html("visits");
    expect(out.indexOf("l.facebook.com")).toBeLessThan(out.indexOf("direct"));
    expect(out.indexOf("direct")).toBeLessThan(out.indexOf("news.ycombinator.com"));
  });

  it("re-ranks by orders when asked, which is a different order", () => {
    const out = html("orders");
    expect(out.indexOf("l.facebook.com")).toBeLessThan(out.indexOf("direct"));
    expect(out.indexOf("news.ycombinator.com")).toBeGreaterThan(out.indexOf("direct"));
  });

  it("shows revenue as money and keeps direct as a row", () => {
    const out = html("visits");
    expect(out).toContain("$196.00");
    expect(out).toContain("direct");
  });

  it("says so when empty", () => {
    expect(renderToStaticMarkup(<SourceTable title="Referrers" nameHeader="Site" rows={[]} rank="visits" />)).toContain("Nothing yet");
  });
});
```

- [ ] **Step 2: Write the component and the page**

`SourceTable` renders a heading, then a table of `nameHeader · Visits · Orders · Revenue`, sorted by `rank` then by key. The page renders two of them side by side on wide screens and stacked below `md`, with the same preset tabs, and a `rank` toggle whitelisted against `["visits", "orders"]`.

- [ ] **Step 3: Run the tests and the full suite, then commit**

```bash
git add app/admin/attribution/sources components/admin/source-table.tsx components/admin/source-table.test.tsx
git commit -m "Add the referrers and landing-pages report, with direct as a row

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Open attribution on the order

**Files:**
- Modify: `components/admin/attribution-popover.tsx`
- Modify: `components/admin/order-row.tsx`
- Modify: `lib/orders.ts`
- Modify: `components/admin/attribution-popover.test.tsx`

**Interfaces:**
- Consumes: `labelPairs` from Task 5.
- Produces: `OrderRow.visitId: string | null`; `AttributionBlock` gains `layout?: "compact" | "open"`.

- [ ] **Step 1: Write the failing test**

Add to `components/admin/attribution-popover.test.tsx`:

```tsx
describe("the open layout on an expanded order", () => {
  it("lays last touch and first touch out side by side, both named", () => {
    const out = renderToStaticMarkup(
      <AttributionBlock
        layout="open"
        order={{
          ...base,
          utmLast: { utm_source: "meta", utm_campaign: "Spring Push", utm_adset: "LAL Buyers" },
          utmFirst: { utm_source: "instaparty", utm_campaign: "Winter B" },
          referrer: "https://l.facebook.com/l.php",
        }}
      />,
    );
    expect(out).toContain("Last touch");
    expect(out).toContain("First touch");
    expect(out).toContain("Spring Push");
    expect(out).toContain("instaparty");
  });

  it("links to the visit when the order has one", () => {
    const out = renderToStaticMarkup(
      <AttributionBlock layout="open" order={{ ...base, visitId: "v-123", utmLast: { utm_source: "meta" } }} />,
    );
    expect(out).toContain("/admin/attribution/visits");
  });

  it("does not draw the link when the order predates visit tracking", () => {
    const out = renderToStaticMarkup(<AttributionBlock layout="open" order={{ ...base, visitId: null, utmLast: { utm_source: "meta" } }} />);
    expect(out).not.toContain("/admin/attribution/visits");
  });
});
```

`base` in that file must gain `visitId: null`.

- [ ] **Step 2: Implement**

`lib/orders.ts`: add `visitId: string | null` to `OrderRow`, add `visit_id` to the `listOrders` select, and map it.

`AttributionBlock` takes `layout` defaulting to `"compact"`. In `"open"` it renders two labelled columns — "Last touch" and "First touch" — using `labelPairs`, plus the referrer, plus a "See the visit" link to `/admin/attribution/visits` when `order.visitId` is set. The compact layout is unchanged, because the pill popover still uses it.

`order-row.tsx`: the expanded row passes `layout="open"`.

- [ ] **Step 3: Run the tests and the full suite, then commit**

```bash
git add components/admin/attribution-popover.tsx components/admin/attribution-popover.test.tsx components/admin/order-row.tsx lib/orders.ts
git commit -m "Lay an order's attribution out openly in its expanded row

The pill's popover stays for scanning. The expanded row now shows both label
sets side by side, the referrer, and a link to the visit that produced the
sale, because the owner asked for the attribution to be open rather than one
click away.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Pruning, docs and the lesson

**Files:**
- Create: `app/api/cron/prune-visits/route.ts`
- Modify: `docs/products-and-offers.md`, `docs/lessons.md`, `docs/DATABASE.md`

- [ ] **Step 1: Write the prune route**

Copy the authorisation block from `app/api/cron/retry/route.ts` verbatim — `CRON_SECRET`, bearer, 503 when unconfigured, 401 when wrong. The body deletes `visits` older than 400 days (`visit_steps` follows by cascade) and returns `{ ok: true, deleted }`.

- [ ] **Step 2: Document it**

In `docs/products-and-offers.md`, extend the campaign section written by the previous branch with a paragraph on where visits come from and what the four screens answer. In `docs/DATABASE.md`, note that `prune-visits` must be wired to a schedule by the owner and that nothing prunes until it is.

- [ ] **Step 3: Write the lesson**

Append to `docs/lessons.md`, in the house shape:

```markdown
**2026-09-11 — the tracking was real and the owner still could not see it.**
The previous branch put campaign labels on orders, into Stripe, and onto Meta
and GA4 events. Every one of those worked. The owner opened the admin and saw
`direct` on every row, because the labels only start at the moment of capture
and every order on screen predated it — and because the only page that showed
them at all put them behind a click. Rule: a tracking feature is not shipped
when the data is correct, it is shipped when somebody can find the answer
without being told where to look. Ship the screen in the same push as the
capture, and say on the screen itself which day the data starts.
```

- [ ] **Step 4: Full suite, typecheck, commit**

```bash
git add app/api/cron/prune-visits docs/
git commit -m "Add the visit prune route, document the capture, record the lesson

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Deploy order (for the controller, after the final review)

1. Apply `0080_visits.sql` and `0081_visit_rollups.sql` to production by hand, in that order.
2. `notify pgrst, 'reload schema';`
3. Verify through the API that `visits` is served and `record_visit` is callable.
4. Set `ATTRIBUTION_IP_SALT` in Coolify to a long random value. Until it is set, `ip_hash` stays null, which is the safe failure and not an error.
5. Announce, wait the full 60 seconds, push.
6. Watch CI, confirm the container tag, then load `/admin/attribution` and confirm a visit appears for your own load.
7. Tell the owner to wire `prune-visits` to the same schedule as `retry`, and that visits start from today — nothing before it can be recovered beyond the 164 seeded rows.
