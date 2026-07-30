import { describe, it, expect } from "vitest";
import { blocksPublish, parseProductForm } from "@/lib/product-rules";

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
  price: "27",
  compareAt: "",
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
    const res = parseProductForm(formPayload({ slug: "Not A Slug", title: "  ", price: "-5" }));
    if (res.ok) throw new Error("should have failed");
    expect(Object.keys(res.errors).sort()).toEqual(["price", "slug", "title"]);
    expect(res.errors.slug).toMatch(/lowercase/i);
    expect(res.errors.title).toMatch(/required/i);
  });

  it("treats a new product (no id) as valid", () => {
    const { id: _drop, ...noId } = formPayload();
    expect(parseProductForm({ ...noId, status: "draft" }).ok).toBe(true);
  });

  it("converts dollars to cents without float drift", () => {
    const res = parseProductForm(formPayload({ price: "19.99", compareAt: "29.99" }));
    if (!res.ok) throw new Error("should have parsed");
    expect(res.data.priceCents).toBe(1999);
    expect(res.data.compareAtCents).toBe(2999);
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
