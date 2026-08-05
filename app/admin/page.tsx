import Link from "next/link";
import { listAllProducts } from "@/lib/admin";
import { productCourseIds } from "@/lib/courses";

import { money } from "@/lib/money";
import { storeTake } from "@/lib/admin-nav";

export default async function AdminProductsPage() {
  const [products, take] = await Promise.all([listAllProducts(), storeTake()]);
  const published = products.filter((p) => p.status === "published").length;
  const drafts = products.length - published;
  const refundRate = take.paid + take.refunded > 0
    ? Math.round((take.refunded / (take.paid + take.refunded)) * 100)
    : 0;

  // The library delivers courses, so a published product with no course is
  // buyable but undeliverable. Saving one is blocked now, but anything already
  // in that state predates the check and has to be surfaced, not assumed fixed.
  const courseIdsByProduct = await productCourseIds(products.map((p) => p.id));
  const courseCount = (id: string) => courseIdsByProduct.get(id)?.length ?? 0;
  const undeliverable = products.filter(
    (p) => p.status === "published" && courseCount(p.id) === 0,
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Products</h1>
        <Link
          href="/admin/products/new"
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          + New product
        </Link>
      </div>

      {undeliverable.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-primary/40 bg-primary/5 px-5 py-4">
          <span className="font-medium text-fg">
            {undeliverable.length} published{" "}
            {undeliverable.length === 1 ? "product has" : "products have"} no course attached
          </span>
          <p className="text-sm text-muted">
            The library delivers courses, so {undeliverable.length === 1 ? "it is" : "they are"}{" "}
            on sale but would give a buyer nothing. Attach a course to each, or set{" "}
            {undeliverable.length === 1 ? "it" : "them"} back to draft.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {undeliverable.map((p) => (
              <Link
                key={p.id}
                href={`/admin/products/${p.id}`}
                className="rounded-full border border-border bg-surface px-3 py-1 text-sm hover:border-primary"
              >
                {p.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* One line rather than three cards. "Products 2" above a two-row table
          and a "Revenue —" card pointing at Orders were cards that cost a row
          of the page to repeat what was already on it. */}
      <p className="-mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-muted">
        <span>
          <b className="font-semibold tabular-nums text-fg">{money(take.netCents)}</b> net
        </span>
        <span>
          <b className="font-semibold tabular-nums text-fg">{take.paid + take.refunded}</b> orders
          {take.refunded > 0 && (
            <>
              {" · "}
              <b className="font-semibold tabular-nums text-primary">{take.refunded} refunded</b>
              {" "}({refundRate}%)
            </>
          )}
        </span>
        <span>
          <b className="font-semibold tabular-nums text-fg">{published}</b> published
          {drafts > 0 && `, ${drafts} draft`}
        </span>
      </p>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              {/* Type moved onto the course, so this column had nothing left to
                  read and rendered blank on every row. What a product delivers
                  is the thing you actually check here. */}
              <th className="px-4 py-3 font-medium">Delivers</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Offers</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  {p.title}
                  {p.isPlaceholder && (
                    <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                      placeholder
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  {courseCount(p.id) > 0
                    ? `${courseCount(p.id)} ${courseCount(p.id) === 1 ? "course" : "courses"}`
                    : "nothing"}
                </td>
                <td className="px-4 py-3 tabular-nums">{money(p.priceCents)}</td>
                <td className="px-4 py-3">
                  {/* A dot and a word, not a filled pill: two states on a
                      two-row table do not need to shout. */}
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={`size-1.5 rounded-full ${
                        p.status === "published" ? "bg-[#3f9b6d]" : "bg-border"
                      }`}
                    />
                    <span className={p.status === "published" ? "text-fg" : "text-muted"}>
                      {p.status === "published" ? "Published" : "Draft"}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">
                  {[p.bumpOfferId && "bump", p.upsellOfferId && "OTO"].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/products/${p.id}`} className="text-primary hover:underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No products yet. Create your first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
