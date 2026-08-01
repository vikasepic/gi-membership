import { OtoActions, type OtoView } from "@/components/oto/shell";

// The upsell design system.
//
// Extracted from the Content Engine page so the data-driven templates share one
// visual language instead of each being a plainer sketch of it. Colours, bands,
// type scale and CTA all live here; a template composes them, and nothing
// re-invents a colour.
//
// Palette, from the client's brief: navy carries the hero, the reassurance
// boxes and the close. Terracotta is the CTA and one accent rule per section,
// never decoration. Plum marks emphasis only. Rose softens cards and chips.
// Alternating white and light-grey bands give the page its rhythm.

export const NAVY = "#11325B";
export const PLUM = "#832A63";
export const TERRA = "#C8653D";
export const BAND = "#f6f4f1";
export const ROSE = "#f8ebe6";
export const BODY = "#4a4a52";
/** Label colour on navy — terracotta itself is too dark to read there. */
export const PEACH = "#e8a184";
export const HAIRLINE = "#e8e4dd";

/**
 * Terracotta fills use #b0532f, not the brand #C8653D. White on the brand
 * colour is 3.90:1, under AA for button text; this is 5.09:1 and still
 * unmistakably terracotta. #C8653D stays for large text and accent rules.
 */
export const CTA_PILL =
  "group inline-flex items-center gap-2.5 rounded-full bg-[#b0532f] px-8 py-4 text-[1.02rem] font-medium text-white shadow-[0_14px_30px_-14px_rgba(176,83,47,0.6)] transition-[transform,background-color] duration-200 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] hover:bg-[#9c4728] active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100";

export const CTA_PILL_FULL = `${CTA_PILL} w-full justify-center`;

/**
 * Kept as an empty string on purpose. The upsell renders bare in both the live
 * page and the preview, so there is no container padding to cancel — the old
 * negative margins pulled content off-screen the moment that changed.
 */
export const BLEED = "";

export function Band({
  children,
  tone = "white",
  className = "",
  width = "4xl",
}: {
  children: React.ReactNode;
  tone?: "white" | "grey" | "navy" | "rose" | "plum";
  className?: string;
  width?: "4xl" | "5xl";
}) {
  const bg = { white: "#ffffff", grey: BAND, navy: NAVY, rose: ROSE, plum: PLUM }[tone];
  const dark = tone === "navy" || tone === "plum";
  return (
    <section
      className={`px-6 py-14 md:px-12 md:py-20 ${className}`}
      style={{ background: bg, color: dark ? "#fff" : undefined }}
    >
      <div className={`mx-auto w-full ${width === "5xl" ? "max-w-5xl" : "max-w-4xl"}`}>{children}</div>
    </section>
  );
}

export function H2({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <h2
      className={`font-display text-[clamp(1.6rem,3.4vw,2.35rem)] font-semibold leading-[1.18] tracking-[-0.02em] text-balance ${className}`}
      style={{ color: NAVY, ...style }}
    >
      {children}
    </h2>
  );
}

export function P({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <p className={`text-[1.02rem] leading-[1.75] text-pretty ${className}`} style={{ color: BODY, ...style }}>
      {children}
    </p>
  );
}

export function TickIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={`fill-current ${className}`}>
      <path d="M8 15.6 3.4 11l1.6-1.6L8 12.4l7-7L16.6 7 8 15.6Z" />
    </svg>
  );
}

/** The pill CTA. Always routed through OtoActions — the money path is shared. */
export function Cta({
  view,
  note = false,
  full = false,
  align = "start",
  tone = "plain",
}: {
  view: OtoView;
  note?: boolean;
  full?: boolean;
  align?: "start" | "stretch";
  tone?: "plain" | "band";
}) {
  return (
    <OtoActions
      view={view}
      tone={tone}
      align={full ? "stretch" : align}
      showNote={note}
      buttonClassName={full ? CTA_PILL_FULL : CTA_PILL}
      className="pt-2"
    />
  );
}

/** Navy hero. Copy left, a labelled stat card right when stats exist. */
export function Hero({
  view,
  headline,
  description,
  stats,
}: {
  view: OtoView;
  headline: React.ReactNode;
  description?: string | null;
  stats?: { value: string; label: string }[];
}) {
  const hasStats = (stats?.length ?? 0) > 0;
  return (
    <section className="px-6 py-14 text-white md:px-12 md:py-20" style={{ background: NAVY }}>
      <div
        className={`mx-auto grid w-full max-w-5xl grid-cols-1 items-start gap-10 ${hasStats ? "lg:grid-cols-12 lg:gap-14" : ""}`}
      >
        <div className={`rise flex flex-col gap-6 ${hasStats ? "lg:col-span-7" : "mx-auto max-w-3xl text-center"}`}>
          <h1 className="font-display text-[clamp(2rem,4.6vw,3.25rem)] font-semibold leading-[1.12] tracking-[-0.025em] text-balance">
            {headline}
          </h1>
          {description && (
            <p className="max-w-[58ch] text-[1.05rem] leading-[1.7] text-white/85">{description}</p>
          )}
          <div className={hasStats ? "" : "mx-auto"}>
            <Cta view={view} note />
          </div>
        </div>

        {hasStats && (
          <div
            className="flex flex-col divide-y divide-white/12 overflow-hidden rounded-2xl lg:col-span-5"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            {stats!.map((s) => (
              <div key={s.label} className="flex flex-col gap-1 p-6">
                <span
                  className="text-[0.7rem] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: PEACH }}
                >
                  {s.label}
                </span>
                <span className="font-display text-xl font-semibold leading-tight">{s.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Figures set in tabular mono — these are measurements, not decoration. */
export function StatBar({ stats }: { stats: { value: string; label: string }[] }) {
  if (stats.length === 0) return null;
  return (
    <section className="border-b px-6 py-9 md:px-12" style={{ background: "#fff", borderColor: HAIRLINE }}>
      <div
        className="mx-auto grid w-full max-w-4xl gap-8"
        style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, minmax(0,1fr))` }}
      >
        {stats.slice(0, 4).map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-1 text-center">
            <span
              className="text-[clamp(1.4rem,3vw,2rem)] font-semibold leading-none [font-family:ui-monospace,SFMono-Regular,Menlo,monospace] [font-variant-numeric:tabular-nums]"
              style={{ color: NAVY }}
            >
              {s.value}
            </span>
            <span className="text-[0.78rem] leading-snug" style={{ color: BODY }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Rose cards with a plum icon — the "what changes" grid. */
export function BenefitCards({ items }: { items: { title: string; body: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      {items.map((b, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-2xl p-7" style={{ background: ROSE }}>
          <span
            className="grid size-9 place-items-center rounded-lg text-white"
            style={{ background: PLUM }}
            aria-hidden
          >
            <TickIcon className="size-4" />
          </span>
          <span className="font-display font-semibold leading-snug" style={{ color: NAVY }}>
            {b.title}
          </span>
          {b.body && (
            <span className="text-[0.95rem] leading-relaxed" style={{ color: BODY }}>
              {b.body}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Comparison cards. The offer's card is plum with a best-value flag. */
export function ComparisonCards({
  rows,
}: {
  rows: { option: string; cost: string; time: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((c, i) => {
        const best = i === rows.length - 1;
        return (
          <div
            key={i}
            className={`relative flex flex-col gap-3 rounded-2xl p-6 ${best ? "text-white" : "bg-white"}`}
            style={best ? { background: PLUM } : { border: `1px solid ${HAIRLINE}` }}
          >
            {best && (
              <span
                className="absolute -top-3 left-6 rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white"
                style={{ background: "#b0532f" }}
              >
                Best value
              </span>
            )}
            <span
              className="text-[0.72rem] font-semibold uppercase tracking-[0.14em]"
              style={{ color: best ? "rgba(255,255,255,0.75)" : PLUM }}
            >
              {c.option}
            </span>
            <span className="font-display text-[1.6rem] font-semibold leading-none tracking-[-0.02em]">
              {c.cost}
            </span>
            <span className={`text-sm ${best ? "text-white/70" : ""}`} style={best ? undefined : { color: BODY }}>
              {c.time}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Two-column open FAQ, not accordions — the reference keeps answers visible. */
export function FaqGrid({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
      {items.map((f) => (
        <div key={f.q} className="flex flex-col gap-2 border-t pt-6" style={{ borderColor: "#e0dcd4" }}>
          <p className="font-semibold leading-snug" style={{ color: NAVY }}>
            {f.q}
          </p>
          <p className="text-[0.95rem] leading-[1.7]" style={{ color: BODY }}>
            {f.a}
          </p>
        </div>
      ))}
    </div>
  );
}

/** The white pricing card. */
export function PricingCard({ view, title }: { view: OtoView; title: string }) {
  return (
    <div
      className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center"
      style={{ border: `1px solid ${HAIRLINE}`, boxShadow: "0 24px 60px -40px rgba(17,50,91,0.45)" }}
    >
      <span className="font-display text-lg font-semibold" style={{ color: NAVY }}>
        {title}
      </span>
      <span
        className="font-display text-[3.25rem] font-semibold leading-none tracking-[-0.03em]"
        style={{ color: NAVY }}
      >
        {view.chargeNowCents === 0 ? "Free" : formatMoney(view)}
      </span>
      {view.recurringNote && (
        <span className="text-sm" style={{ color: BODY }}>
          {view.recurringNote}. Cancel any time.
        </span>
      )}
      <div className="w-full pt-2">
        <Cta view={view} full note />
      </div>
    </div>
  );
}

function formatMoney(view: OtoView) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: view.offer.currency.toUpperCase(),
    minimumFractionDigits: view.chargeNowCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: view.chargeNowCents % 100 === 0 ? 0 : 2,
  }).format(view.chargeNowCents / 100);
}

/** Navy close with a checklist — the last word on every layout. */
export function FinalCta({
  view,
  headline,
  checklist,
}: {
  view: OtoView;
  headline: string;
  checklist: string[];
}) {
  return (
    <section className="px-6 py-14 text-white md:px-12 md:py-20" style={{ background: NAVY }}>
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-10 md:grid-cols-12 md:gap-14">
        <div className="flex flex-col gap-5 md:col-span-6">
          <h2 className="font-display text-[clamp(1.7rem,3.8vw,2.6rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-balance">
            {headline}
          </h2>
          {view.recurringNote && (
            <p className="text-[1.02rem] leading-relaxed text-white/80">
              {view.recurringNote}. Cancel any time.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-6 md:col-span-6">
          {checklist.length > 0 && (
            <ul className="flex flex-col gap-3.5">
              {checklist.map((line) => (
                <li key={line} className="flex items-start gap-3">
                  <span
                    className="mt-1 grid size-5 shrink-0 place-items-center rounded-full"
                    style={{ background: "#b0532f" }}
                    aria-hidden
                  >
                    <TickIcon className="size-3 text-white" />
                  </span>
                  <span className="text-[0.98rem] leading-relaxed text-white/85">{line}</span>
                </li>
              ))}
            </ul>
          )}
          <Cta view={view} note tone="band" />
        </div>
      </div>
    </section>
  );
}
