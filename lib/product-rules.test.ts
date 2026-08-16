import { describe, it, expect } from "vitest";
import { altFor, blocksPublish, parseProductForm } from "@/lib/product-rules";

const OFFER_A = "11111111-1111-4111-8111-111111111111";
const OFFER_B = "22222222-2222-4222-8222-222222222222";

// The exact payload the admin product form submits. Note what is ABSENT:
// mediaMode, mediaEmbedUrl and coverImageUrl have no inputs in the form, and
// the schema used to demand them — which made every save fail with three
// unattributable "Invalid input" messages.
const formPayload = (over: Record<string, string> = {}) => ({
  id: "4ddc6a1d-20cd-4a18-83aa-d96238b9ced9",
  slug: "field-guide",
  title: "The Field Guide",
  tagline: "",
  description: "",
  // The ways to buy, posted as JSON the way the editor posts them. `price` and
  // `compareAt` are gone: a product's price is a row in product_prices now, and
  // products.price_cents is a mirror the database keeps.
  prices: JSON.stringify([{ billingType: "one_time", priceCents: 2700 }]),
  status: "published",
  bumpOfferId: "",
  upsellOfferId: "",
  ...over,
});

describe("parseProductForm", () => {
  it("accepts what the form actually submits, with the media fields absent", () => {
    const res = parseProductForm(formPayload());
    if (!res.ok) throw new Error(`should have parsed, got: ${JSON.stringify(res.errors)}`);
    expect(res.data.slug).toBe("field-guide");
    expect(res.data.priceCents).toBe(2700);
    expect(res.data.compareAtCents).toBeNull();
    expect(res.data.prices).toHaveLength(1);
    expect(res.data.bumpOfferId).toBeNull();
  });

  it("does not carry media fields at all, so a save can't null out an uploaded asset", () => {
    const res = parseProductForm(formPayload());
    if (!res.ok) throw new Error("should have parsed");
    expect(res.data).not.toHaveProperty("mediaMode");
    expect(res.data).not.toHaveProperty("mediaEmbedUrl");
    expect(res.data).not.toHaveProperty("coverImageUrl");
  });

  it("reports errors per field, so each shows next to its own input", () => {
    const res = parseProductForm(
      formPayload({
        slug: "Not A Slug",
        title: "  ",
        prices: JSON.stringify([{ billingType: "one_time", priceCents: -5 }]),
      }),
    );
    if (res.ok) throw new Error("should have failed");
    expect(Object.keys(res.errors).sort()).toEqual(["prices", "slug", "title"]);
    expect(res.errors.slug).toMatch(/lowercase/i);
    expect(res.errors.title).toMatch(/required/i);
  });

  it("treats a new product (no id) as valid", () => {
    const { id: _drop, ...noId } = formPayload();
    expect(parseProductForm({ ...noId, status: "draft" }).ok).toBe(true);
  });

  it("takes the headline price from the first way to pay", () => {
    // The mirror. products.price_cents is not typed in twice — it is whatever
    // the top row of the list says, which is what the database trigger will
    // also make it.
    const res = parseProductForm(
      formPayload({
        prices: JSON.stringify([
          { billingType: "one_time", priceCents: 1999, compareAtCents: 2999 },
          { billingType: "recurring", interval: "month", priceCents: 900 },
        ]),
      }),
    );
    if (!res.ok) throw new Error(`should have parsed, got: ${JSON.stringify(res.errors)}`);
    expect(res.data.priceCents).toBe(1999);
    expect(res.data.compareAtCents).toBe(2999);
    expect(res.data.prices).toHaveLength(2);
  });

  it("refuses a recurring price with no interval, the way the database does", () => {
    const res = parseProductForm(
      formPayload({ prices: JSON.stringify([{ billingType: "recurring", priceCents: 900 }]) }),
    );
    expect(res.ok).toBe(false);
  });
});

describe("publishing a product with no course", () => {
  it("is blocked, because the buyer would receive nothing", () => {
    expect(blocksPublish("published", [])).toBe(true);
  });
  it("is allowed once a course is attached", () => {
    expect(blocksPublish("published", ["course-1"])).toBe(false);
  });
  it("never blocks a draft — courseless is a normal work-in-progress state", () => {
    expect(blocksPublish("draft", [])).toBe(false);
  });
});

// The glue inside saveProduct: a real FormData shaped exactly as the form
// submits it, through Object.fromEntries + getAll("courseIds"). This is the last
// piece between the browser and the parser, and the multi-value courseIds field
// is the part Object.fromEntries silently mangles if used alone.
describe("the FormData the product form actually submits", () => {
  function formDataFromProductForm(courseIds: string[]) {
    const fd = new FormData();
    fd.set("id", "0edf6076-9a0e-4452-97fc-59f7687f697f");
    fd.set("slug", "field-guide");
    fd.set("title", "The Field Guide");
    fd.set("tagline", "A field-tested PDF playbook.");
    fd.set("description", "");
    fd.set("price", "27");
    fd.set("compareAt", "");
    fd.set("status", "published");
    fd.set("bumpOfferId", "");
    fd.set("upsellOfferId", "");
    for (const id of courseIds) fd.append("courseIds", id); // one hidden input each
    return fd;
  }

  it("parses, and reads every attached course rather than just the last", () => {
    const fd = formDataFromProductForm([
      "61a41256-9001-4995-afe0-202f63c79b7e",
      "52b1b489-d9c5-4ec6-af60-95caaa240514",
    ]);
    const res = parseProductForm(Object.fromEntries(fd) as Record<string, unknown>);
    if (!res.ok) throw new Error(`parse failed: ${JSON.stringify(res.errors)}`);
    expect(res.data.title).toBe("The Field Guide");

    // Object.fromEntries keeps only the LAST courseIds value, which is why the
    // action uses getAll — a bundle would otherwise lose every course but one.
    expect(fd.getAll("courseIds").map(String)).toHaveLength(2);
    expect(blocksPublish(res.data.status, fd.getAll("courseIds").map(String))).toBe(false);
  });

  it("refuses to publish when no course checkbox is ticked", () => {
    const fd = formDataFromProductForm([]);
    const res = parseProductForm(Object.fromEntries(fd) as Record<string, unknown>);
    if (!res.ok) throw new Error("parse failed");
    expect(blocksPublish(res.data.status, fd.getAll("courseIds").map(String))).toBe(true);
  });
});

describe("the second price at a placement", () => {
  it("is kept when it is a different offer", () => {
    expect(altFor("main", "second")).toBe("second");
  });

  it("is nothing without a first price", () => {
    // A second price on a placement that shows no offer is a setting that
    // renders nowhere and outlives the reason it was set.
    expect(altFor(null, "second")).toBeNull();
  });

  it("is nothing when it is the same offer twice", () => {
    // Both radios would show the same figure, and one of them would be a lie.
    // The database refuses the row, so dropping it here turns a mis-click into
    // nothing rather than a failed save.
    expect(altFor("main", "main")).toBeNull();
  });

  it("is nothing when none was chosen", () => {
    expect(altFor("main", null)).toBeNull();
  });
});

describe("what the product form saves for a placement", () => {
  const form = (over: Record<string, unknown>) =>
    parseProductForm({
      title: "T",
      slug: "t",
      price: "10",
      status: "draft",
      currency: "usd",
      ...over,
    });

  it("keeps both ids when two prices were picked", () => {
    const r = form({ bumpOfferId: OFFER_A, bumpAltOfferId: OFFER_B });
    expect(r.ok && r.data.bumpOfferId).toBe(OFFER_A);
    expect(r.ok && r.data.bumpAltOfferId).toBe(OFFER_B);
  });

  it("drops the second when the placement was cleared", () => {
    const r = form({ bumpOfferId: "", bumpAltOfferId: OFFER_B });
    expect(r.ok && r.data.bumpAltOfferId).toBeNull();
  });

  it("keeps the bump and upsell independent of each other", () => {
    const r = form({ bumpOfferId: OFFER_A, upsellOfferId: OFFER_B, upsellAltOfferId: OFFER_A });
    expect(r.ok && r.data.bumpAltOfferId).toBeNull();
    expect(r.ok && r.data.upsellAltOfferId).toBe(OFFER_A);
  });
});
