import { describe, it, expect, afterEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { duplicateOffer, duplicateProduct } from "@/lib/duplicate-write";
import { getPageSections, getPageSettings, savePageSettings, saveSection } from "@/lib/pages";

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

describe.skipIf(!canRun)("duplicating a product (integration)", () => {
  afterEach(async () => {
    const db = createServiceClient();
    for (const id of madeProducts.splice(0)) {
      await db.from("product_prices").delete().eq("product_id", id);
      await db.from("page_sections").delete().eq("owner_type", "product").eq("owner_id", id);
      await db.from("page_settings").delete().eq("owner_type", "product").eq("owner_id", id);
      await db.from("products").delete().eq("id", id);
    }
  });

  async function original() {
    const db = createServiceClient();
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
    // Both id arrays on this table, so neither can be forgotten unnoticed.
    await db
      .from("products")
      .update({ bump_price_ids: priceIds, upsell_price_ids: [priceIds[1]] })
      .eq("id", id);
    return { id, priceIds };
  }

  it("arrives as a draft, without the Stripe id, with both id arrays re-pointed", async () => {
    const src = await original();
    const { id: copyId, warnings } = await duplicateProduct(src.id, `zz-dup-copy-${crypto.randomUUID()}`);
    madeProducts.push(copyId);
    expect(warnings).toEqual([]);

    const db = createServiceClient();
    const { data: copy } = await db
      .from("products")
      .select("title, status, stripe_product_id_live, bump_price_ids, upsell_price_ids")
      .eq("id", copyId)
      .single();
    const { data: prices } = await db.from("product_prices").select("id").eq("product_id", copyId);
    const own = new Set((prices ?? []).map((p) => p.id as string));

    expect(copy).toMatchObject({ title: "zz product", status: "draft", stripe_product_id_live: null });
    expect(prices).toHaveLength(2);
    for (const column of ["bump_price_ids", "upsell_price_ids"] as const) {
      const listed = (copy![column] ?? []) as string[];
      expect(listed.length).toBeGreaterThan(0);
      for (const id of listed) expect(own.has(id)).toBe(true);
      for (const id of listed) expect(src.priceIds).not.toContain(id);
    }
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

  it("says nothing about a product that never had a sales page", async () => {
    // copyPage throws on an empty source. That is a record without a page,
    // which is ordinary — reporting it as a warning would train admins to
    // ignore the list that carries the real failures.
    const src = await original();
    const { id: copyId, warnings } = await duplicateProduct(src.id, `zz-dup-copy-${crypto.randomUUID()}`);
    madeProducts.push(copyId);
    expect(warnings).toEqual([]);
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
