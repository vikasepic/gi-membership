import type { OfferPrice } from "@/lib/offer-prices";
import { Blocks, type CtaRender } from "@/components/page/blocks";
import { CodeSnippets } from "@/components/code-snippets";
import type { StoreRender } from "@/components/page/storefront-blocks";
import { blocksForSection, type GlobalBlocks } from "@/lib/section-to-blocks";
import {
  BAND_PAD_X,
  BAND_PAD_Y_MD,
  buildSectionView,
  layoutIsDefault,
  normalizeSectionLayout,
  sectionBox,
  type SectionRow,
  type SectionView,
} from "@/lib/page-sections";
import { normalizeBackground, type Device } from "@/lib/blocks";
import { backgroundCss } from "@/lib/block-style";
import { inlineCss, inlineJs } from "@/lib/site-typography";
import type { PageSettings } from "@/lib/pages";

// The page, assembled from blocks.
//
// One renderer for the store sales page, the upsell page and the editor's
// preview — and now one SOURCE too. Until this file changed, a band rendered
// through typed components reading defaults-merged content while the builder
// read only what was stored, so an unwritten hero previewed as "The outcome
// they want, in one line." and opened in the builder as an empty canvas. Two
// truths about the same section is worse than either of them.
//
// A section that has never been saved from the builder is converted on read,
// so nothing needed migrating and nothing was lost.

export type PageMoney = {
  /**
   * The headline price — what this costs, formatted. For a subscription that
   * is the recurring charge, not what is taken today: a card reading "$0"
   * under the words "After the trial" is telling the buyer the wrong number,
   * which is what it did until this was split.
   *
   * Never typed by an admin.
   */
  priceLabel: string | null;
  /**
   * Every way to pay this page is selling, in the order the placement stored
   * them. The Ways to pay block draws these; the labels above stay because
   * sixty other things read them.
   */
  prices?: OfferPrice[];
  /** Where the Ways to pay button goes, with the chosen price appended. */
  buyHref?: string | null;
  /** Where declining goes. Only the upsell has anywhere — see BlockMoney. */
  declineHref?: string | null;
  declineLabel?: string | null;
  currency?: string;
  /** Prices for the offers this page's blocks NAME — see lib/block-offers.ts. */
  byOffer?: Record<string, { prices: OfferPrice[]; currency: string; buyHref: string }>;
  /** e.g. "/month". */
  termsLabel: string | null;
  /** What is actually taken today, where that differs — "$0" during a trial. */
  dueNowLabel?: string | null;
  /** The second billing option this placement offers, if it has one. */
  altPriceLabel?: string | null;
  altTermsLabel?: string | null;
  /** "7 days", for the `{trial}` token. Derived, never typed. */
  trialLabel?: string | null;
};

export type { CtaRender } from "@/components/page/blocks";

function Band({
  view,
  background,
  cssId,
  cssClass,
  layout,
  children,
}: {
  view: SectionView;
  background?: unknown;
  cssId?: string | null;
  cssClass?: string | null;
  layout?: unknown;
  children: React.ReactNode;
}) {
  // Over the band's own colour, not instead of it: an image that has not
  // arrived yet leaves the preset showing rather than a white void.
  const bg = background ? normalizeBackground(background) : null;
  const painted = bg && bg.type !== "none" ? backgroundCss(bg, view.theme) : null;

  // A band that says nothing about its layout keeps the classes it has always
  // had, character for character. The style attribute only appears once
  // somebody has actually set something — otherwise `py-12 md:py-16` would be
  // replaced by a single flat number and every live page would shift.
  const l = normalizeSectionLayout(layout);
  const custom = !layoutIsDefault(l);
  const box = sectionBox(layout);

  return (
    <section
      id={cssId || undefined}
      className={`@container ${custom ? "" : "px-6 py-12 md:py-16"} ${cssClass ?? ""}`}
      style={{
        background: view.theme.bg,
        color: view.theme.fg,
        // Only when the band was given a layout: the classes above are the
        // built-in, and a value here would outrank the md: breakpoint they use.
        ...(custom
          ? {
              paddingInline: `${BAND_PAD_X}px`,
              paddingBlock: `${BAND_PAD_Y_MD}px`,
              ...box.outer,
            }
          : {}),
        ...painted,
      }}
    >
      <div className="w-full" style={box.inner}>
        {children}
      </div>
    </section>
  );
}

/** One band, on its own. Used by the editor's per-section preview. */
export function SectionBand({
  row,
  money,
  cta,
  /** Editor only: show the band even when it has nothing in it yet. */
  preview,
  /** Editor only: render as this width sees it, rather than as the window does. */
  at,
  /** The storefront's live data. Only the home page has any. */
  store,
  globals,
}: {
  row: SectionRow;
  money: PageMoney;
  /** The real buy control. Layout is the section's; the money path is not. */
  cta?: CtaRender;
  preview?: boolean;
  at?: Device;
  store?: StoreRender;
  /**
   * The designs this page points at, by id.
   *
   * Absent expands nothing, which is what the builder wants: it draws a
   * pointer itself, as a linked card. A page being read by a visitor always
   * passes one.
   */
  globals?: GlobalBlocks;
}) {
  const view = buildSectionView(row);
  if (!view) return null;
  const blocks = blocksForSection(view, globals);
  // An unwritten band is absent, not empty. The editor still shows it, because
  // that is where you go to fill it in.
  if (blocks.length === 0 && !preview) return null;
  return (
    <Band
      view={view}
      background={row.background}
      cssId={row.cssId}
      cssClass={row.cssClass}
      layout={row.layout}
    >
      <Blocks blocks={blocks} theme={view.theme} money={money} cta={cta} store={store} at={at} />
    </Band>
  );
}

export function SalesPage({
  rows,
  money,
  cta,
  settings,
  globals,
}: {
  rows: SectionRow[];
  money: PageMoney;
  cta?: CtaRender;
  /** Page-level custom code, from the editor's Page settings panel. */
  settings?: PageSettings;
  /** The designs this page points at. See SectionBand. */
  globals?: GlobalBlocks;
}) {
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  const css = settings?.customCss.trim();
  const js = settings?.customJs.trim();
  // This page's own snippets. A sales page is never the checkout, so nothing
  // here is filtered by that — `onCheckout` on a page-level snippet only
  // matters if this component is ever rendered on one.
  const snippets = settings?.snippets ?? [];
  return (
    <div>
      {css && <style dangerouslySetInnerHTML={{ __html: inlineCss(css) }} />}
      {/* `head` first: React lifts these out of here into the document head,
          so a verification meta or a vendor loader lands where it belongs even
          though it was written against one page. */}
      <CodeSnippets snippets={snippets} place="head" onCheckout={false} />
      <CodeSnippets snippets={snippets} place="bodyStart" onCheckout={false} />
      {ordered.map((row) => (
        <SectionBand key={row.sectionKey} row={row} money={money} cta={cta} globals={globals} />
      ))}
      <CodeSnippets snippets={snippets} place="bodyEnd" onCheckout={false} />
      {/* Last, so it runs against a page that exists. `</` is treated by the
          same pair that treats the site-wide custom code — see `inlineCss`. */}
      {js && <script dangerouslySetInnerHTML={{ __html: inlineJs(js) }} />}
    </div>
  );
}
