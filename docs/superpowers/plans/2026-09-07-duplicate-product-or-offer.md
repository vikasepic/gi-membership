# Duplicate a product or an offer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Duplicate action on any product or offer that copies the record, its prices, its sales page and its page settings into a new draft at a slug the person chooses.

**Architecture:** One pure module decides what a duplicated row looks like (which columns carry, which are dropped, how price-id arrays are remapped). One server-side module does the writes, reusing the existing `copyPage` for sections. One server action and one small client dialog sit on top.

**Tech Stack:** Next.js 15 server actions, Supabase via `createServiceClient`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-duplicate-product-or-offer-design.md`

## Global Constraints

- The copy arrives **draft** (`products.status = 'draft'`) and **inactive** (`offers.active = false`), whatever the original was.
- **No Stripe ids carry.** `stripe_product_id_test`, `stripe_price_id_test`, `stripe_product_id_live`, `stripe_price_id_live` are empty on the copy. Sharing one would point two records at one Stripe object.
- **Price-id arrays must be remapped**, never copied: `offers.page_price_ids`, `products.bump_price_ids`, `products.upsell_price_ids`. They are jsonb with no foreign key, so a stale id writes cleanly and breaks silently. An id with no counterpart is **dropped**.
- Archived prices are copied too.
- Ownership, orders, order items and trial history are never copied.
- The record is created FIRST; everything after it is best-effort and reported. Copying sections first would orphan `page_sections` rows, which nothing in the admin can see — that join is by convention, not by foreign key.
- Key/slug validation uses the rule the record already has and is checked before anything is written.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/duplicate.ts` (create) | Pure: which columns carry, and the price-id remap. No I/O. |
| `lib/duplicate-write.ts` (create) | `server-only`. The writes, in order, reusing `copyPage`. |
| `app/admin/duplicate-actions.ts` (create) | One server action for both kinds. |
| `components/admin/duplicate-button.tsx` (create) | The dialog that asks for the slug. |
| `app/admin/products/[id]/page.tsx`, `app/admin/offers/[id]/page.tsx` (modify) | Mount the button. |

---

## Task 1: What a duplicated row looks like

**Files:**
- Create: `lib/duplicate.ts`
- Test: `lib/duplicate.test.ts`

**Interfaces:**
- Produces:
  - `export const DROPPED_COLUMNS: readonly string[]` — id, timestamps and the four Stripe columns.
  - `export function duplicateRow(row: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown>` — the source row minus the dropped columns, with `over` applied on top.
  - `export function remapPriceIds(value: unknown, byOldId: Map<string, string>): string[]` — an array of price ids rewritten to the copy's, dropping any without a counterpart. Returns `[]` for anything that is not an array of strings.

- [ ] **Step 1: Write the failing test**

Create `lib/duplicate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { duplicateRow, remapPriceIds, DROPPED_COLUMNS } from "@/lib/duplicate";

describe("what carries into a duplicate", () => {
  it("keeps the fields that describe the thing", () => {
    const out = duplicateRow(
      { id: "old", title: "Guide", price_cents: 1100, bump_offer_id: "off1" },
      { slug: "guide-copy" },
    );
    expect(out).toMatchObject({ title: "Guide", price_cents: 1100, bump_offer_id: "off1", slug: "guide-copy" });
  });

  it("drops the identity and the timestamps", () => {
    const out = duplicateRow({ id: "old", created_at: "x", updated_at: "y", title: "t" }, {});
    expect(out).not.toHaveProperty("id");
    expect(out).not.toHaveProperty("created_at");
    expect(out).not.toHaveProperty("updated_at");
  });

  it("drops every Stripe id", () => {
    // Two records pointing at one Stripe object means the first sale through
    // either rewrites the other's. The copy makes its own on first sale.
    const out = duplicateRow(
      {
        title: "t",
        stripe_product_id_test: "prod_a",
        stripe_price_id_test: "price_a",
        stripe_product_id_live: "prod_b",
        stripe_price_id_live: "price_b",
      },
      {},
    );
    for (const k of ["stripe_product_id_test", "stripe_price_id_test", "stripe_product_id_live", "stripe_price_id_live"]) {
      expect(out).not.toHaveProperty(k);
    }
  });

  it("lets the caller override anything, including a dropped column", () => {
    expect(duplicateRow({ id: "old", status: "published" }, { status: "draft" })).toEqual({ status: "draft" });
  });

  it("names every dropped column once", () => {
    expect(new Set(DROPPED_COLUMNS).size).toBe(DROPPED_COLUMNS.length);
  });
});

describe("price ids inside a duplicated record", () => {
  const map = new Map([["p1", "n1"], ["p2", "n2"]]);

  it("points them at the copy's own prices", () => {
    // The whole reason this function exists. These arrays are jsonb with no
    // foreign key, so a stale id writes cleanly and the copy's page then
    // offers the ORIGINAL's prices — no error, anywhere.
    expect(remapPriceIds(["p1", "p2"], map)).toEqual(["n1", "n2"]);
  });

  it("drops an id with no counterpart rather than carrying it", () => {
    expect(remapPriceIds(["p1", "gone"], map)).toEqual(["n1"]);
  });

  it("keeps the order the page was built in", () => {
    expect(remapPriceIds(["p2", "p1"], map)).toEqual(["n2", "n1"]);
  });

  it("treats anything that is not a list of ids as empty", () => {
    for (const bad of [null, undefined, {}, "p1", [1, 2], [{ id: "p1" }]]) {
      expect(remapPriceIds(bad, map)).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/duplicate.test.ts`
Expected: FAIL — cannot resolve `@/lib/duplicate`.

- [ ] **Step 3: Write the module**

Create `lib/duplicate.ts`:

```ts
/**
 * What a duplicated record is made of.
 *
 * Pure, so the rules about what carries can be read and tested without a
 * database. The writes live in lib/duplicate-write.ts.
 */

/**
 * Columns a copy never inherits.
 *
 * The identity and the timestamps because it is a new row. The Stripe ids
 * because a duplicate is NOT the same product to Stripe — two records sharing
 * one Stripe object means the first sale through either rewrites the other's,
 * and neither would look wrong until it did.
 */
export const DROPPED_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "stripe_product_id_test",
  "stripe_price_id_test",
  "stripe_product_id_live",
  "stripe_price_id_live",
] as const satisfies readonly string[];

/** The source row minus what a copy never inherits, with `over` on top. */
export function duplicateRow(
  row: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if ((DROPPED_COLUMNS as readonly string[]).includes(k)) continue;
    out[k] = v;
  }
  return { ...out, ...over };
}

/**
 * An array of price ids, pointed at the copy's own prices.
 *
 * `offers.page_price_ids`, `products.bump_price_ids` and `upsell_price_ids`
 * name price rows by id. The copy's prices are new rows with new ids, so
 * carrying these across leaves the duplicate offering the ORIGINAL's prices —
 * and because they are jsonb with no foreign key, that writes cleanly and
 * fails silently.
 *
 * An id with no counterpart is dropped: a missing option is a visible problem,
 * a dangling one is not.
 */
export function remapPriceIds(value: unknown, byOldId: Map<string, string>): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const mapped = byOldId.get(v);
    if (mapped) out.push(mapped);
  }
  return out;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/duplicate.test.ts`
Expected: PASS, 9 cases.

- [ ] **Step 5: Commit**

```bash
git add lib/duplicate.ts lib/duplicate.test.ts
git commit -m "Decide what a duplicated record carries"
```

---

## Task 2: Doing the writes

**Files:**
- Create: `lib/duplicate-write.ts`
- Test: `lib/duplicate.integration.test.ts`

**Interfaces:**
- Consumes: `duplicateRow`, `remapPriceIds` from Task 1; `copyPage(from, to)` from `lib/pages.ts`.
- Produces:

```ts
export type DuplicateResult = { id: string; warnings: string[] };
export async function duplicateProduct(id: string, slug: string): Promise<DuplicateResult>;
export async function duplicateOffer(id: string, key: string): Promise<DuplicateResult>;
```

**Order matters and is not arbitrary.** Create the record, then the prices, then remap the id arrays onto the record, then sections, then page settings. Sections last-but-one because a failure there leaves rows keyed on `(owner_type, owner_id)` — a join by convention with no foreign key, so nothing in the admin can find or clean them. A half-copied record is visible and deletable; orphaned sections are not.

Everything after the record insert is best-effort: catch, push a sentence onto `warnings`, carry on. The caller reports them.

- [ ] **Step 1: Write the failing test**

Create `lib/duplicate.integration.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { duplicateOffer } from "@/lib/duplicate-write";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const made: string[] = [];

describe.skipIf(!canRun)("duplicating an offer (integration)", () => {
  afterEach(async () => {
    const db = createServiceClient();
    for (const id of made.splice(0)) {
      await db.from("offer_prices").delete().eq("offer_id", id);
      await db.from("page_sections").delete().eq("owner_type", "offer").eq("owner_id", id);
      await db.from("page_settings").delete().eq("owner_type", "offer").eq("owner_id", id);
      await db.from("offers").delete().eq("id", id);
    }
  });

  async function original() {
    const db = createServiceClient();
    const id = crypto.randomUUID();
    made.push(id);
    const { error } = await db.from("offers").insert({
      id,
      store_id: await getStoreId(),
      key: `zz-dup-src-${id}`,
      name: "zz source",
      grant_type: "subscription",
      grant_app_id: APP,
      grant_entitlement_key: "content-engine",
      grant_channels: ["instagram"],
      billing_type: "recurring",
      interval: "month",
      price_cents: 2900,
      currency: "usd",
      headline: "h",
      description: "d",
      active: true,
      stripe_product_id_live: "prod_MUSTNOTCARRY",
    });
    if (error) throw new Error(`fixture offer: ${error.message}`);

    const priceIds: string[] = [];
    for (const [i, cents] of [2900, 19900].entries()) {
      const pid = crypto.randomUUID();
      priceIds.push(pid);
      const { error: pe } = await db.from("offer_prices").insert({
        id: pid,
        offer_id: id,
        billing_type: "recurring",
        interval: i === 0 ? "month" : "year",
        interval_count: 1,
        price_cents: cents,
        sort_order: i,
        archived: i === 1,
      });
      if (pe) throw new Error(`fixture price: ${pe.message}`);
    }
    // The page offers both, named by id — the array that must be remapped.
    await db.from("offers").update({ page_price_ids: priceIds }).eq("id", id);
    return { id, priceIds };
  }

  it("copies the record without its Stripe id, and switched off", async () => {
    const src = await original();
    const { id: copyId } = await duplicateOffer(src.id, `zz-dup-copy-${crypto.randomUUID()}`);
    made.push(copyId);

    const db = createServiceClient();
    const { data } = await db
      .from("offers")
      .select("name, price_cents, grant_channels, active, stripe_product_id_live")
      .eq("id", copyId)
      .single();
    expect(data).toMatchObject({ name: "zz source", price_cents: 2900, active: false });
    expect(data!.grant_channels).toEqual(["instagram"]);
    // Two records on one Stripe object means the first sale rewrites the other.
    expect(data!.stripe_product_id_live).toBeNull();
  });

  it("copies every price, archived ones included, with new ids", async () => {
    const src = await original();
    const { id: copyId } = await duplicateOffer(src.id, `zz-dup-copy-${crypto.randomUUID()}`);
    made.push(copyId);

    const db = createServiceClient();
    const { data } = await db.from("offer_prices").select("id, price_cents, archived").eq("offer_id", copyId);
    expect(data).toHaveLength(2);
    expect(data!.map((p) => p.price_cents).sort()).toEqual([2900, 19900]);
    expect(data!.some((p) => p.archived)).toBe(true);
    for (const p of data!) expect(src.priceIds).not.toContain(p.id);
  });

  it("points page_price_ids at the COPY's prices, not the original's", async () => {
    // The silent one. These are jsonb with no foreign key, so carrying the old
    // ids writes cleanly and the copy's page then sells the original's prices.
    const src = await original();
    const { id: copyId } = await duplicateOffer(src.id, `zz-dup-copy-${crypto.randomUUID()}`);
    made.push(copyId);

    const db = createServiceClient();
    const { data: copy } = await db.from("offers").select("page_price_ids").eq("id", copyId).single();
    const { data: prices } = await db.from("offer_prices").select("id").eq("offer_id", copyId);

    const own = new Set((prices ?? []).map((p) => p.id as string));
    const listed = (copy!.page_price_ids ?? []) as string[];
    expect(listed).toHaveLength(2);
    for (const id of listed) expect(own.has(id)).toBe(true);
    for (const id of listed) expect(src.priceIds).not.toContain(id);
  });

  it("refuses a key already in use, before writing anything", async () => {
    const src = await original();
    const db = createServiceClient();
    const { data: existing } = await db.from("offers").select("key").eq("id", src.id).single();
    await expect(duplicateOffer(src.id, existing!.key as string)).rejects.toThrow();
    const { count } = await db
      .from("offers")
      .select("id", { count: "exact", head: true })
      .eq("store_id", await getStoreId())
      .eq("key", existing!.key as string);
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/duplicate.integration.test.ts`
Expected: FAIL — cannot resolve `@/lib/duplicate-write`.

If every case is SKIPPED, run `set -a; source .env.local; set +a` first. Do not proceed on a skipped suite.

- [ ] **Step 3: Write the module**

Create `lib/duplicate-write.ts`. It must:

1. Read the source row (`offers` or `products`) by id, scoped to the store. Throw a sentence if it is missing.
2. Refuse a key/slug already in use, **before any write**, by selecting for it — a friendly sentence, not a constraint violation.
3. Insert the new record with `duplicateRow(source, { key, active: false })` for an offer, or `{ slug, status: "draft" }` for a product. Let the database mint the id and read it back.
4. Copy the price rows, building `byOldId: Map<string, string>` as it goes. Archived rows included. Each copy uses `duplicateRow(price, { offer_id: newId })` — or `product_id` — so `id` and the timestamps are dropped for free.
5. Update the new record's price-id arrays through `remapPriceIds`: `page_price_ids` for an offer; `bump_price_ids` and `upsell_price_ids` for a product.
6. `copyPage({ ownerType, ownerId: sourceId }, { ownerType, ownerId: newId })`. It throws when the source has no sections — that is not a failure, it is a record without a page, so catch it and carry on without a warning.
7. Copy `page_settings` — `custom_css`, `custom_js`, `snippets`, `meta_title`, `meta_description`, `share_image_path` — if the source has a row.

Steps 4 to 7 are best-effort: catch each, push a plain sentence onto `warnings`, keep going. Step 3 is not — if the record cannot be created there is nothing to report against.

Return `{ id: newId, warnings }`.

Both functions share almost everything; write one internal helper parameterised by the table names and the key column rather than two near-copies, but keep `duplicateProduct` and `duplicateOffer` as the exported names so the call sites read plainly.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/duplicate.integration.test.ts`
Expected: PASS, 4 cases, nothing skipped.

- [ ] **Step 5: Typecheck and full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean, green.

- [ ] **Step 6: Commit**

```bash
git add lib/duplicate-write.ts lib/duplicate.integration.test.ts
git commit -m "Copy a record, its prices, its page and its settings"
```

---

## Task 3: The action and the button

**Files:**
- Create: `app/admin/duplicate-actions.ts`
- Create: `components/admin/duplicate-button.tsx`
- Modify: `app/admin/products/[id]/page.tsx`, `app/admin/offers/[id]/page.tsx`
- Test: `components/admin/duplicate-button.test.tsx`

**Interfaces:**
- Consumes: `duplicateProduct`, `duplicateOffer` from Task 2; `offerKeyProblem` from `lib/offer-key.ts`.
- Produces: `duplicateAction(prev, formData)` and `DuplicateButton({ kind, id, currentKey })`.

The action calls `requireAdmin()` first, validates the slug with the rule that record already has, calls the right writer, then `redirect`s to the copy's editor so the person lands on the new record.

The dialog is closed by default and asks for one field, pre-filled with `<current>-copy`. It validates as you type with the same function the server uses, so the rule cannot say one thing in the box and another on submit.

- [ ] **Step 1: Write the failing test**

Create `components/admin/duplicate-button.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DuplicateButton } from "@/components/admin/duplicate-button";

describe("duplicating from the editor", () => {
  it("suggests a key rather than making the person invent one", () => {
    const html = renderToStaticMarkup(
      <DuplicateButton kind="offer" id="o1" currentKey="content-engine" />,
    );
    expect(html).toContain("content-engine-copy");
  });

  it("carries which record is being copied", () => {
    const html = renderToStaticMarkup(<DuplicateButton kind="offer" id="o1" currentKey="x" />);
    expect(html).toContain('value="o1"');
    expect(html).toContain('value="offer"');
  });

  it("says the copy arrives switched off", () => {
    // Otherwise the first thing anyone does is wonder whether they have just
    // put a half-finished duplicate of their best seller on the storefront.
    const html = renderToStaticMarkup(<DuplicateButton kind="product" id="p1" currentKey="guide" />);
    expect(html).toMatch(/draft|switched off|not live/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run components/admin/duplicate-button.test.tsx`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Write the action and the component**

Follow `components/admin/copy-page.tsx` for the disclosure-and-confirm shape and `components/admin/offer-link-form.tsx` for the validate-as-you-type shape — both already exist and both are the house pattern. Use `inputClass` from `components/admin/form-controls`.

Mount `DuplicateButton` on both editor pages, near the existing destructive controls rather than beside the everyday ones.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run components/admin/duplicate-button.test.tsx`
Expected: PASS, 3 cases.

- [ ] **Step 5: Typecheck and full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean, green.

- [ ] **Step 6: Commit**

```bash
git add app/admin/duplicate-actions.ts components/admin/duplicate-button.tsx components/admin/duplicate-button.test.tsx app/admin/products app/admin/offers
git commit -m "Put Duplicate on the product and offer editors"
```

---

## Self-Review

**Spec coverage:** the record copy (T1, T2), dropped Stripe ids (T1, asserted), draft/inactive (T2, asserted), prices including archived (T2, asserted), the price-id remap (T1 pure, T2 end-to-end), sections via `copyPage` (T2), page settings (T2), key asked up front and validated before writing (T2 refusal test, T3 dialog), lands in the editor (T3), best-effort ordering (T2 step 3), nothing about ownership or orders (nothing copies them). No gaps.

**Placeholders:** T2 Step 3 and T3 Step 3 describe rather than transcribe. Both name every file, every function, the exact order and the exact reason for it — the alternative was inventing code against columns the implementer must read anyway.

**Type consistency:** `DuplicateResult` is `{ id, warnings }` in both writers and in the action. `remapPriceIds(value, byOldId)` takes `unknown` and returns `string[]` at both call sites. `duplicateRow(row, over)` is used for the record and for each price.
