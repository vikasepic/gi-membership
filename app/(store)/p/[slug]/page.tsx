import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug } from "@/lib/store";

const TYPE_LABEL: Record<string, string> = {
  pdf: "Guide",
  audio: "Audio",
  video: "Video",
  app: "App",
};

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || product.status !== "published") notFound();

  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <Link href="/" className="kicker w-fit text-muted hover:text-fg">
        &larr; Store
      </Link>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-12">
        {/* Media / cover */}
        <div
          className="rise aspect-[16/10] w-full overflow-hidden rounded-3xl border border-border md:col-span-7"
          style={{
            background:
              "linear-gradient(150deg, color-mix(in srgb, var(--primary) 14%, var(--surface)), var(--surface-2))",
          }}
        />

        {/* Details */}
        <div className="rise flex flex-col gap-5 md:col-span-5" style={{ animationDelay: "100ms" }}>
          <span className="kicker text-primary">{TYPE_LABEL[product.type] ?? product.type}</span>
          <h1 className="text-3xl leading-tight md:text-4xl">{product.title}</h1>
          {product.tagline && <p className="text-lg text-muted">{product.tagline}</p>}

          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-display text-3xl">
              ${(product.priceCents / 100).toFixed(0)}
            </span>
            {product.compareAtCents && (
              <span className="text-muted line-through">
                ${(product.compareAtCents / 100).toFixed(0)}
              </span>
            )}
          </div>

          {/* ponytail: checkout is phase 2 — this links to a route that doesn't
              exist yet, intentionally. Wire to the Payment Element then. */}
          <Link
            href={`/checkout?product=${product.slug}`}
            className="mt-2 w-fit rounded-full bg-primary px-7 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Get it
          </Link>
        </div>
      </div>

      {product.description && (
        <section className="flex max-w-2xl flex-col gap-3 border-t border-border pt-8">
          <h2 className="kicker text-muted">About</h2>
          <p className="whitespace-pre-line leading-relaxed text-fg/90">
            {product.description}
          </p>
        </section>
      )}
    </div>
  );
}
