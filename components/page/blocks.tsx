import { blockRendersNothing, styleFor, type Block, type Device } from "@/lib/blocks";
import { PriceChoice } from "@/components/page/price-choice";
import { StickyBarBlock } from "@/components/page/sticky-bar-block";
import { chosenPrices, priceLabel, type OfferPrice } from "@/lib/offer-prices";
import { Countdown } from "@/components/page/countdown";
import { SlideRail } from "@/components/page/slide-rail";
import { evergreenKey, evergreenMinutes, instantFrom } from "@/lib/countdown";
import { listIconPath } from "@/lib/list-icons";
import { familyToken } from "@/lib/fonts-catalogue";
import {
  CatalogBlock,
  FeaturedBlock,
  MembershipsBlock,
  type StoreRender,
} from "@/components/page/storefront-blocks";
import {
  BuyerDetailsSlot,
  CardFieldsSlot,
  CouponSlot,
  DueTodaySlot,
  OrderBumpSlot,
  OrderSummarySlot,
  PayButtonSlot,
} from "@/components/checkout/slots";
import {
  backgroundCss,
  blockClass,
  blockColors,
  blockCssAt,
  blockRules,
  blockTextRules,
  cardsTrack,
  columnCss,
  rowLayout,
  headingTag,
  softAccent,
  typographyCss,
} from "@/lib/block-style";
import { imageSrc, type BandTheme } from "@/lib/page-sections";
import { videoEmbed, type VideoSource } from "@/lib/video-embed";
import { readableInk as readableOn } from "@/lib/color";

// The block canvas, rendered for a buyer.
//
// No "use client": this is the same code the editor previews, so a preview
// cannot drift from the live page. Everything it needs arrives as props, and
// every colour is resolved against the band at render time rather than read
// from the block — which is what lets a section preset repaint what is
// standing on it.
//
// Markup here is trusted only because it was sanitized on save; see
// sanitizeSectionContent.

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

/**
 * `{trial}` becomes the offer's real trial length.
 *
 * Typed copy is where a page goes stale: "7 days free" survives the day the
 * trial becomes 14. The token is the only way to say it that cannot.
 * Unresolvable — no trial on this offer — it disappears rather than printing
 * the word "{trial}" at a buyer.
 */
const fillTokens = (text: string, money?: BlockMoney): string =>
  text.includes("{trial}")
    ? text.replace(/\{trial\}/g, money?.trialLabel ?? "").replace(/\s{2,}/g, " ").trim()
    : text;
const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown): boolean => v === true;

/**
 * What a price card is allowed to say.
 *
 * Passed down rather than typed into the block, so the only figure a buyer sees
 * is the one the offer actually charges.
 */
export type BlockMoney = {
  /** What it costs — the recurring charge for a subscription, not today's. */
  priceLabel?: string | null;
  termsLabel?: string | null;
  /** What is taken today, where that differs. */
  dueNowLabel?: string | null;
  /**
   * The second billing option this placement offers, already formatted.
   *
   * Passed in rather than typed, for the same reason the first price is: a
   * figure someone typed outlives the price it was copied from.
   */
  altPriceLabel?: string | null;
  altTermsLabel?: string | null;
  /** "7 days" — derived from the offer, so changing the trial changes the page. */
  trialLabel?: string | null;
  /**
   * Every way to pay this page is selling, in the placement's own order.
   *
   * The Ways to pay block draws these. The formatted labels above stay because
   * sixty other things read them, and they are the headline one — see
   * offerAtPrice for how a reader asks about a different price.
   */
  prices?: OfferPrice[];
  currency?: string;
  /** Where the Ways to pay button goes; the chosen price is appended to it. */
  buyHref?: string | null;
  /**
   * The one-click token, when this page IS an upsell.
   *
   * Present only there. A buy control given one charges the card already on
   * file instead of linking to a checkout — which is the whole proposition of
   * an upsell, and what a `prices` block dropped on one was quietly undoing by
   * sending the buyer back to a form for the card they had just used.
   */
  otoToken?: string | null;
  /**
   * Where declining goes, and what it is called.
   *
   * Present only on a page that HAS somewhere to decline to — the upsell,
   * where the alternative is the thank-you page we are about to send them to
   * anyway. A sales page has none: the way to decline one is to leave it. So
   * this is not a field on the block, because a block cannot know which page
   * it was dropped on and a field that has to be right is a field that will be
   * wrong.
   */
  declineHref?: string | null;
  declineLabel?: string | null;
  /**
   * Prices for the offers this page's blocks NAME, keyed by offer id.
   *
   * A Ways to pay block on an offer's own page draws the page's prices above;
   * one that names an offer draws from here. Resolved server-side in one pass —
   * see lib/block-offers.ts — so the renderer never asks the database anything.
   */
  byOffer?: Record<string, { prices: OfferPrice[]; currency: string; buyHref: string }>;
};

/**
 * The page's own buy control.
 *
 * A renderer, not a node, so a button's label stays editable while the page
 * supplies the link or the one-click form. Without it a "buy" button renders
 * as plain text — which is what a sales page that cannot be bought from looks
 * like, and is exactly what happened here.
 */
export type CtaRender = (label: string, theme: BandTheme) => React.ReactNode;

/**
 * A button's fixed part: padding and family only.
 *
 * `w-fit` and `font-semibold` used to live here and were quietly overruling two
 * controls the editor offers. Anything the editor can set now comes through the
 * block's own style, where it can actually win.
 */
const BUTTON_CLASS = "px-7 py-3 font-display text-[0.95rem]";

/**
 * Text where the line breaks someone typed are the line breaks they get.
 *
 * A heading was rendered as a plain child, so HTML collapsed every newline into
 * a space — pressing Enter did nothing. Typing <br> did not work either,
 * because a plain child is escaped: what appeared on the page was the four
 * characters, which reads as the editor being broken rather than strict.
 *
 * So both are honoured: a typed <br> becomes a real break, and the result is
 * rendered with `pre-line` so the Enter key works on its own. Still text and
 * still escaped — a heading that ran arbitrary HTML would be a way to put a
 * script on a sales page.
 */
const BREAK = /<br\s*\/?>/gi;
export function withLineBreaks(value: string): string {
  return value.replace(BREAK, "\n");
}

/**
 * One line of copy that may carry inline markup.
 *
 * These fields — a heading, a question, a card's title — used to render as
 * plain text, so <b>this</b> showed its angle brackets. They are sanitized on
 * save by sanitizeInlineHtml, which allows what formats and nothing that
 * executes, so what is stored is already safe to hand to the page.
 *
 * Rendered through a real element rather than a fragment because the callers
 * need to keep their class and style — the block's own rule is what carries
 * size, weight and colour.
 */
/**
 * What a tinted card falls back to when the block states neither.
 *
 * These are the two figures the skin used to hard-code. They are the values
 * every tinted card on a live page is already drawing, so they are a baseline
 * rather than a preference — moving either repaints work nobody touched.
 */
const TINTED_CARD_RADIUS = 3;
const TINT_ALPHA = 0.12;

/**
 * A card's padding, whether it was saved as one number or as four sides.
 *
 * It shipped as a single figure, and a card is a box like any other — the
 * top and the sides almost never want to be equal. Four sides is a `Dim`, the
 * same shape Margin and Padding use everywhere else; a stored number still
 * means all four, so nothing already saved moves.
 *
 * Null is not zero. Each skin pads differently and Plain pads not at all, so
 * unset has to keep meaning "whatever the skin does".
 */
function cardPadCss(v: unknown): React.CSSProperties {
  if (v == null) return {};
  if (typeof v === "number") return { padding: `${v}px` };
  if (typeof v !== "object") return {};
  const d = v as Record<string, unknown>;
  const u = typeof d.u === "string" ? d.u : "px";
  const side = (k: string) => `${num(d[k], 0)}${u}`;
  return { padding: `${side("t")} ${side("r")} ${side("b")} ${side("l")}` };
}

function Inline({
  as: Tag = "span",
  html,
  ...rest
}: {
  as?: React.ElementType;
  html: string;
} & React.HTMLAttributes<HTMLElement>) {
  return <Tag {...rest} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Blocks({
  blocks,
  theme,
  money,
  cta,
  store,
  at,
}: {
  blocks: Block[];
  theme: BandTheme;
  money?: BlockMoney;
  cta?: CtaRender;
  /**
   * The catalogue, the memberships and who owns what, already resolved.
   *
   * Supplied by the storefront and by nothing else. Absent — every sales page —
   * the three storefront blocks draw nothing, which is what a Catalogue block
   * pasted onto a product page should do.
   */
  store?: StoreRender;
  /**
   * Render as this device would see it, rather than letting the viewport
   * decide. For a preview pane narrower than the window, where the real media
   * queries would not fire. Unset on the live page, which has a real viewport.
   */
  at?: Device;
}) {
  const showing = blocks.filter((b) => !blockRendersNothing(b));
  if (showing.length === 0) return null;
  return <div className="mt-7 flex flex-col">{flow(showing, theme, money, cta, store, at)}</div>;
}

/**
 * Buttons that sit next to each other, sit next to each other.
 *
 * A primary and a secondary call to action belong on one line — stacking them
 * makes the second one look like a second offer. They stay separate blocks, so
 * each is still selected, dragged and styled on its own; only the rendering
 * puts a run of them on one row.
 */
function flow(blocks: Block[], theme: BandTheme, money?: BlockMoney, cta?: CtaRender, store?: StoreRender, at?: Device): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Every block carries a bottom margin, which is the only thing separating one
  // from the next — nothing here has a container gap. The last one has nothing
  // below it to be separated from, so its margin is dead space at the foot of
  // the section or inside the bottom of a column, and it is what made a card
  // look as though its padding was uneven.
  //
  // Read off the array rather than counted during the loop: both callers filter
  // out the blocks that render nothing before getting here, so the last entry
  // is the last thing on screen and not an empty block holding the position.
  const lastId = blocks.length > 0 ? blocks[blocks.length - 1].id : null;
  for (let i = 0; i < blocks.length; ) {
    if (blocks[i].type === "button" && blocks[i + 1]?.type === "button") {
      let j = i;
      while (j < blocks.length && blocks[j].type === "button") j++;
      out.push(
        <div key={blocks[i].id} className="flex flex-wrap items-center gap-3">
          {blocks.slice(i, j).map((b) => (
            <BlockNode key={b.id} block={b} theme={theme} money={money} cta={cta} store={store} at={at} last={b.id === lastId} />
          ))}
        </div>,
      );
      i = j;
    } else {
      out.push(
        <BlockNode
          key={blocks[i].id}
          block={blocks[i]}
          theme={theme}
          money={money}
          cta={cta}
          store={store}
          at={at}
          last={blocks[i].id === lastId}
        />,
      );
      i++;
    }
  }
  return out;
}

function BlockNode({
  block,
  theme,
  money,
  cta,
  store,
  at,
  last,
}: {
  block: Block;
  theme: BandTheme;
  money?: BlockMoney;
  cta?: CtaRender;
  store?: StoreRender;
  at?: Device;
  /** Nothing follows it, so its bottom margin separates it from nothing. */
  last?: boolean;
}) {
  // An unfilled block would otherwise emit a wrapper carrying its padding and
  // margin — a gap on the page that nobody placed.
  if (blockRendersNothing(block)) return null;
  const s = styleFor(block, at ?? "desktop");
  // On a real viewport the look is emitted as rules, not a style attribute: a
  // media query cannot live in an attribute, and an attribute would outrank the
  // media query anyway. Pinned to a device it is the attribute — plus the one
  // half an attribute cannot express, the rule that names the text inside the
  // block so the preview's own `.site-type h2` does not beat it there.
  const base = at ? blockTextRules(block, at) : blockRules(block, theme);
  // Appended last, at the same specificity as the rule it corrects and after
  // that rule's own media queries, so it wins on order rather than by shouting.
  // A per-device margin override would otherwise put the gap back on a phone.
  const rules = last && !at ? `${base}.${blockClass(block)}.${blockClass(block)}{margin-bottom:0}` : base;
  return (
    <>
      {rules && <style dangerouslySetInnerHTML={{ __html: rules }} />}
      <div
        id={s.cssId || undefined}
        className={[blockClass(block), s.cssClass].filter(Boolean).join(" ")}
        // Pinned to a device the look is an attribute, so the correction has to
        // be one too — the editor canvas draws through this path.
        style={
          at ? (last ? { ...blockCssAt(block, theme, at), marginBottom: 0 } : blockCssAt(block, theme, at)) : undefined
        }
        hidden={at ? hiddenAt(block, at) : undefined}
      >
        <Inner block={block} theme={theme} money={money} cta={cta} store={store} at={at} />
      </div>
    </>
  );
}

/** Whether this block is switched off at the width being previewed. */
function hiddenAt(block: Block, at: Device): boolean {
  const s = styleFor(block, at);
  return at === "mobile" ? s.hideMobile : at === "tablet" ? s.hideTablet : s.hideDesktop;
}

/**
 * One block's content, with no wrapper.
 *
 * Exported so the editor canvas shows the real thing rather than a mock-up of
 * it. The editor supplies its own wrapper because it has to add selection
 * chrome and drop zones, but what is inside is this — one implementation, so a
 * preview cannot drift from the page a buyer gets.
 */
export function BlockBody({
  block,
  theme,
  at,
  store,
  money,
}: {
  block: Block;
  theme: BandTheme;
  at?: Device;
  /** The builder passes a preview payload so the storefront blocks draw here
   *  too. Without it they render nothing, which in an editor reads as broken. */
  store?: StoreRender;
  /**
   * And the prices, for the same reason.
   *
   * A Ways to pay block resolves its offer on the server when a page renders.
   * The builder has no such pass, so without this it drew "that offer has no
   * price showing" over an offer that has several — an editor telling the truth
   * about nothing and a lie about the block in front of you.
   */
  money?: BlockMoney;
}) {
  return <Inner block={block} theme={theme} at={at} store={store} money={money} />;
}

function Inner({
  block,
  theme,
  money,
  cta,
  store,
  at,
}: {
  block: Block;
  theme: BandTheme;
  money?: BlockMoney;
  cta?: CtaRender;
  store?: StoreRender;
  at?: Device;
}) {
  const s = styleFor(block, at ?? "desktop");
  const p = block.props;
  const c = blockColors(block, theme, s);
  /**
   * The block's typography as an ATTRIBUTE, at the width being drawn.
   *
   * Spread onto the elements `blockRules` cannot name: TEXT_TAGS is a list of
   * tags, and most of what a Cards, Stats, Pricing, FAQ or Button block draws
   * is a `span`, a `div` or a `button`. Without this they would take the
   * band's default type and nothing typed into the panel would reach them.
   *
   * The cost is that on the live page `at` is undefined, so these carry the
   * DESKTOP values and an attribute outranks every media query — which means
   * the device switch is inert for exactly those elements. Fixing it needs the
   * rule to be able to reach them (a class on each, or a `*` arm), not the
   * removal of this; see the note on TEXT_TAGS.
   */
  const type = typographyCss(s);

  switch (block.type) {
    case "heading": {
      const Tag = headingTag(p.tag);
      return (
        // Size, weight, line height, tracking and colour all arrive from the
        // block's own rule — including the per-tag default — so that a value
        // set on mobile is not outranked by a utility class here.
        <Inline
          as={Tag}
          // No `text-balance` here. It evens the line lengths, which means it
          // wraps NARROWER than the box on purpose — a heading given a measure
          // of 980px broke at about 840 and looked like the width had not
          // applied. Yielding to a stated measure only moved the problem to
          // every heading nobody had typed a width into: the lines still broke
          // somewhere no panel could reach.
          //
          // The class stays on the pages that are not built block by block —
          // the error page, the checkout panel, the OTO kit, the storefront.
          // This is a builder heading, and where it breaks is the owner's.
          className="font-display"
          style={{ whiteSpace: "pre-line" }}
          html={withLineBreaks(str(p.text))}
        />
      );
    }

    case "text":
      return (
        <div
          // `rich` carries the heading scale — see app/globals.css. The h3
          // arbitrary variants that used to be here did the same job for one
          // level out of six, and set no size even for that one.
          className="rich"
          dangerouslySetInnerHTML={{ __html: str(p.html) }}
        />
      );

    case "prices": {
      // Named offer first, then whatever this page is already selling.
      const named = str(p.offerId) ? money?.byOffer?.[str(p.offerId)] : undefined;
      // Only the ways to pay this block was told to show. Deliberately NOT
      // `shownPrices`, which is the placement rule: empty there means the
      // headline price alone, and empty here means the whole menu — including
      // a price added after this block was saved.
      const list = chosenPrices(named?.prices ?? money?.prices ?? [], p.priceIds);
      const currency = named?.currency ?? money?.currency ?? "usd";
      const href = named?.buyHref ?? money?.buyHref ?? null;
      if (list.length === 0) {
        // Nothing to choose between yet. Said out loud rather than drawn as an
        // empty box: on a page being built this is a step that has not been
        // done, not a block that is broken.
        return (
          <p
            className="rounded-xl border border-dashed px-3 py-4 text-center text-sm"
            style={{ color: theme.muted, borderColor: theme.rule }}
          >
            {str(p.offerId)
              ? "That offer has no price showing, or is switched off."
              : "Pick which offer this sells on the Content tab — or leave it blank on an offer's own page."}
          </p>
        );
      }
      return (
        // Named in the DOM so the sticky bar can find it without anybody
        // having to type an id.
        <div data-ways-to-pay>
          <PriceChoice
            prices={list}
            currency={currency}
            heading={str(p.heading)}
            note={str(p.note)}
            acceptLabel={str(p.acceptLabel, "Get instant access")}
            // On an upsell the token wins and the link is not used at all —
            // there is no checkout to send anybody to.
            href={money?.otoToken ? null : href}
            otoToken={money?.otoToken ?? null}
            declineHref={money?.declineHref ?? null}
            declineLabel={money?.declineLabel ?? null}
            band={{ fg: c.fg, muted: theme.muted, rule: theme.rule, accent: c.accent, panel: theme.panel }}
            s={{
              optionBg: str(p.optionBg) || null,
              optionBorder: str(p.optionBorder) || null,
              optionRadius: num(p.optionRadius, 12),
              selectedColor: str(p.selectedColor) || null,
              selectedBg: str(p.selectedBg) || null,
              selectedTextColor: str(p.selectedTextColor) || null,
              labelColor: str(p.labelColor) || null,
              termsColor: str(p.termsColor) || null,
              headingColor: str(p.headingColor) || null,
              noteColor: str(p.noteColor) || null,
              headingSize: p.headingSize == null ? null : num(p.headingSize, 0),
              priceSize: p.priceSize == null ? null : num(p.priceSize, 0),
              termsSize: p.termsSize == null ? null : num(p.termsSize, 0),
              noteSize: p.noteSize == null ? null : num(p.noteSize, 0),
              declineColor: str(p.declineColor) || null,
              declineSize: p.declineSize == null ? null : num(p.declineSize, 0),
              dueTodayColor: str(p.dueTodayColor) || null,
              dueTodaySize: p.dueTodaySize == null ? null : num(p.dueTodaySize, 0),
              buttonSize: p.buttonSize == null ? null : num(p.buttonSize, 0),
              align: (str(p.align, "center") as "left" | "center" | "right"),
              badgeBg: str(p.badgeBg) || null,
              badgeColor: str(p.badgeColor) || null,
              buttonBg: str(p.buttonBg) || null,
              buttonColor: str(p.buttonColor) || null,
              buttonRadius: num(p.buttonRadius, 999),
              showTerms: p.showTerms !== false,
              showCompareAt: p.showCompareAt !== false,
              showSaving: p.showSaving !== false,
              showDueToday: p.showDueToday !== false,
            }}
          />
        </div>
      );
    }

    case "stickybar": {
      const first = money?.prices?.[0] ?? null;
      return (
        <StickyBarBlock
          text={str(p.text)}
          buttonLabel={str(p.buttonLabel, "Get instant access")}
          scrollTo={str(p.scrollTo)}
          position={str(p.position, "bottom") === "top" ? "top" : "bottom"}
          priceLine={
            p.showPrice !== false && first
              ? `${priceLabel(first, money?.currency ?? "usd")}`
              : null
          }
          background={str(p.background) || null}
          textColor={str(p.textColor) || null}
          buttonBg={str(p.buttonBg) || null}
          buttonColor={str(p.buttonColor) || null}
          buttonRadius={num(p.buttonRadius, 999)}
          band={{ fg: c.fg, panel: theme.panel, rule: theme.rule, accent: c.accent }}
        />
      );
    }

    case "countdown": {
      const evergreen = str(p.kind) === "evergreen";
      const due = str(p.due).trim();
      if (!evergreen && !due) return null;
      // UTC when the block names no zone. Not the viewer's zone and not the
      // editor's: either would make one deadline mean different moments to
      // different people, which is the defect this block exists to avoid. A
      // store-wide default belongs in Site settings and is not built yet.
      const zone = str(p.zone) || "UTC";
      // Evergreen has no server-side deadline: it depends on when this browser
      // first saw the block, which only that browser knows. The clock resolves
      // it on mount.
      const minutes = evergreenMinutes(num(p.evDays, 0), num(p.evHours, 0), num(p.evMinutes, 0));
      const deadline = evergreen ? null : instantFrom(due, zone);
      // An unreadable date draws nothing rather than a row of zeros that looks
      // like a deadline everybody missed.
      if (!evergreen && deadline === null) return null;

      const custom = p.customLabels === true;
      const label = (many: string, one: string, dMany: string, dOne: string) =>
        custom
          ? { one: str(p[one], dOne) || dOne, many: str(p[many], dMany) || dMany }
          : { one: dOne, many: dMany };

      const gap = num(p.boxGap, 10);
      const boxPad = num(p.boxPadding, 14);
      const fill = str(p.boxBackground);

      return (
        <Countdown
          deadline={deadline}
          evergreen={
            evergreen
              ? {
                  key: evergreenKey(block.id, minutes),
                  minutes,
                  restartAfterDays: num(p.evRestartDays, 0),
                }
              : undefined
          }
          units={{
            days: p.showDays !== false,
            hours: p.showHours !== false,
            minutes: p.showMinutes !== false,
            seconds: p.showSeconds !== false,
          }}
          showLabel={p.showLabel !== false}
          labels={{
            days: label("labelDays", "labelDay", "days", "day"),
            hours: label("labelHours", "labelHour", "hours", "hour"),
            minutes: label("labelMinutes", "labelMinute", "minutes", "minute"),
            seconds: label("labelSeconds", "labelSecond", "seconds", "second"),
          }}
          leadingZero={p.leadingZero !== false}
          separator={str(p.separator)}
          onExpire={
            (["keep", "hide", "message", "redirect"] as const).find((k) => k === str(p.onExpire)) ??
            "keep"
          }
          redirectTo={str(p.redirectTo)}
          message={
            str(p.expiredMessage) ? (
              <p className="text-[0.95rem]" style={{ color: c.fg }}>
                <Inline html={str(p.expiredMessage)} />
              </p>
            ) : null
          }
          classes={{
            list: `flex flex-wrap items-stretch ${str(p.layout) === "stretch" ? "justify-between" : ""}`,
            box: "flex flex-col items-center justify-center text-center",
            digit: "font-display tabular-nums leading-none",
            label: "mt-1.5 leading-none",
            sep: "self-center font-display leading-none",
          }}
          styles={{
            list: { gap },
            box: {
              padding: boxPad,
              borderRadius: num(p.boxRadius, 10),
              // Unset follows the band's own panel, so a countdown dropped on a
              // navy band is not a white box nobody asked for.
              background: fill || c.fill,
              minWidth: num(p.boxMinWidth, 0) > 0 ? num(p.boxMinWidth, 0) : "3.5em",
              ...(num(p.boxBorderWidth, 0) > 0
                ? { border: `${num(p.boxBorderWidth, 0)}px solid ${str(p.boxBorderColor) || c.rule}` }
                : {}),
              ...(num(p.boxShadowBlur, 0) > 0 || num(p.boxShadowY, 0) !== 0
                ? {
                    boxShadow: `0 ${num(p.boxShadowY, 0)}px ${num(p.boxShadowBlur, 0)}px ${
                      str(p.boxShadowColor) || "rgba(0,0,0,0.14)"
                    }`,
                  }
                : {}),
            },
            digit: {
              fontFamily: str(p.digitFont) ? familyToken(str(p.digitFont)) : undefined,
              fontSize: p.digitSize != null ? num(p.digitSize, 34) : "2rem",
              fontWeight: str(p.digitWeight) ? Number(str(p.digitWeight)) : 700,
              color: str(p.digitColor) || c.fg,
              ...(p.digitLineHeight != null ? { lineHeight: num(p.digitLineHeight, 1) } : {}),
              ...(p.digitLetterSpacing != null ? { letterSpacing: `${num(p.digitLetterSpacing, 0)}px` } : {}),
            },
            label: {
              fontFamily: str(p.labelFont) ? familyToken(str(p.labelFont)) : undefined,
              fontSize: p.labelSize != null ? num(p.labelSize, 12) : "0.72rem",
              fontWeight: str(p.labelWeight) ? Number(str(p.labelWeight)) : undefined,
              color: str(p.labelColor) || theme.muted,
              ...(str(p.labelCase) ? { textTransform: str(p.labelCase) as "uppercase" } : {}),
              ...(p.labelLetterSpacing != null ? { letterSpacing: `${num(p.labelLetterSpacing, 0)}px` } : {}),
            },
          }}
        />
      );
    }

    // Live store data. Without a `store` payload — every sales page — these
    // draw nothing at all rather than an empty heading or a box with a rule in
    // it, because a Catalogue block pasted onto a product page is a mistake and
    // should look like nothing rather than like a broken section.
    case "catalog":
      return store ? (
        <CatalogBlock
          store={store}
          title={str(p.title)}
          columns={num(p.columns, 3)}
          limit={num(p.limit, 0)}
          showPrice={p.showPrice !== false}
        />
      ) : null;

    case "memberships":
      return store ? (
        <MembershipsBlock store={store} title={str(p.title)} showOwned={p.showOwned !== false} />
      ) : null;

    case "featured":
      return store ? (
        <FeaturedBlock store={store} title={str(p.title)} note={str(p.note)} />
      ) : null;

    // The live checkout. These need no payload prop of their own: each one
    // reads the form out of React context, and the form is what renders the
    // block tree. Anywhere else there is no context, so each draws nothing —
    // the same answer the storefront blocks give on a sales page, reached
    // without threading a seventh argument through every render call.
    case "buyerdetails":
      return (
        <BuyerDetailsSlot
          title={str(p.title)}
          namePlaceholder={str(p.namePlaceholder)}
          emailPlaceholder={str(p.emailPlaceholder)}
          countryPlaceholder={str(p.countryPlaceholder)}
          note={str(p.note)}
          titleColor={str(p.titleColor) || null}
          titleSize={p.titleSize == null ? null : num(p.titleSize, 12)}
          noteColor={str(p.noteColor) || null}
          noteSize={p.noteSize == null ? null : num(p.noteSize, 12)}
          inputBg={str(p.inputBg) || null}
          inputBorder={str(p.inputBorder) || null}
          inputColor={str(p.inputColor) || null}
          radius={p.radius == null ? null : num(p.radius, 12)}
        />
      );

    case "orderbump":
      return (
        <OrderBumpSlot
          title={str(p.title)}
          titleColor={str(p.titleColor) || null}
          titleSize={p.titleSize == null ? null : num(p.titleSize, 12)}
        />
      );

    case "ordersummary":
      return (
        <OrderSummarySlot
          title={str(p.title)}
          showThumb={p.showThumb !== false}
          showLines={p.showLines !== false}
          showTax={p.showTax !== false}
          titleSize={p.titleSize == null ? null : num(p.titleSize, 12)}
          textSize={p.textSize == null ? null : num(p.textSize, 14)}
          labelColor={str(p.labelColor) || null}
          valueColor={str(p.valueColor) || null}
          ruleColor={str(p.ruleColor) || null}
        />
      );

    case "coupon":
      return (
        <CouponSlot
          label={str(p.label)}
          placeholder={str(p.placeholder)}
          buttonLabel={str(p.buttonLabel)}
          labelColor={str(p.labelColor) || null}
          inputBg={str(p.inputBg) || null}
          inputBorder={str(p.inputBorder) || null}
          inputColor={str(p.inputColor) || null}
          buttonBg={str(p.buttonBg) || null}
          buttonColor={str(p.buttonColor) || null}
          radius={p.radius == null ? null : num(p.radius, 10)}
        />
      );

    case "cardfields":
      return (
        <CardFieldsSlot
          heading={str(p.heading)}
          headingColor={str(p.headingColor) || null}
          headingSize={p.headingSize == null ? null : num(p.headingSize, 12)}
        />
      );

    case "duetoday":
      return (
        <DueTodaySlot
          label={str(p.label)}
          labelColor={str(p.labelColor) || null}
          amountColor={str(p.amountColor) || null}
          labelSize={p.labelSize == null ? null : num(p.labelSize, 15)}
          amountSize={p.amountSize == null ? null : num(p.amountSize, 24)}
          showTerms={p.showTerms !== false}
          termsColor={str(p.termsColor) || null}
          termsSize={p.termsSize == null ? null : num(p.termsSize, 13)}
        />
      );

    case "paybutton":
      return (
        <PayButtonSlot
          label={str(p.label)}
          trialLabel={str(p.trialLabel)}
          bg={str(p.bg) || null}
          color={str(p.color) || null}
          radius={p.radius == null ? null : num(p.radius, 999)}
          size={p.size == null ? null : num(p.size, 16)}
          fullWidth={p.fullWidth !== false}
          note={str(p.note)}
          noteColor={str(p.noteColor) || null}
          noteSize={p.noteSize == null ? null : num(p.noteSize, 12)}
        />
      );

    case "image": {
      const src = imageSrc(str(p.url));
      if (!src) return null;
      // "auto" means show the whole picture. Without dropping objectFit as
      // well, the image would keep being cropped to a box it no longer has.
      const ratio = str(p.ratio, "16/9");
      const whole = ratio === "auto";
      // Block position moves the PICTURE, not only the box around it.
      //
      // An image has a width control of its own, and the two fought: Max width
      // shrinks the picture inside a box that is still the full column, so
      // "Centre" moved a box that had nowhere to go and the picture stayed
      // hard left. Auto margins on the image itself settle it whatever the
      // wrapper is doing — and when the wrapper HAS shrunk to the picture,
      // they are worth nothing and cost nothing.
      const shift = str(s.blockAlign, "left");
      const img = (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={str(p.alt)}
          style={{
            display: "block",
            width: "100%",
            height: whole ? "auto" : undefined,
            maxWidth: `${num(p.maxWidth, 100)}%`,
            marginLeft: shift === "left" ? undefined : "auto",
            marginRight: shift === "center" ? "auto" : undefined,
            aspectRatio: whole ? undefined : ratio,
            objectFit: whole ? undefined : "cover",
            borderRadius: s.radius ? `${s.radius}px` : undefined,
          }}
        />
      );
      const link = str(p.link);
      return (
        <figure style={{ margin: 0 }}>
          {link ? (
            <a href={link} rel="noopener noreferrer">
              {img}
            </a>
          ) : (
            img
          )}
          {str(p.caption) && (
            <figcaption className="mt-2 text-[0.8rem]" style={{ color: theme.muted }}>
              {str(p.caption)}
            </figcaption>
          )}
        </figure>
      );
    }

    case "video": {
      const embed = videoEmbed(str(p.source, "youtube") as VideoSource, str(p.url), {
        autoplay: bool(p.autoplay),
        mute: bool(p.mute),
        loop: bool(p.loop),
        controls: p.controls !== false,
      });
      const ratio = str(p.ratio, "16/9");
      const radius = s.radius ? `${s.radius}px` : "12px";
      // A link we do not recognise renders the poster rather than an empty
      // frame, so a mistyped URL looks like a missing video and not a broken
      // page. It is never framed.
      if (!embed) {
        const poster = imageSrc(str(p.poster));
        return poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" style={{ width: "100%", aspectRatio: ratio, objectFit: "cover", borderRadius: radius }} />
        ) : null;
      }
      if (embed.kind === "file") {
        return (
          <video
            src={embed.src}
            poster={imageSrc(str(p.poster)) ?? undefined}
            controls={p.controls !== false}
            muted={bool(p.mute)}
            loop={bool(p.loop)}
            playsInline
            style={{ width: "100%", aspectRatio: ratio, borderRadius: radius, background: "#0b0b0d" }}
          />
        );
      }
      return (
        <div style={{ aspectRatio: ratio, borderRadius: radius, overflow: "hidden", background: "#0b0b0d" }}>
          <iframe
            src={embed.src}
            title={`${embed.provider} video`}
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ width: "100%", height: "100%", border: 0, display: "block" }}
          />
        </div>
      );
    }

    case "button": {
      // No w-fit, and no font-semibold: both were fighting settings the editor
      // offers. Size and weight arrive inline from the block's own style.
      const label = str(p.text);
      if (!label) return null;
      // An outline button carries the band's text colour on the band itself,
      // so it reads as the quieter of the two without needing its own palette.
      const outline = str(p.variant) === "outline";
      const full = bool(p.fullWidth);
      // The pill carries whatever the block's background says — a colour, or a
      // gradient. It used to take `c.fill` alone, which is one flat colour, so
      // a two-colour button could only be had through Custom CSS with an
      // `!important` on it. That made the Background control dead: the panel
      // said #6b5757 and the button stayed a gradient, with nothing on screen
      // to explain why.
      const painted = s.background.type !== "none" ? backgroundCss(s.background, theme) : null;
      const style: React.CSSProperties = {
        ...(outline ? { background: "transparent" } : (painted ?? { background: c.fill })),
        color: outline ? theme.fg : c.fg,
        border: outline ? `1px solid ${theme.rule}` : undefined,
        borderRadius: `${s.radius || 999}px`,
        // Full width has to set the WIDTH. It used to set display:block next to
        // a w-fit class that pinned the width to fit-content, so the button
        // became block-level and stayed exactly as wide as its label — and a
        // block-level box ignores the wrapper's text-align, which is why Align
        // did nothing either. Inline-block is what lets Align work at all.
        display: full ? "block" : "inline-block",
        width: full ? "100%" : undefined,
        textAlign: "center",
        ...type,
      };
      // A buy button with no control to render is plain text — a sales page
      // nobody can buy from. Rendered through the page's own control instead.
      // Named in the DOM so a sticky bar can find the call to action without
      // anybody having to type an id — the same way the Ways to pay block is.
      if (str(p.action, "link") === "buy" && cta)
        return <span data-buy>{cta(label, theme)}</span>;
      const link = str(p.link);
      return link ? (
        <a href={link} className={BUTTON_CLASS} style={style}>
          {label}
        </a>
      ) : (
        <span className={BUTTON_CLASS} style={style}>
          {label}
        </span>
      );
    }

    case "iconlist": {
      const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
      if (items.length === 0) return null;
      const size = num(p.iconSize, 16);
      const marker = str(p.marker, "check");
      const path = listIconPath(marker === "fa" ? "check" : marker);
      // The space between a mark and its words, which used to be the same
      // number as the space between lines — so neither could be set without
      // moving the other.
      const iconGap = num(p.iconGap, 10);
      const listImage = imageSrc(str(p.markerImage));
      // A chosen Font Awesome icon travels as its own path, so the page needs
      // no library to draw it and no request to find it.
      const fa =
        marker === "fa" && p.markerIcon && typeof p.markerIcon === "object"
          ? (p.markerIcon as { v?: unknown; d?: unknown })
          : null;
      const faPath = fa && typeof fa.d === "string" ? fa.d : null;
      const faBox = fa && typeof fa.v === "string" ? fa.v : "0 0 512 512";
      const markFor = (item: Record<string, unknown>) => {
        // A line's own picture wins, then the list's, then the drawn mark.
        const own = imageSrc(str(item.image));
        const src = own ?? (marker === "image" ? listImage : null);
        if (src) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              aria-hidden
              className="shrink-0"
              style={{ width: size, height: size, objectFit: "contain", marginTop: "0.15em" }}
            />
          );
        }
        if (faPath) {
          return (
            <svg
              viewBox={faBox}
              aria-hidden
              focusable="false"
              className="shrink-0"
              style={{
                width: size,
                height: size,
                marginTop: "0.15em",
                fill: str(p.iconColor) || c.accent,
              }}
            >
              <path d={faPath} />
            </svg>
          );
        }
        if (!path) return null;
        return (
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            focusable="false"
            className="shrink-0"
            style={{
              width: size,
              height: size,
              // Optically on the first line rather than above it: a 24px mark
              // beside 16px text sits high without this.
              marginTop: "0.15em",
              fill: str(p.iconColor) || c.accent,
            }}
          >
            <path d={path} />
          </svg>
        );
      };
      return (
        <ul
          className={`flex list-none p-0 ${str(p.layout) === "inline" ? "flex-row flex-wrap" : "flex-col"}`}
          style={{ gap: `${num(p.gap, 8)}px`, color: c.fg, ...type }}
        >
          {items.map((item, i) => (
            <li key={i} className="flex items-start" style={{ gap: `${iconGap}px` }}>
              {markFor(item)}
              <Inline html={str(item.text)} />
            </li>
          ))}
        </ul>
      );
    }

    case "slides": {
      const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
      if (items.length === 0) return null;
      // Up to six. Three was an arbitrary ceiling and a set of six logos or
      // small portraits is a normal thing to want.
      const perView = Math.min(Math.max(num(p.perView, 1), 1), 6);
      const rail = (list: React.ReactNode) => (
        <SlideRail
          arrows={p.arrows !== false}
          dots={p.dots !== false}
          count={items.length}
          perView={perView}
          accent={c.accent}
          ink={readableOn(c.accent)}
        >
          {list}
        </SlideRail>
      );
      // The quote laid over the speaker's own photograph.
      //
      // Its own skin rather than a second block: the strip, the snapping, the
      // per-view arithmetic and the quote/name/role are all the same, and only
      // the inside of the card differs. A slide with no photograph falls back
      // to the plain panel, so a half-filled set degrades to something that
      // still reads rather than to a row of empty boxes.
      if (str(p.skin) === "portrait") {
        // The colour the quote stands on, and therefore the ink over it.
        const wash = c.fill;
        const overInk = readableOn(wash);
        return rail(
          <ul className="-mx-1 flex list-none snap-x snap-mandatory gap-4 overflow-x-auto p-0 px-1 pb-2">
            {items.map((item, i) => {
              const photo = imageSrc(str(item.image));
              return (
                <li
                  key={i}
                  className="relative flex min-w-0 shrink-0 snap-start flex-col justify-end overflow-hidden"
                  style={{
                    flexBasis: `calc(${100 / perView}% - ${((perView - 1) * 16) / perView}px)`,
                    aspectRatio: "3 / 4",
                    borderRadius: `${s.radius || 16}px`,
                    background: c.fill,
                  }}
                >
                  {photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  {/* The wash the words stand on. Transparent at the top so the
                      face is not muddied, opaque by the bottom so the quote is
                      readable whatever the photograph is doing down there. */}
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(to top, ${wash} 0%, ${wash}f2 42%, ${wash}00 100%)`,
                    }}
                  />
                  <div className="relative p-5">
                    <span
                      aria-hidden
                      className="block font-display text-[2.6rem] leading-[0.6] opacity-60"
                      style={{ color: overInk }}
                    >
                      &ldquo;
                    </span>
                    <p
                      className="mt-3 mb-0 text-[0.95rem] leading-snug"
                      style={{ color: overInk, ...type, whiteSpace: "pre-line" }}
                    >
                      {withLineBreaks(str(item.quote))}
                    </p>
                    {(str(item.name) || str(item.role)) && (
                      <div
                        className="mt-4 pt-3"
                        style={{ borderTop: `1px solid ${overInk}59` }}
                      >
                        <span
                          className="block text-[0.86rem] font-semibold uppercase tracking-[0.06em]"
                          style={{ color: overInk }}
                        >
                          {str(item.name)}
                        </span>
                        {str(item.role) && (
                          <span
                            className="block text-[0.82rem] opacity-80"
                            style={{ color: overInk }}
                          >
                            {str(item.role)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        );
      }
      // Scroll-snap rather than a JavaScript carousel: it swipes on touch,
      // scrolls with a trackpad, works with the keyboard, and needs no client
      // bundle on a page whose job is to load fast and take a payment. The rail
      // adds arrows and dots on top of that, once it has mounted — the strip
      // could always be scrolled and had no way of saying so.
      return rail(
        <ul className="-mx-1 flex list-none snap-x snap-mandatory gap-4 overflow-x-auto p-0 px-1 pb-2">
          {items.map((item, i) => (
            <li
              key={i}
              className="min-w-0 shrink-0 snap-start rounded-2xl px-5 py-4"
              style={{
                flexBasis: `calc(${100 / perView}% - ${((perView - 1) * 16) / perView}px)`,
                background: c.fill,
                color: c.fg,
                border: str(p.skin) === "bordered" ? `1px solid ${c.rule}` : undefined,
              }}
            >
              <p className="m-0" style={type}>
                <span style={{ whiteSpace: "pre-line" }}>
                  &ldquo;{withLineBreaks(str(item.quote))}&rdquo;
                </span>
              </p>
              {(str(item.name) || str(item.role)) && (
                <span className="mt-2 block text-[0.8rem] opacity-70">
                  {str(item.name)}
                  {str(item.role) && ` · ${str(item.role)}`}
                </span>
              )}
            </li>
          ))}
        </ul>
      );
    }

    case "spacer":
      return <div style={{ height: `${num(p.height, 40)}px` }} aria-hidden />;

    case "divider":
      return (
        <hr
          style={{
            width: `${num(p.width, 100)}%`,
            height: `${num(p.thickness, 1)}px`,
            background: c.fg,
            border: 0,
            margin: 0,
          }}
        />
      );

    case "html": {
      const code = str(p.code);
      if (!code.trim()) return null;
      return <div style={{ color: c.fg }} dangerouslySetInnerHTML={{ __html: code }} />;
    }

    case "cards": {
      const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
      if (items.length === 0) return null;
      const skin = str(p.skin, "boxed");
      // The card's own ink. Unset is the band's, which is what every card ever
      // saved has drawn — a card on a dark section is not always the same
      // colour as the paragraph beside it, and until now there was no way to
      // say so.
      const cardTitleInk = str(p.cardTitleColor) || c.fg;
      const cardBodyInk = str(p.cardBodyColor) || theme.muted;
      // The line ABOVE the cards — the list skin's title, the grid's caption.
      // A different thing from a card's own title, and it had no control at
      // all: the only way to recolour "YOUR FUNNEL PACKAGE" was to not have it.
      const headingInk = str(p.headingColor) || theme.muted;
      // Size only when one was typed, so a block that never had this control
      // ships the identical markup it always has.
      const headingSize = {
        ...(p.headingSize == null ? {} : { fontSize: num(p.headingSize, 0) }),
        ...(str(p.headingFont) ? { fontFamily: familyToken(str(p.headingFont)) } : {}),
        ...(str(p.headingWeight) ? { fontWeight: Number(str(p.headingWeight)) } : {}),
      };
      // The line under the heading. Its own field, its own size and its own
      // ink, because a heading with a sentence under it is two lines of type
      // and one of them is not a heading.
      const subInk = str(p.subheadingColor) || theme.muted;
      const subSize = {
        ...(p.subheadingSize == null ? {} : { fontSize: num(p.subheadingSize, 0) }),
        ...(str(p.subheadingFont) ? { fontFamily: familyToken(str(p.subheadingFont)) } : {}),
        ...(str(p.subheadingWeight) ? { fontWeight: Number(str(p.subheadingWeight)) } : {}),
      };
      const subheading = str(p.subheading) ? (
        <Inline
          as="p"
          className="mb-3 leading-relaxed"
          style={{ color: subInk, fontSize: "0.85rem", ...subSize }}
          html={str(p.subheading)}
        />
      ) : null;

      // One card holding compact rows, rather than a stack of separate boxes.
      // Six boxes down the side of a hero is twice the height of the copy it
      // is meant to sit beside.
      // The package panel: a small title, then one rounded row per item, then
      // an optional note in the same card. Modelled on the reference page —
      // hairline-separated rows read as a table; these read as a package.
      if (skin === "list") {
        const rowStyle: React.CSSProperties = {
          background: theme.panel,
          borderRadius: 10,
          padding: "0.72rem 0.95rem",
        };
        return (
          <div style={{ border: `1px solid ${c.rule}`, borderRadius: 20, padding: "1.35rem" }}>
            {str(p.title) && (
              <div
                className="mb-3 text-[0.68rem] uppercase tracking-[0.13em]"
                style={{ color: headingInk, ...headingSize }}
              >
                {str(p.title)}
              </div>
            )}
            {subheading}
            <div className="flex flex-col gap-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-baseline gap-3" style={rowStyle}>
                  {p.numbered === true && (
                    <span className="text-[0.72rem] tabular-nums" style={{ color: theme.muted }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span style={{ color: cardTitleInk, fontSize: "0.88rem", ...type }}><Inline html={str(it.title)} /></span>
                    {str(it.body) && (
                      <span className="mt-0.5 block text-[0.78rem] leading-snug" style={{ color: cardBodyInk }}>
                        <Inline html={str(it.body)} />
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {str(p.note) && (
              // Markup, not text. Every other field on this card — the row
              // titles, the bodies, the caption — is inline HTML, so somebody
              // who bolds two words in the closing note is doing exactly what
              // the field above it does. They were reading back "<strong>" on
              // a live sales page.
              <Inline
                as="p"
                className="mt-3 text-[0.82rem] leading-relaxed"
                style={{ ...rowStyle, color: str(p.cardBodyColor) || c.fg }}
                html={str(p.note)}
              />
            )}
          </div>
        );
      }
      const numbered = p.numbered === true;
      const circle = str(p.numberStyle, "eyebrow") === "circle";
      const inline = str(p.numberStyle, "eyebrow") === "inline";
      const beside = str(p.iconPlace, "above") === "beside";
      const skinCell: React.CSSProperties =
        skin === "boxed"
          ? { background: c.fill, border: `1px solid ${c.rule}`, borderRadius: 16, padding: "1.35rem 1.4rem" }
          : skin === "tinted"
            ? {
                // Both read off the block, the way Boxed has always read
                // `c.fill`. Hard-coded, a tinted card could not be made to
                // match the page around it: the corner was a bare 3 and the
                // wash was the band accent at a fixed alpha whatever the block
                // said. `c.fill` is the block's own background where it has
                // one and the band's panel where it does not, so the accent
                // wash stays the fallback rather than becoming it.
                //
                // Unset is still unset: `radius` is 0 and `background.color` is
                // null on every tinted card already saved, so those land on the
                // two constants and nothing on a live page moves.
                background: s.background.color ?? softAccent(theme, TINT_ALPHA),
                borderRadius: s.radius || TINTED_CARD_RADIUS,
                padding: "1.6rem 1.7rem",
              }
            : skin === "bordered"
              ? { border: `1px solid ${c.rule}`, borderRadius: 16, padding: "1.35rem 1.4rem" }
              : {};
      // Null, not a number, is what "the skin decides" looks like — the four
      // skins pad differently on purpose and Plain pads not at all, so there is
      // no single figure that could stand in as a default without repainting
      // every card already saved.
      const cell: React.CSSProperties = {
        ...skinCell,
        ...cardPadCss(p.cardPadding),
        ...(p.cardRadius == null ? {} : { borderRadius: num(p.cardRadius, 0) }),
      };
      const gap = p.cardGap == null ? (inline ? "1.6rem" : "1rem") : `${num(p.cardGap, 0)}px`;
      // A hairline between cards instead of a box around each. The gap only
      // opens above the border, so the card repeats it underneath — otherwise
      // the rule sits hard against the copy below it and reads as a heading
      // underline for the wrong card.
      const cellAt = (i: number): React.CSSProperties => {
        const base =
          p.divider === true && i > 0
            ? { ...cell, borderTop: `1px solid ${c.rule}`, paddingTop: gap }
            : cell;
        // In a strip the card cannot shrink and cannot wrap, so its width is
        // stated rather than left to a grid track. `columns` reads as "how many
        // visible at once", which is what it looks like on screen either way.
        if (!carousel) return base;
        const across = Math.min(Math.max(num(p.columns, 3), 1), 6);
        return {
          ...base,
          flex: `0 0 calc(${100 / across}% - ${((across - 1) * 16) / across}px)`,
        };
      };
      // Null means the stylesheet carries it, because Across holds a value per
      // device — see cardsTrack.
      const track = cardsTrack(block, at);
      const grid = { ...(track ? { "--cards": track } : {}), gap } as React.CSSProperties;

      // A strip of pictures keeps its columns on a phone; cards with words do
      // not.
      //
      // The grid is `grid-cols-1 @xl:grid-cols-[var(--cards)]`, so below the
      // container's @xl every cards block falls to one column whatever Across
      // says. That is right for cards — a paragraph in a third of a 390px
      // screen is unreadable — and wrong for six logos, which became a ladder
      // six deep. So the gate lifts only when every item is a picture and
      // nothing has a word in it, which cannot be true of a card.
      const marksOnly =
        str(p.media) === "image" &&
        items.length > 0 &&
        items.every((it) => str(it.image) && !str(it.title).trim() && !str(it.body).trim());
      // A strip that scrolls sideways instead of a grid that wraps.
      //
      // Scroll-snap, the same mechanism the quote slider uses: it swipes on
      // touch, scrolls with a trackpad, works from the keyboard, and adds no
      // client bundle to a page whose job is to load fast and take a payment.
      //
      // A flag on this block rather than a block of its own, because a
      // scrolling shelf of cards wants everything a card already has — the icon
      // tile, the eyebrow number, the skins, the padding. A second block type
      // would be all of that again, with its own bugs.
      //
      // `--cards` becomes the width of ONE card here rather than a track list,
      // so "Across: 4" reads as "four visible at a time", which is what it
      // looks like on screen either way.
      const carousel = p.carousel === true;
      const gridClass = carousel
        ? "-mx-1 flex snap-x snap-mandatory overflow-x-auto px-1 pb-2"
        : marksOnly
          ? "grid grid-cols-[var(--cards)]"
          : "grid grid-cols-1 @xl:grid-cols-[var(--cards)]";
      // The gap between a card's title and its body. Unset keeps exactly what
      // each layout already drew — the two differ, and a single new default
      // here would move every card block on the site.
      const textGap = p.cardTextGap != null ? num(p.cardTextGap, 6) : null;

      // Number before the title, body hanging under the title rather than
      // under the number. That indent is what makes the number read as a label
      // on the card instead of part of the sentence.
      if (inline) {
        return (
          <div className={gridClass} style={grid}>
            {items.map((it, i) => (
              <Card key={i} style={cellAt(i)} beside={beside} className={carousel ? "snap-start" : ""} tile={<IconTile item={it} p={p} colors={c} />}>
                <div className="flex items-baseline gap-2">
                  {numbered && (
                    <span className="font-display font-bold tabular-nums" style={{ color: c.accent, fontSize: "1rem" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  )}
                  <h3 className="font-display font-semibold" style={{ color: cardTitleInk, fontSize: "1.02rem", ...type }}>
                    <Inline html={str(it.title)} />
                  </h3>
                </div>
                <p
                  // The class stays when nothing is set, so a card block saved
                  // before this control existed renders the identical markup —
                  // which the golden test checks byte for byte, and caught when
                  // this first shipped as an inline `marginTop: 8`.
                  className={`${textGap == null ? "mt-2 " : ""}text-[0.9rem] leading-relaxed`}
                  style={{
                    color: cardBodyInk,
                    paddingLeft: numbered ? "1.9rem" : 0,
                    ...(textGap == null ? {} : { marginTop: textGap }),
                  }}
                >
                  <Inline html={str(it.body)} />
                </p>
              </Card>
            ))}
          </div>
        );
      }
      return (
        <>
          {/* The group's own caption, above its cards.
              "A titled panel of logos" — a caption and a row of marks inside
              one box — was a container inside a container, which this tree
              does not do. One line here makes it a block instead of a nesting
              problem. Inline markup, because the captions people write are
              half italic.

              Its own prop rather than reusing `title`: only the list skin ever
              drew that, so grid blocks saved years ago can be carrying one
              nobody has seen. Reading it here would print a forgotten string
              onto a live page — which is precisely what the byte-for-byte
              test caught. Nothing stored has a `caption`, so nothing stored
              changes. */}
          {str(p.caption) && (
            <Inline
              as="p"
              className="mb-3 text-[0.82rem]"
              style={{ color: headingInk, ...headingSize }}
              html={str(p.caption)}
            />
          )}
          {subheading}
        <div className={gridClass} style={grid}>
          {items.map((it, i) => (
            <Card key={i} style={cellAt(i)} beside={beside} className={carousel ? "snap-start" : ""} tile={<IconTile item={it} p={p} colors={c} />}>
              {numbered &&
                (circle ? (
                  // In the flow, not absolutely positioned. The absolute
                  // version needed the padding above the title kept in sync
                  // with the circle by hand, and it drifted — the number sat
                  // on top of the heading.
                  <span
                    className="font-display font-bold"
                    style={{
                      width: 38,
                      height: 38,
                      marginBottom: ".8rem",
                      borderRadius: 999,
                      background: c.accent,
                      color: readableOn(c.accent),
                      display: "grid",
                      placeContent: "center",
                      fontSize: ".9rem",
                    }}
                  >
                    {i + 1}
                  </span>
                ) : (
                  <span className="font-display text-[0.72rem] font-bold tracking-[0.14em]" style={{ color: c.accent }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                ))}
              <h3
                className="font-display font-semibold"
                style={{
                  color: cardTitleInk,
                  fontSize: "1.02rem",
                  marginTop: numbered && !circle ? ".45rem" : 0,
                  marginBottom: textGap ?? ".4rem",
                  ...type,
                }}
              >
                <Inline html={str(it.title)} />
              </h3>
              <p className="text-[0.88rem] leading-relaxed" style={{ color: cardBodyInk }}>
                <Inline html={str(it.body)} />
              </p>
              {str(it.amount) && (
                <p className="mt-3 font-display font-bold" style={{ color: c.fg, fontSize: "1.05rem" }}>
                  {str(it.amount)}
                </p>
              )}
            </Card>
          ))}
        </div>
        </>
      );
    }

    case "stats": {
      const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
      if (items.length === 0) return null;
      const card = str(p.layout) === "card";
      // Each figure in its own outlined box, side by side.
      //
      // Two boxed figures in a panel is a row of two columns, and a row inside
      // a column is a container inside a container — which this tree does not
      // do. So the shape belongs to the block: it is the same two figures the
      // strip draws, in boxes, and it takes the block's own border settings so
      // the outline is a control rather than a hardcoded hairline.
      if (str(p.layout) === "boxed") {
        const line = `${s.borderWidth || 1}px solid ${s.borderColor ?? c.rule}`;
        return (
          <div className="flex flex-wrap gap-3">
            {items.map((it, i) => (
              <div
                key={i}
                className="min-w-0 flex-1 px-4 py-3"
                style={{ border: line, borderRadius: `${s.radius || 12}px` }}
              >
                <div className="font-display text-[1.6rem] font-bold leading-tight" style={{ color: c.fg, ...type }}>
                  <Inline html={str(it.value)} />
                </div>
                <div className="mt-1 text-[0.68rem] uppercase tracking-[0.12em]" style={{ color: theme.muted }}>
                  <Inline html={str(it.label)} />
                </div>
              </div>
            ))}
          </div>
        );
      }
      return card ? (
        <div className="rounded-2xl px-5" style={{ background: c.fill }}>
          {items.map((it, i) => (
            <div key={i} className="py-4" style={i ? { borderTop: `1px solid ${c.rule}` } : undefined}>
              <div className="text-[0.66rem] uppercase tracking-[0.13em]" style={{ color: theme.muted }}><Inline html={str(it.label)} /></div>
              <div className="mt-1 font-display text-[1.3rem] font-bold" style={{ color: c.fg, ...type }}><Inline html={str(it.value)} /></div>
              {str(it.detail) && (
                <div className="mt-1 text-[0.8rem] leading-snug" style={{ color: theme.muted, whiteSpace: "pre-line" }}>
                  {withLineBreaks(str(it.detail))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        // Separated by hairlines and hugging the left, the way the model page
        // sets them. Spread across the whole band they stop reading as a group.
        <div className="flex flex-wrap items-stretch">
          {items.map((it, i) => (
            <div
              key={i}
              className="pr-6"
              style={i ? { borderLeft: `1px solid ${c.rule}`, paddingLeft: "1.5rem" } : undefined}
            >
              <div className="font-display text-[1.15rem] font-bold" style={{ color: c.fg, ...type }}><Inline html={str(it.value)} /></div>
              <div className="mt-0.5 text-[0.78rem]" style={{ color: theme.muted }}><Inline html={str(it.label)} /></div>
              {str(it.detail) && (
                <div className="mt-0.5 text-[0.74rem]" style={{ color: theme.muted, whiteSpace: "pre-line" }}>
                  {withLineBreaks(str(it.detail))}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }

    case "pricing": {
      const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
      const highlight = p.highlightLast !== false;
      // The highlighted row is ours. Left blank it shows the offer's real
      // price, for the same reason the price card does: a comparison whose
      // last line is a typed number is a comparison that can quietly disagree
      // with what the card charges.
      const ourAmount = (i: number, typed: string) =>
        highlight && i === items.length - 1 && !typed ? str(money?.priceLabel) : typed;
      return (
        <div className="flex flex-col">
          {items.map((it, i) => {
            const ours = highlight && i === items.length - 1;
            return (
              <div
                key={i}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
                style={{
                  borderTop: i ? `1px solid ${c.rule}` : undefined,
                  background: ours ? c.fill : undefined,
                  borderRadius: ours ? 12 : undefined,
                  color: c.fg,
                  ...type,
                }}
              >
                <span className={ours ? "font-semibold" : undefined}><Inline html={str(it.label)} /></span>
                {str(it.note) && <span className="text-[0.8rem]" style={{ color: theme.muted }}>{str(it.note)}</span>}
                <span className="ml-auto font-display font-bold">{ourAmount(i, str(it.amount))}</span>
              </div>
            );
          })}
          {(str(p.totalLabel) || str(p.totalAmount)) && (
            <div
              className="flex items-baseline gap-3 px-4 py-3 font-display font-bold"
              style={{ borderTop: `2px solid ${c.rule}`, color: c.fg }}
            >
              <span>{str(p.totalLabel)}</span>
              <span className="ml-auto">{str(p.totalAmount)}</span>
            </div>
          )}
        </div>
      );
    }

    case "faq": {
      const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
      if (items.length === 0) return null;
      if (str(p.layout, "accordion") === "open") {
        return (
          <div
            className="grid grid-cols-1 @xl:grid-cols-[var(--faq)]"
            style={{ "--faq": "repeat(2, minmax(0,1fr))", gap: "1.6rem 2.4rem" } as React.CSSProperties}
          >
            {items.map((it, i) => (
              <div key={i}>
                <h3 className="font-display font-semibold" style={{ color: c.fg, fontSize: "0.98rem", ...type }}>
                  <Inline html={str(it.q)} />
                </h3>
                <p className="mt-1.5 text-[0.88rem] leading-relaxed" style={{ color: theme.muted }}>
                  <Inline html={str(it.a)} />
                </p>
              </div>
            ))}
          </div>
        );
      }
      // <details> rather than a JavaScript accordion: it opens with no client
      // bundle, it is operable from the keyboard, and it keeps working if the
      // script never arrives. `name` makes them a group, so opening one closes
      // the last — which is what stops a long FAQ turning into a wall.
      return (
        <div className="flex flex-col">
          {items.map((it, i) => (
            <details
              key={i}
              name="faq"
              className="group py-3"
              style={{ borderTop: i ? `1px solid ${c.rule}` : undefined }}
            >
              <summary
                className="flex cursor-pointer items-start gap-3 font-display font-semibold"
                style={{ color: c.fg, fontSize: "0.98rem", ...type }}
              >
                <span className="min-w-0 flex-1"><Inline html={str(it.q)} /></span>
                <span
                  aria-hidden
                  className="shrink-0 transition-transform group-open:rotate-45"
                  style={{ color: c.accent, fontSize: "1.15rem", lineHeight: 1.1 }}
                >
                  +
                </span>
              </summary>
              <p className="mt-2 max-w-[68ch] text-[0.9rem] leading-relaxed" style={{ color: theme.muted }}>
                <Inline html={str(it.a)} />
              </p>
            </details>
          ))}
        </div>
      );
    }

    case "pricecard": {
      // Blank price means the real one. The only money on this page a buyer can
      // trust is the figure the offer actually charges.
      const price = str(p.price) || str(money?.priceLabel) || "";
      const period = str(p.period) || str(money?.termsLabel) || "";
      // Blank means the real one, exactly like the price above it.
      const altPrice = str(p.altPrice) || str(money?.altPriceLabel) || "";
      const altPeriod = str(p.altPeriod) || str(money?.altTermsLabel) || "";
      if (!price) return null;
      const ink = readableOn(c.fill);
      return (
        <div className="text-center" style={{ background: c.fill, color: ink, borderRadius: 20, padding: "1.9rem 1.6rem" }}>
          {str(p.eyebrow) && (
            <div className="text-[0.68rem] uppercase tracking-[0.13em]" style={{ opacity: 0.72 }}>{str(p.eyebrow)}</div>
          )}
          <div className="mt-2 font-display font-bold" style={{ fontSize: "2.4rem", lineHeight: 1.05, ...type }}>
            {price}
            {period && <span className="font-display font-semibold" style={{ fontSize: "1rem", opacity: 0.8 }}>{period}</span>}
          </div>
          {altPrice && (
            <>
              <div className="mt-1 text-[0.82rem]" style={{ opacity: 0.7 }}>or</div>
              <div className="font-display font-bold" style={{ fontSize: "1.7rem", lineHeight: 1.1 }}>
                {altPrice}
                {altPeriod && (
                  <span className="font-display font-semibold" style={{ fontSize: "0.92rem", opacity: 0.8 }}>{altPeriod}</span>
                )}
              </div>
            </>
          )}
          {/* What is actually taken today, where that differs from the headline
              price. Through a trial the card reads "$29/month" and this line
              reads "$0 today" — two true statements that need each other. */}
          {money?.dueNowLabel && money.dueNowLabel !== price && (
            <div className="mt-1 text-[0.8rem]" style={{ opacity: 0.8 }}>
              {money.dueNowLabel} today
            </div>
          )}
          {str(p.badge) && (
            <span className="mt-2 inline-block text-[0.7rem] font-semibold"
              style={{ background: c.accent, color: readableOn(c.accent), borderRadius: 999, padding: "0.16rem 0.6rem" }}>
              {str(p.badge)}
            </span>
          )}
          {str(p.ctaLabel) &&
            (cta ? (
              <div className="mt-4">{cta(str(p.ctaLabel), theme)}</div>
            ) : (
              <span className="mt-4 block w-full px-6 py-3 font-display text-[0.95rem] font-semibold"
                style={{ background: c.accent, color: readableOn(c.accent), borderRadius: 999 }}>
                {str(p.ctaLabel)}
              </span>
            ))}
          {fillTokens(str(p.note), money) && (
            <p className="mt-3 text-[0.76rem] leading-snug" style={{ opacity: 0.75 }}>
              {fillTokens(str(p.note), money)}
            </p>
          )}
          {str(p.secureNote) && <p className="mt-2 text-[0.68rem]" style={{ opacity: 0.6 }}>{str(p.secureNote)}</p>}
        </div>
      );
    }

    case "row": {
      const columns = block.columns ?? [];
      // The layout is emitted as rules on the block's own class, so a phone can
      // stack what a desktop puts side by side. Pinned to a device — an editor
      // canvas 390px wide inside a 1900px window — it comes back inline, since
      // no media query would fire there.
      const layout = at ? rowLayout(block, at) : null;
      return (
        <div data-row style={layout?.container}>
          {columns.map((col, i) => (
            <div
              key={i}
              className="flex flex-col"
              // Nothing inline on a live page: the column's own style is in the
              // rules with everything else, so what it changes on a phone can
              // actually reach the phone.
              style={at ? { ...layout?.columns[i], ...columnCss(block, i, theme, at) } : undefined}
            >
              {flow(col.filter((child) => !blockRendersNothing(child)), theme, money, cta, store, at)}
            </div>
          ))}
        </div>
      );
    }
  }
}

/**
 * The filled tile an icon or a picture sits in.
 *
 * A bare glyph on a tinted card disappears; the reference page gives every one
 * a solid rounded square, which is what makes a grid of cards scan.
 *
 * Every knob is optional and falls back to the 44px rounded accent tile this
 * has always drawn — a card saved before any of them existed has to come back
 * looking the same, and the defaults are what guarantee that.
 */
function IconTile({
  item,
  p,
  colors,
}: {
  item: Record<string, unknown>;
  p: Record<string, unknown>;
  colors: ReturnType<typeof blockColors>;
}) {
  const media = str(p.media, "icon");
  if (media === "none") return null;
  const raw = str(item.icon);
  // The library picture is only read when the block is set to Image, and the
  // pasted icon is only read when it is set to Icon. Switching between them
  // hides the other one rather than throwing it away, so it is a switch and not
  // a decision you have to undo by retyping.
  const picture = media === "image" ? imageSrc(item.image) : null;
  if (media === "image" ? !picture : !raw.trim()) return null;
  const src = picture ?? (/^https?:\/\//i.test(raw.trim()) ? raw.trim() : null);

  const box = num(p.iconBox, 44);
  // An icon sits INSIDE its tile with air around it; a picture IS the tile.
  // Drawing an upload at the icon's 22px inside a 44px box is what made an
  // uploaded illustration look like a stamp in the corner of a coloured
  // square. An explicit size still wins, for a picture used as an icon.
  const size = p.iconSize != null ? num(p.iconSize, 22) : media === "image" ? box : 22;
  const shape = str(p.iconShape, "rounded");
  // A picture brings its own background; an icon does not.
  //
  // The tile's fill is what gives a monochrome SVG presence — without it a
  // line drawing floats in the card. Behind an uploaded PNG it is a coloured
  // square peeking out around the edges of someone's artwork, which is what
  // it looked like: a terracotta tile behind a pink illustration.
  //
  // So the default follows the source, and an explicit iconBg still wins for
  // anyone who does want a framed picture.
  const fill = str(p.iconBg) || (media === "image" ? "transparent" : colors.accent);
  return (
    <span
      aria-hidden
      className={
        str(p.iconPlace, "above") === "beside"
          ? // Beside the copy the tile is a flex sibling, so the bottom margin
            // that separated it from the title below is now a gap on the wrong
            // axis, and it must not be squeezed by a long heading.
            "grid shrink-0 place-content-center"
          : "mb-3 grid place-content-center"
      }
      style={{
        width: box,
        height: box,
        borderRadius: shape === "circle" ? 999 : shape === "square" ? 0 : Math.round(box / 4),
        // Only for a picture: a round tile holding a square upload is a square
        // upload without it. An inline SVG is already drawn to fit, and adding
        // this for icons would change the markup of every card that exists —
        // which the golden tests caught the moment it did.
        ...(media === "image" ? { overflow: "hidden" as const } : {}),
        background: fill,
        // readableOn cannot answer "what reads on transparent", and an image
        // does not inherit colour anyway — so only ask when there is a fill.
        color: str(p.iconColor) || (fill === "transparent" ? undefined : readableOn(fill)),
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={{ width: size, height: size, objectFit: "contain" }} />
      ) : (
        // Sanitized on save — see sanitizeBlocks.
        <span style={{ display: "grid", width: size, height: size }} dangerouslySetInnerHTML={{ __html: raw }} />
      )}
    </span>
  );
}

/**
 * One card: its box, its tile, and its copy.
 *
 * Written as a component only because "beside" is a different tree rather than
 * a different class — the tile has to become a flex sibling of a wrapper around
 * everything else. With the tile above, this renders exactly the plain div the
 * cards grid always did.
 */
function Card({
  style,
  tile,
  beside,
  className,
  children,
}: {
  style: React.CSSProperties;
  tile: React.ReactNode;
  beside: boolean;
  /** Empty unless the card is in a scrolling strip, so nothing else moves. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={style} className={className || undefined}>
      {beside ? (
        <div className="flex items-start gap-3">
          {tile}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      ) : (
        <>
          {tile}
          {children}
        </>
      )}
    </div>
  );
}

function Tick({ color, size }: { color: string; size: number }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="mt-[3px] shrink-0"
      style={{ color, width: size, height: size }}
    >
      <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
