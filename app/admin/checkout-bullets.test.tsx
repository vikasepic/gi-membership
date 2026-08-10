import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * A reassurance list, from the admin form to the buyer's screen.
 *
 * The two ends had tests and the join did not. `CheckoutBullets` renders one
 * `<input name="checkoutBullets">` per line and `CheckoutPanel` renders one
 * `<li>` per line, but between them sits the only step that can lose them:
 * `saveProduct` parses the form with `Object.fromEntries`, which keeps the LAST
 * value of a repeated field and throws the rest away. `getAll` is why four
 * lines do not arrive as one, and nothing failed if it stopped being used.
 *
 * Mutations this catches:
 *  - `formData.getAll("checkoutBullets")` → `[formData.get(...)]`, or reading
 *    the field off the `Object.fromEntries` above it: one line survives.
 *  - dropping `.filter(Boolean)`: a row someone emptied but did not remove
 *    reaches the panel as a blank `<li>` with a tick beside it.
 *  - dropping `.map(trim)`: the stored line keeps whatever whitespace the
 *    input had.
 *  - `name="checkoutBullets"` on the input becoming unique per row: the form
 *    posts nothing this action reads and every list saves empty.
 */

const updated = vi.fn(async (_id: string, _input: unknown) => {});
const created = vi.fn(async (_input: unknown) => "new-id");

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: async () => {} }));
vi.mock("@/lib/courses", () => ({ setProductCourses: async () => {} }));
vi.mock("@/lib/admin", () => ({
  createProduct: (i: unknown) => created(i),
  updateProduct: (id: string, i: unknown) => updated(id, i),
  deleteProduct: async () => {},
  uploadPaidAsset: async () => ({}),
  setProductCover: async () => {},
  clearProductCover: async () => {},
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({ redirect: () => {}, useRouter: () => ({ refresh: () => {} }) }));

const { saveProduct } = await import("@/app/admin/actions");
const { CheckoutPanel } = await import("@/components/checkout/checkout-panel");
const { ProductForm } = await import("@/components/admin/product-form");

const ID = "00000000-0000-0000-0000-0000000000a1";

/** The fields the product form posts, plus whatever bullets are being tested. */
function form(bullets: string[]): FormData {
  const fd = new FormData();
  fd.set("id", ID);
  fd.set("slug", "product-validator");
  fd.set("title", "Product Validator");
  fd.set("price", "27");
  fd.set("status", "draft");
  // Repeated, exactly as a browser serializes several inputs sharing a name.
  for (const b of bullets) fd.append("checkoutBullets", b);
  return fd;
}

const savedBullets = () =>
  (updated.mock.calls.at(-1)?.[1] as { checkoutBullets: string[] }).checkoutBullets;

beforeEach(() => {
  updated.mockClear();
  created.mockClear();
});

describe("a reassurance list on its way to the checkout", () => {
  it("posts one field per line, all under the same name", async () => {
    // The repeated name is the whole reason `getAll` is there. One input per
    // line named uniquely would serialize to fields this action never reads,
    // and every list would save empty with nothing to show for it.
    const out = renderToStaticMarkup(
      <ProductForm
        product={{ checkoutBullets: ["A", "B", "C"] } as never}
        offers={[]}
        allCourses={[]}
      />,
    );
    expect(out.match(/name="checkoutBullets"/g) ?? []).toHaveLength(3);
  });

  it("keeps every line the form posted, in order", async () => {
    const lines = ["Written for founders.", "Two hours, not two weeks.", "Yours to keep."];
    expect(await saveProduct({}, form(lines))).toEqual({ saved: true });
    expect(savedBullets()).toEqual(lines);
  });

  it("drops a row left blank and trims the rest", async () => {
    await saveProduct({}, form(["  Kept.  ", "   ", ""]));
    expect(savedBullets()).toEqual(["Kept."]);
  });

  it("reaches the buyer as exactly those lines and nothing standard", async () => {
    const lines = ["Written for founders.", "Two hours, not two weeks."];
    await saveProduct({}, form(lines));
    const out = renderToStaticMarkup(
      <CheckoutPanel
        title="Product Validator"
        tagline={null}
        coverUrl={null}
        backHref="/p/product-validator"
        bullets={savedBullets()}
      />,
    );
    // `<li ` with the space: a cover image makes React emit a preload <link>,
    // which a looser match counts as another line.
    expect(out.match(/<li /g) ?? []).toHaveLength(lines.length);
    for (const line of lines) expect(out).toContain(line);
    expect(out).not.toContain("never reach our servers");
  });

  it("saves an empty list as empty, so the standard lines come back", async () => {
    await saveProduct({}, form([]));
    expect(savedBullets()).toEqual([]);
  });
});
