import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { getPageSections, listPageSources } from "@/lib/pages";
import { getStoreId } from "@/lib/store";
import { PageEditor } from "@/components/admin/page-editor";
import { storePreview } from "@/lib/store-preview";
import { CheckoutSeed } from "@/components/admin/checkout-seed";
import { missingFixedBlocks } from "@/lib/checkout-layout";
import { normalizeBlocks, type Block } from "@/lib/blocks";

export const dynamic = "force-dynamic";

/**
 * The checkout.
 *
 * The same editor a sales page uses, pointed at the store's checkout. It was
 * the last page here that nobody could change without a deploy, which is a
 * strange place to draw that line: it is the page where a word costs money.
 *
 * One layout for every product. A checkout per product would mean a store with
 * forty of them maintaining forty, and the thing that actually differs between
 * two checkouts — the item, the price, the bump — is drawn from the order
 * rather than typed in, so there is nothing per-product left to edit.
 */
export default async function CheckoutPageEditor() {
  await requireAdmin();
  const storeId = await getStoreId();

  const [rows, pageSources, preview] = await Promise.all([
    getPageSections("checkout", storeId),
    listPageSources(),
    storePreview(),
  ]);

  const saved = rows.flatMap((r) => {
    const blocks = (r.content as Record<string, unknown> | undefined)?.blocks;
    return Array.isArray(blocks) ? normalizeBlocks(blocks) : [];
  }) as Block[];
  const built = saved.length > 0;
  // What the live page would refuse this layout for. Shown here rather than
  // discovered by a buyer: the page falls back silently and correctly, so
  // without this the only symptom is a checkout that ignores your work.
  const missing = built ? missingFixedBlocks(saved) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href="/admin" className="kicker text-muted hover:text-fg">
          &larr; Admin
        </Link>
        <h1 className="text-xl">Checkout</h1>
        <span className="text-sm text-muted">the page that takes the money, for every product</span>
      </div>

      {missing.length > 0 ? (
        <p className="rounded-lg border border-primary/45 bg-primary/5 px-3 py-2 text-xs leading-relaxed">
          <strong className="font-medium text-fg">This layout is not being used.</strong> A checkout
          without{" "}
          {missing
            .map((m) => LABELS[m] ?? m)
            .join(", ")
            .replace(/, ([^,]*)$/, " or $1")}{" "}
          cannot take a payment, so buyers are being shown the built-in checkout until it is back.
          Drag it in from the tray under <strong className="font-medium text-fg">Checkout</strong>.
        </p>
      ) : (
        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
          {built ? (
            <>
              Buyers are seeing the layout below. Empty it and the built-in checkout comes back —
              nothing is lost by trying something.
            </>
          ) : (
            <>
              Buyers are seeing the built-in checkout. Press{" "}
              <strong className="font-medium text-fg">Start from the current checkout</strong> to
              load it here as blocks, then change what you like. The pieces that draw the real order
              are in the tray under <strong className="font-medium text-fg">Checkout</strong>; the
              card fields, the total and the pay button can be moved anywhere but not removed.
            </>
          )}
        </p>
      )}

      <CheckoutSeed built={built} />

      <div className="mx-[calc(50%-50vw+var(--admin-nav)/2)] w-[calc(100vw-var(--admin-nav))] overflow-x-clip px-5 md:px-8">
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
          <PageEditor
            pageSources={pageSources}
            ownerType="checkout"
            ownerId={storeId}
            initial={rows}
            // The price on this page is the order's, never a product's, so a
            // Buy button dropped here has nothing to quote and links out.
            money={{ priceLabel: null, termsLabel: null }}
            preview={preview}
            liveHref="/"
          />
        </div>
      </div>
    </div>
  );
}

const LABELS: Record<string, string> = {
  buyerdetails: "their details",
  cardfields: "card fields",
  duetoday: "a total",
  paybutton: "a pay button",
};
