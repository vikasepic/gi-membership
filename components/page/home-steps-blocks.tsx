import Link from "next/link";
import type { StoreRender } from "@/components/page/storefront-blocks";
import type { StepItem } from "@/lib/home-steps";

/**
 * The home page as steps (owner, 5 Oct 2026). Two storefront blocks over one
 * list, resolved by the page into `store.steps` (lib/home-steps.ts):
 *
 * - Step sections: each step's words beside its products, then everything
 *   that has no step under "Everything else", so nothing the store sells drops
 *   off the page for want of a step.
 * - Step staircase: the picture at the top. One column per step, each a shade
 *   deeper than the last, every product the same size, so no single product
 *   leads the page.
 *
 * Headings carry `!` sizes: the store's heading settings are :root rules meant
 * for sales pages and outrank a utility class.
 */

function StepCard({ item }: { item: StepItem }) {
  return (
    <Link
      href={item.href}
      className="group flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border bg-surface transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)]"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-border bg-surface-2">
        {item.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-[18px] pb-[18px] pt-4">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-fg/80">{item.kind}</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              item.owned ? "bg-plum/10 text-plum" : item.bill === "Pay once" ? "bg-[#e6f1e9] text-[#1f6b45]" : "bg-navy/10 text-navy"
            }`}
          >
            {item.bill}
          </span>
        </div>
        <h3 className="text-[18px]! font-bold! leading-snug! tracking-tight">{item.name}</h3>
        {item.line && <p className="line-clamp-3 text-sm leading-relaxed text-muted">{item.line}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-[15px] font-semibold">{item.price}</span>
          <span className="whitespace-nowrap text-sm font-semibold text-primary group-hover:underline">
            {item.owned ? "Open" : "See inside"} &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}

const grid = "grid min-w-0 gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]";

export function StepsBlock({
  store,
  title,
  note,
  otherTitle,
}: {
  store: StoreRender;
  title: string;
  note: string;
  otherTitle: string;
}) {
  const view = store.steps;
  if (!view || (view.steps.length === 0 && view.other.length === 0)) return null;
  return (
    <section className="flex flex-col">
      {(title || note) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3.5">
          {title && <h2 className="text-[28px]! font-extrabold! leading-tight! tracking-tight">{title}</h2>}
          {note && <span className="text-sm text-muted">{note}</span>}
        </div>
      )}
      {view.steps.map((s) => (
        <div key={s.id} id={s.anchor} className="flex scroll-mt-24 flex-wrap gap-x-12 gap-y-5 border-t border-border py-9">
          <div className="flex max-w-[22rem] flex-[1_1_15rem] flex-col gap-2.5">
            <span className="kicker inline-flex items-center gap-2.5 text-[13px] text-primary">
              <span aria-hidden className="grid size-[30px] place-items-center rounded-full bg-primary/15 text-sm tracking-normal">
                {s.number}
              </span>
              Step {s.number}
            </span>
            <h3 className="text-[26px]! font-extrabold! leading-tight! tracking-tight">{s.title || s.short}</h3>
            {s.line && <p className="text-pretty text-muted">{s.line}</p>}
          </div>
          <div className={`flex-[999_1_34rem] ${grid}`}>
            {s.items.map((item) => (
              <StepCard key={item.key} item={item} />
            ))}
          </div>
        </div>
      ))}
      {view.other.length > 0 && (
        <div className="flex flex-col gap-5 border-t border-border py-9">
          {otherTitle && <h3 className="text-[26px]! font-extrabold! leading-tight! tracking-tight">{otherTitle}</h3>}
          <div className={grid}>
            {view.other.map((item) => (
              <StepCard key={item.key} item={item} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function StaircaseBlock({ store, max }: { store: StoreRender; max: number }) {
  const steps = store.steps?.steps ?? [];
  if (steps.length === 0) return null;
  const cap = Math.max(1, max);
  return (
    <div
      aria-label="Everything in the store, by step"
      className="grid items-end gap-[clamp(8px,1.2vw,14px)]"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((s, i) => (
        <div
          key={s.id}
          className="flex min-w-0 flex-col gap-[clamp(8px,1vw,12px)] rounded-[22px] p-[clamp(10px,1.2vw,16px)]"
          // One hue, a shade deeper each step: the page climbing, in the store's own colour.
          style={{ background: `color-mix(in srgb, var(--primary) ${10 + i * 8}%, var(--surface))` }}
        >
          <a href={`#${s.anchor}`} className="flex min-w-0 items-center gap-2 text-fg no-underline">
            <span
              aria-hidden
              className="grid size-[clamp(24px,2.2vw,30px)] shrink-0 place-items-center rounded-full bg-surface font-display text-[clamp(12px,1vw,14px)] font-extrabold text-primary"
            >
              {s.number}
            </span>
            {/* Wraps rather than truncates: three steps across a phone leave
                each about a hundred pixels, and "Get …" names nothing. */}
            <span className="min-w-0 font-display text-[clamp(13px,1.25vw,18px)] font-extrabold leading-tight tracking-tight">{s.short}</span>
          </a>
          {s.items.slice(0, cap).map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="relative block min-w-0 overflow-hidden rounded-[14px] bg-surface-2 shadow-[0_1px_2px_rgba(70,50,30,0.08),0_14px_26px_-16px_rgba(70,50,30,0.45)]"
            >
              {item.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className="block aspect-[4/3] w-full object-cover" />
              ) : (
                <span aria-hidden className="block aspect-[4/3] w-full" />
              )}
              <span className="absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate rounded-full bg-surface/95 px-2.5 py-0.5 text-[clamp(10.5px,0.85vw,12.5px)] font-semibold leading-snug text-fg">
                {item.name}
              </span>
            </Link>
          ))}
          {s.items.length > cap && (
            <a href={`#${s.anchor}`} className="text-center text-xs font-semibold text-fg/80 hover:text-fg">
              +{s.items.length - cap} more
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
