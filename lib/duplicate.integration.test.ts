import { describe, it, expect, afterEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { duplicateOffer, duplicateProduct } from "@/lib/duplicate-write";
import {
  getPageSections,
  getPageSettings,
  hasPageSections,
  savePageSettings,
  saveSection,
} from "@/lib/pages";

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
    // Numerically. A bare .sort() compares as text, so 19900 lands before
    // 2900 and this can never hold whatever the code does.
    expect(data!.map((p) => p.price_cents).sort((a, b) => a - b)).toEqual([2900, 19900]);
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

  it("re-points a Ways to pay block's price ids, and leaves another offer's alone", async () => {
    // The same stale-id problem as page_price_ids, one level deeper: these ids
    // live inside page_sections.content, which copyPage carries verbatim. A
    // page curated to show the yearly only then names prices the copy does not
    // have, and chosenPrices answers that with the whole live menu.
    const src = await original();
    const other = await original();
    await saveSection("offer", src.id, "hero", {
      enabled: true,
      style: "light",
      accent: null,
      variant: null,
      content: {
        blocks: [
          {
            id: "b-own",
            type: "prices",
            // Blank: "whatever this page is selling", i.e. this offer's prices.
            props: { offerId: "", priceIds: [src.priceIds[0]] },
            style: {},
          },
          {
            id: "b-row",
            type: "row",
            props: {},
            style: {},
            // A prices block is as likely to be inside a column as beside one.
            columns: [
              [
                {
                  id: "b-nested",
                  type: "prices",
                  props: { offerId: "", priceIds: [src.priceIds[1]] },
                  style: {},
                },
              ],
              [
                {
                  id: "b-other",
                  type: "prices",
                  // Names a DIFFERENT offer. Shared reference, still valid.
                  props: { offerId: other.id, priceIds: [other.priceIds[0]] },
                  style: {},
                },
              ],
            ],
          },
        ],
      },
    });

    const { id: copyId, warnings } = await duplicateOffer(src.id, `zz-dup-copy-${crypto.randomUUID()}`);
    made.push(copyId);
    expect(warnings).toEqual([]);

    const db = createServiceClient();
    const { data: rows } = await db
      .from("page_sections")
      .select("content")
      .eq("owner_type", "offer")
      .eq("owner_id", copyId);
    const { data: prices } = await db.from("offer_prices").select("id, price_cents").eq("offer_id", copyId);
    const copyIdFor = (cents: number) => prices!.find((p) => p.price_cents === cents)!.id as string;

    const blocks = (rows![0].content as { blocks: Record<string, never>[] }).blocks;
    const props = (b: unknown) => (b as { props: { priceIds: string[] } }).props;
    const cols = (blocks[1] as unknown as { columns: unknown[][] }).columns;
    // The copy's own prices, in the same order, still one of two.
    expect(props(blocks[0]).priceIds).toEqual([copyIdFor(2900)]);
    expect(props(cols[0][0]).priceIds).toEqual([copyIdFor(19900)]);
    // Untouched: it never named this offer's prices in the first place.
    expect(props(cols[1][0]).priceIds).toEqual([other.priceIds[0]]);
  });

  it("warns that a coded upsell page does not follow the new key", async () => {
    // Inherent to changing the key, not a bug: the OTO registry is keyed on
    // offers.key and an unregistered key falls back to the default layout. So
    // the person is told, rather than finding out on a page a buyer has
    // already paid to reach.
    const src = await original();
    const db = createServiceClient();
    await db.from("offers").update({ oto_template: "custom" }).eq("id", src.id);

    const { id: copyId, warnings } = await duplicateOffer(src.id, `zz-dup-copy-${crypto.randomUUID()}`);
    made.push(copyId);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Custom/);
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

/**
 * The other half of the module, which the offer cases above never reach: the
 * product tables, the sales page and the page settings. Same code, different
 * table names — but "same code, different names" is exactly the claim a test
 * is for, and the page copy has a branch (a record with no page is ordinary,
 * not a failure) that nothing else exercises.
 */
const madeProducts: string[] = [];
const madeForProducts: string[] = [];
const madeCourses: string[] = [];

describe.skipIf(!canRun)("duplicating a product (integration)", () => {
  afterEach(async () => {
    const db = createServiceClient();
    for (const id of madeProducts.splice(0)) {
      await db.from("product_courses").delete().eq("product_id", id);
      await db.from("product_prices").delete().eq("product_id", id);
      await db.from("page_sections").delete().eq("owner_type", "product").eq("owner_id", id);
      await db.from("page_settings").delete().eq("owner_type", "product").eq("owner_id", id);
      await db.from("products").delete().eq("id", id);
    }
    for (const id of madeForProducts.splice(0)) {
      await db.from("offer_prices").delete().eq("offer_id", id);
      await db.from("offers").delete().eq("id", id);
    }
    for (const id of madeCourses.splice(0)) await db.from("courses").delete().eq("id", id);
  });

  /**
   * The offer a product's bump points AT, with prices of its own.
   *
   * The fixture this replaces used the product's own `product_prices` ids and
   * set no bump offer at all — a state `lib/product-rules.ts` blanks on every
   * save, so no admin could produce it. Built the way the application builds
   * it, the arrays name somebody else's prices, which is the whole point.
   */
  async function bumpOffer() {
    const db = createServiceClient();
    const id = crypto.randomUUID();
    madeForProducts.push(id);
    const { error } = await db.from("offers").insert({
      id,
      store_id: await getStoreId(),
      key: `zz-dup-bump-${id}`,
      name: "zz bump",
      grant_type: "subscription",
      grant_app_id: APP,
      grant_entitlement_key: "content-engine",
      grant_channels: ["instagram"],
      billing_type: "recurring",
      interval: "month",
      price_cents: 900,
      currency: "usd",
      headline: "h",
      description: "d",
      active: true,
    });
    if (error) throw new Error(`fixture bump offer: ${error.message}`);

    const priceIds: string[] = [];
    for (const [i, cents] of [900, 9000].entries()) {
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
      });
      if (pe) throw new Error(`fixture bump price: ${pe.message}`);
    }
    return { id, priceIds };
  }

  async function original() {
    const db = createServiceClient();
    const bump = await bumpOffer();
    const id = crypto.randomUUID();
    madeProducts.push(id);
    const { error } = await db.from("products").insert({
      id,
      store_id: await getStoreId(),
      slug: `zz-dup-src-${id}`,
      title: "zz product",
      price_cents: 4700,
      status: "published",
      stripe_product_id_live: "prod_MUSTNOTCARRY",
    });
    if (error) throw new Error(`fixture product: ${error.message}`);

    const priceIds: string[] = [];
    for (const [i, cents] of [4700, 9700].entries()) {
      const pid = crypto.randomUUID();
      priceIds.push(pid);
      const { error: pe } = await db.from("product_prices").insert({
        id: pid,
        product_id: id,
        billing_type: "one_time",
        price_cents: cents,
        sort_order: i,
      });
      if (pe) throw new Error(`fixture price: ${pe.message}`);
    }
    // Both id arrays on this table, so neither can be forgotten unnoticed —
    // and both hold the BUMP OFFER's price ids, which is the only state a save
    // can produce: product-rules blanks them unless a placement names one, and
    // `products_bump_is_not_self` (migration 0056) forbids the placement from
    // being this product. The deliberate choice here is "the yearly only".
    const { error: ue } = await db
      .from("products")
      .update({
        bump_offer_id: bump.id,
        bump_price_ids: [bump.priceIds[1]],
        upsell_offer_id: bump.id,
        upsell_price_ids: [bump.priceIds[1]],
      })
      .eq("id", id);
    if (ue) throw new Error(`fixture placement: ${ue.message}`);
    return { id, priceIds, bump };
  }

  it("arrives as a draft, without the Stripe id, still naming the bump offer's prices", async () => {
    // The copy shares the bump offer, so the bump offer's price ids are still
    // valid on it. Re-pointing them at the copy's own product_prices matches
    // nothing and writes [] — and an empty list makes the checkout sell the
    // offer's FIRST live price, so a bump deliberately set to yearly-only
    // quietly becomes the monthly one.
    const src = await original();
    const { id: copyId, warnings } = await duplicateProduct(src.id, `zz-dup-copy-${crypto.randomUUID()}`);
    madeProducts.push(copyId);
    expect(warnings).toEqual([]);

    const db = createServiceClient();
    const { data: copy } = await db
      .from("products")
      .select("title, status, stripe_product_id_live, bump_offer_id, bump_price_ids, upsell_price_ids")
      .eq("id", copyId)
      .single();
    const { data: prices } = await db.from("product_prices").select("id").eq("product_id", copyId);
    const own = new Set((prices ?? []).map((p) => p.id as string));

    expect(copy).toMatchObject({ title: "zz product", status: "draft", stripe_product_id_live: null });
    expect(copy!.bump_offer_id).toBe(src.bump.id);
    expect(prices).toHaveLength(2);
    for (const column of ["bump_price_ids", "upsell_price_ids"] as const) {
      const listed = (copy![column] ?? []) as string[];
      // The yearly, unchanged — not the offer's whole list, and not empty.
      expect(listed).toEqual([src.bump.priceIds[1]]);
      for (const id of listed) expect(own.has(id)).toBe(false);
    }
  });

  it("attaches the same courses, so the copy delivers something", async () => {
    // The attachment lives in a join table rather than on the row, so nothing
    // that copies columns can find it. A copy without it takes the money and
    // grants an empty library.
    const db = createServiceClient();
    const src = await original();
    const courseId = crypto.randomUUID();
    madeCourses.push(courseId);
    const { error: ce } = await db.from("courses").insert({
      id: courseId,
      store_id: await getStoreId(),
      slug: `zz-dup-course-${courseId}`,
      title: "zz course",
      status: "published",
    });
    if (ce) throw new Error(`fixture course: ${ce.message}`);
    const { error: le } = await db
      .from("product_courses")
      .insert({ product_id: src.id, course_id: courseId, sort_order: 3 });
    if (le) throw new Error(`fixture link: ${le.message}`);

    const { id: copyId, warnings } = await duplicateProduct(src.id, `zz-dup-copy-${crypto.randomUUID()}`);
    madeProducts.push(copyId);
    expect(warnings).toEqual([]);

    const { data: links } = await db
      .from("product_courses")
      .select("course_id, sort_order")
      .eq("product_id", copyId);
    // Shared, not deep copied: the same course, at the same position.
    expect(links).toEqual([{ course_id: courseId, sort_order: 3 }]);
  });

  it("carries the sales page and the page settings", async () => {
    const src = await original();
    await saveSection("product", src.id, "hero", {
      enabled: true,
      style: "light",
      accent: null,
      variant: null,
      content: { heading: "Hi there" },
    });
    await savePageSettings("product", src.id, {
      customCss: ".a{color:red}",
      customJs: "",
      snippets: [],
      metaTitle: "T",
      metaDescription: "D",
      shareImagePath: "",
    });

    const { id: copyId, warnings } = await duplicateProduct(src.id, `zz-dup-copy-${crypto.randomUUID()}`);
    madeProducts.push(copyId);
    expect(warnings).toEqual([]);

    const sections = await getPageSections("product", copyId);
    expect(sections.find((s) => s.sectionKey === "hero")?.content).toMatchObject({ heading: "Hi there" });
    const settings = await getPageSettings("product", copyId);
    expect(settings).toMatchObject({ customCss: ".a{color:red}", metaTitle: "T", metaDescription: "D" });
  });

  it("says nothing about a product that never had a sales page, and makes it no page", async () => {
    // copyPage throws on an empty source. That is a record without a page,
    // which is ordinary — reporting it as a warning would train admins to
    // ignore the list that carries the real failures. And the copy must come
    // out page-less rather than with somebody else's bands on it.
    const src = await original();
    const { id: copyId, warnings } = await duplicateProduct(src.id, `zz-dup-copy-${crypto.randomUUID()}`);
    madeProducts.push(copyId);
    expect(warnings).toEqual([]);
    // Not getPageSections, which answers an unedited page with the DEFAULT
    // bands — the question here is whether any row was written.
    expect(await hasPageSections("product", copyId)).toBe(false);
  });

  it("refuses a slug already in use, before writing anything", async () => {
    const src = await original();
    const db = createServiceClient();
    const { data: existing } = await db.from("products").select("slug").eq("id", src.id).single();
    await expect(duplicateProduct(src.id, existing!.slug as string)).rejects.toThrow(/already using/);
    const { count } = await db
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("store_id", await getStoreId())
      .eq("slug", existing!.slug as string);
    expect(count).toBe(1);
  });

  it("refuses a slug that is not a link, as a sentence", async () => {
    const src = await original();
    await expect(duplicateProduct(src.id, "Not A Slug")).rejects.toThrow(/Lowercase/);
  });
});
