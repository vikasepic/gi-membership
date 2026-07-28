import Link from "next/link";
import { listAllProducts } from "@/lib/admin";
import { productCourseIds } from "@/lib/courses";

const money = (cents: number) => `$${(cents / 100).toFixed(0)}`;

export default async function AdminProductsPage() {
  const products = await listAllProducts();
  const published = products.filter((p) => p.status === "published").length;

  // The library delivers courses, so a published product with no course is
  // buyable but undeliverable. Saving one is blocked now, but anything already
  // in that state predates the check and has to be surfaced, not assumed fixed.
  const courseIdsByProduct = await productCourseIds(products.map((p) => p.id));
  const undeliverable = products.filter(
    (p) => p.status === "published" && (courseIdsByProduct.get(p.id)?.length ?? 0) === 0,
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

      {/* KPIs — orders/revenue land in phase 2 (checkout). */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Kpi label="Products" value={String(products.length)} />
        <Kpi label="Published" value={String(published)} />
        <Kpi label="Revenue" value="—" hint="after checkout (phase 2)" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Type</th>
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
                <td className="px-4 py-3 uppercase text-muted">{p.type}</td>
                <td className="px-4 py-3">{money(p.priceCents)}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      p.status === "published"
                        ? "text-navy"
                        : "text-muted"
                    }
                  >
                    {p.status}
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

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5">
      <span className="kicker text-muted">{label}</span>
      <span className="font-display text-3xl">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
