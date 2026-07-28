import Link from "next/link";

// Catalog card. Type drives a quiet accent (navy/plum/terracotta) on the label
// and the cover wash — terracotta stays reserved for the primary CTA elsewhere.
export type ProductType = "pdf" | "audio" | "video" | "app" | "course";

const TYPE_META: Record<ProductType, { label: string; accent: string; wash: string }> = {
  pdf:    { label: "Guide",   accent: "var(--navy)",  wash: "color-mix(in srgb, var(--navy) 14%, var(--surface))" },
  audio:  { label: "Audio",   accent: "var(--plum)",  wash: "color-mix(in srgb, var(--plum) 14%, var(--surface))" },
  video:  { label: "Video",   accent: "var(--primary)", wash: "color-mix(in srgb, var(--primary) 14%, var(--surface))" },
  app:    { label: "App",     accent: "var(--navy)",  wash: "color-mix(in srgb, var(--navy) 10%, var(--surface))" },
  course: { label: "Course",  accent: "var(--plum)",  wash: "color-mix(in srgb, var(--plum) 14%, var(--surface))" },
};

export type CatalogItem = {
  slug: string;
  title: string;
  tagline: string;
  type: ProductType;
  priceCents: number;
  owned?: boolean;
  accessHref?: string;
};

export function ProductCard({ item, index = 0 }: { item: CatalogItem; index?: number }) {
  const meta = TYPE_META[item.type];
  return (
    <Link
      href={item.owned ? (item.accessHref ?? "/library") : `/p/${item.slug}`}
      className="rise group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)]"
      style={{ animationDelay: `${120 + index * 70}ms` }}
    >
      <div
        className="relative aspect-[16/10] w-full"
        style={{ background: `linear-gradient(145deg, ${meta.wash}, var(--surface-2))` }}
      >
        <span
          className="kicker absolute left-4 top-4 rounded-full px-2.5 py-1"
          style={{ color: meta.accent, background: "color-mix(in srgb, var(--surface) 78%, transparent)" }}
        >
          {meta.label}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="text-lg leading-snug">{item.title}</h3>
        <p className="flex-1 text-sm text-muted">{item.tagline}</p>
        {/* Owned: the price is no longer the point — say so and offer the way in. */}
        <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
          {item.owned ? (
            <span className="kicker text-plum">Owned</span>
          ) : (
            <span className="font-display text-lg">${(item.priceCents / 100).toFixed(0)}</span>
          )}
          <span
            className={`text-sm transition-colors ${
              item.owned ? "text-primary group-hover:underline" : "text-muted group-hover:text-fg"
            }`}
          >
            {item.owned ? "Access now →" : "View →"}
          </span>
        </div>
      </div>
    </Link>
  );
}
