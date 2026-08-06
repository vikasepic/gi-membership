import { blockRendersNothing, styleFor, type Block, type Device } from "@/lib/blocks";
import {
  blockClass,
  blockColors,
  blockCssAt,
  blockRules,
  rowLayout,
  headingTag,
  hiddenClasses,
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

export function Blocks({
  blocks,
  theme,
  money,
  cta,
  at,
}: {
  blocks: Block[];
  theme: BandTheme;
  money?: BlockMoney;
  cta?: CtaRender;
  /**
   * Render as this device would see it, rather than letting the viewport
   * decide. For a preview pane narrower than the window, where the real media
   * queries would not fire. Unset on the live page, which has a real viewport.
   */
  at?: Device;
}) {
  const showing = blocks.filter((b) => !blockRendersNothing(b));
  if (showing.length === 0) return null;
  return <div className="mt-7 flex flex-col">{flow(showing, theme, money, cta, at)}</div>;
}

/**
 * Buttons that sit next to each other, sit next to each other.
 *
 * A primary and a secondary call to action belong on one line — stacking them
 * makes the second one look like a second offer. They stay separate blocks, so
 * each is still selected, dragged and styled on its own; only the rendering
 * puts a run of them on one row.
 */
function flow(blocks: Block[], theme: BandTheme, money?: BlockMoney, cta?: CtaRender, at?: Device): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; ) {
    if (blocks[i].type === "button" && blocks[i + 1]?.type === "button") {
      let j = i;
      while (j < blocks.length && blocks[j].type === "button") j++;
      out.push(
        <div key={blocks[i].id} className="flex flex-wrap items-center gap-3">
          {blocks.slice(i, j).map((b) => (
            <BlockNode key={b.id} block={b} theme={theme} money={money} cta={cta} at={at} />
          ))}
        </div>,
      );
      i = j;
    } else {
      out.push(<BlockNode key={blocks[i].id} block={blocks[i]} theme={theme} money={money} cta={cta} at={at} />);
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
  at,
}: {
  block: Block;
  theme: BandTheme;
  money?: BlockMoney;
  cta?: CtaRender;
  at?: Device;
}) {
  // An unfilled block would otherwise emit a wrapper carrying its padding and
  // margin — a gap on the page that nobody placed.
  if (blockRendersNothing(block)) return null;
  const s = styleFor(block, at ?? "desktop");
  // On a real viewport the look is emitted as rules, not a style attribute: a
  // media query cannot live in an attribute, and an attribute would outrank the
  // media query anyway. Pinned to a device, it is the attribute — see `at`.
  const rules = at ? "" : blockRules(block, theme);
  return (
    <>
      {rules && <style dangerouslySetInnerHTML={{ __html: rules }} />}
      <div
        id={s.cssId || undefined}
        className={[at ? "" : blockClass(block), at ? "" : hiddenClasses(block), s.cssClass]
          .filter(Boolean)
          .join(" ")}
        style={at ? blockCssAt(block, theme, at) : undefined}
        hidden={at ? hiddenAt(block, at) : undefined}
      >
        <Inner block={block} theme={theme} money={money} cta={cta} at={at} />
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
export function BlockBody({ block, theme, at }: { block: Block; theme: BandTheme; at?: Device }) {
  return <Inner block={block} theme={theme} at={at} />;
}

function Inner({
  block,
  theme,
  money,
  cta,
  at,
}: {
  block: Block;
  theme: BandTheme;
  money?: BlockMoney;
  cta?: CtaRender;
  at?: Device;
}) {
  const s = styleFor(block, at ?? "desktop");
  const p = block.props;
  const c = blockColors(block, theme, s);
  const type = typographyCss(s);

  switch (block.type) {
    case "heading": {
      const Tag = headingTag(p.tag);
      return (
        // Size, weight, line height, tracking and colour all arrive from the
        // block's own rule — including the per-tag default — so that a value
        // set on mobile is not outranked by a utility class here.
        <Tag className="font-display text-balance">
          {str(p.text)}
        </Tag>
      );
    }

    case "text":
      return (
        <div
          className="[&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:font-display [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6"
          dangerouslySetInnerHTML={{ __html: str(p.html) }}
        />
      );

    case "image": {
      const src = imageSrc(str(p.url));
      if (!src) return null;
      // "auto" means show the whole picture. Without dropping objectFit as
      // well, the image would keep being cropped to a box it no longer has.
      const ratio = str(p.ratio, "16/9");
      const whole = ratio === "auto";
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
      const label = str(p.text);
      if (!label) return null;
      // An outline button carries the band's text colour on the band itself,
      // so it reads as the quieter of the two without needing its own palette.
      const outline = str(p.variant) === "outline";
      const style: React.CSSProperties = {
        background: outline ? "transparent" : c.fill,
        color: outline ? theme.fg : c.fg,
        border: outline ? `1px solid ${theme.rule}` : undefined,
        borderRadius: `${s.radius || 999}px`,
        display: bool(p.fullWidth) ? "block" : "inline-block",
        textAlign: "center",
        ...type,
      };
      // A buy button with no control to render is plain text — a sales page
      // nobody can buy from. Rendered through the page's own control instead.
      if (str(p.action, "link") === "buy" && cta) return <>{cta(label, theme)}</>;
      const link = str(p.link);
      return link ? (
        <a href={link} className="w-fit px-7 py-3 font-display text-[0.95rem] font-semibold" style={style}>
          {label}
        </a>
      ) : (
        <span className="w-fit px-7 py-3 font-display text-[0.95rem] font-semibold" style={style}>
          {label}
        </span>
      );
    }

    case "iconlist": {
      const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
      if (items.length === 0) return null;
      const size = num(p.iconSize, 16);
      return (
        <ul
          className={`flex list-none p-0 ${str(p.layout) === "inline" ? "flex-row flex-wrap" : "flex-col"}`}
          style={{ gap: `${num(p.gap, 8)}px`, color: c.fg, ...type }}
        >
          {items.map((item, i) => (
            <li key={i} className="flex items-start" style={{ gap: `${Math.max(6, num(p.gap, 8))}px` }}>
              <Tick color={c.accent} size={size} />
              <span>{str(item.text)}</span>
            </li>
          ))}
        </ul>
      );
    }

    case "slides": {
      const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
      if (items.length === 0) return null;
      const perView = Math.min(Math.max(num(p.perView, 1), 1), 3);
      // Scroll-snap rather than a JavaScript carousel: it swipes on touch,
      // scrolls with a trackpad, works with the keyboard, and needs no client
      // bundle on a page whose job is to load fast and take a payment.
      return (
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
                &ldquo;{str(item.quote)}&rdquo;
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
      const across = Math.min(Math.max(num(p.columns, 3), 1), 4);
      const skin = str(p.skin, "boxed");

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
                style={{ color: theme.muted }}
              >
                {str(p.title)}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-baseline gap-3" style={rowStyle}>
                  {p.numbered === true && (
                    <span className="text-[0.72rem] tabular-nums" style={{ color: theme.muted }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span style={{ color: c.fg, fontSize: "0.88rem", ...type }}>{str(it.title)}</span>
                    {str(it.body) && (
                      <span className="mt-0.5 block text-[0.78rem] leading-snug" style={{ color: theme.muted }}>
                        {str(it.body)}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {str(p.note) && (
              <p className="mt-3 text-[0.82rem] leading-relaxed" style={{ ...rowStyle, color: c.fg }}>
                {str(p.note)}
              </p>
            )}
          </div>
        );
      }
      const numbered = p.numbered === true;
      const circle = str(p.numberStyle, "eyebrow") === "circle";
      const inline = str(p.numberStyle, "eyebrow") === "inline";
      const cell: React.CSSProperties =
        skin === "boxed"
          ? { background: c.fill, border: `1px solid ${c.rule}`, borderRadius: 16, padding: "1.35rem 1.4rem" }
          : skin === "tinted"
            ? { background: softAccent(theme, 0.12), borderRadius: 3, padding: "1.6rem 1.7rem" }
            : skin === "bordered"
              ? { border: `1px solid ${c.rule}`, borderRadius: 16, padding: "1.35rem 1.4rem" }
              : {};

      // Number before the title, body hanging under the title rather than
      // under the number. That indent is what makes the number read as a label
      // on the card instead of part of the sentence.
      if (inline) {
        return (
          <div
            className="grid grid-cols-1 @xl:grid-cols-[var(--cards)]"
            style={{ "--cards": `repeat(${across}, minmax(0,1fr))`, gap: "1.6rem" } as React.CSSProperties}
          >
            {items.map((it, i) => (
              <div key={i} style={cell}>
                <IconTile icon={str(it.icon)} colors={c} />
                <div className="flex items-baseline gap-2">
                  {numbered && (
                    <span className="font-display font-bold tabular-nums" style={{ color: c.accent, fontSize: "1rem" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  )}
                  <h3 className="font-display font-semibold" style={{ color: c.fg, fontSize: "1.02rem", ...type }}>
                    {str(it.title)}
                  </h3>
                </div>
                <p
                  className="mt-2 text-[0.9rem] leading-relaxed"
                  style={{ color: theme.muted, paddingLeft: numbered ? "1.9rem" : 0 }}
                >
                  {str(it.body)}
                </p>
              </div>
            ))}
          </div>
        );
      }
      return (
        <div
          className="grid grid-cols-1 @xl:grid-cols-[var(--cards)]"
          style={{ "--cards": `repeat(${across}, minmax(0,1fr))`, gap: "1rem" } as React.CSSProperties}
        >
          {items.map((it, i) => (
            <div key={i} style={cell}>
              <IconTile icon={str(it.icon)} colors={c} />
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
                  color: c.fg,
                  fontSize: "1.02rem",
                  marginTop: numbered && !circle ? ".45rem" : 0,
                  marginBottom: ".4rem",
                  ...type,
                }}
              >
                {str(it.title)}
              </h3>
              <p className="text-[0.88rem] leading-relaxed" style={{ color: theme.muted }}>
                {str(it.body)}
              </p>
              {str(it.amount) && (
                <p className="mt-3 font-display font-bold" style={{ color: c.fg, fontSize: "1.05rem" }}>
                  {str(it.amount)}
                </p>
              )}
            </div>
          ))}
        </div>
      );
    }

    case "stats": {
      const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
      if (items.length === 0) return null;
      const card = str(p.layout) === "card";
      return card ? (
        <div className="rounded-2xl px-5" style={{ background: c.fill }}>
          {items.map((it, i) => (
            <div key={i} className="py-4" style={i ? { borderTop: `1px solid ${c.rule}` } : undefined}>
              <div className="text-[0.66rem] uppercase tracking-[0.13em]" style={{ color: theme.muted }}>{str(it.label)}</div>
              <div className="mt-1 font-display text-[1.3rem] font-bold" style={{ color: c.fg, ...type }}>{str(it.value)}</div>
              {str(it.detail) && <div className="mt-1 text-[0.8rem] leading-snug" style={{ color: theme.muted }}>{str(it.detail)}</div>}
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
              <div className="font-display text-[1.15rem] font-bold" style={{ color: c.fg, ...type }}>{str(it.value)}</div>
              <div className="mt-0.5 text-[0.78rem]" style={{ color: theme.muted }}>{str(it.label)}</div>
              {str(it.detail) && <div className="mt-0.5 text-[0.74rem]" style={{ color: theme.muted }}>{str(it.detail)}</div>}
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
                <span className={ours ? "font-semibold" : undefined}>{str(it.label)}</span>
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
                  {str(it.q)}
                </h3>
                <p className="mt-1.5 text-[0.88rem] leading-relaxed" style={{ color: theme.muted }}>
                  {str(it.a)}
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
                <span className="min-w-0 flex-1">{str(it.q)}</span>
                <span
                  aria-hidden
                  className="shrink-0 transition-transform group-open:rotate-45"
                  style={{ color: c.accent, fontSize: "1.15rem", lineHeight: 1.1 }}
                >
                  +
                </span>
              </summary>
              <p className="mt-2 max-w-[68ch] text-[0.9rem] leading-relaxed" style={{ color: theme.muted }}>
                {str(it.a)}
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
            <div key={i} className="flex flex-col" style={layout?.columns[i]}>
              {flow(col.filter((child) => !blockRendersNothing(child)), theme, money, cta, at)}
            </div>
          ))}
        </div>
      );
    }
  }
}

/**
 * The filled tile an icon sits in.
 *
 * A bare glyph on a tinted card disappears; the reference page gives every one
 * a solid rounded square, which is what makes a grid of cards scan.
 */
function IconTile({ icon, colors }: { icon: string; colors: ReturnType<typeof blockColors> }) {
  if (!icon.trim()) return null;
  const isImage = /^https?:\/\//i.test(icon.trim());
  return (
    <span
      aria-hidden
      className="mb-3 grid place-content-center"
      style={{ width: 44, height: 44, borderRadius: 11, background: colors.accent, color: readableOn(colors.accent) }}
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon.trim()} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
      ) : (
        // Sanitized on save — see sanitizeBlocks.
        <span style={{ display: "grid", width: 22, height: 22 }} dangerouslySetInnerHTML={{ __html: icon }} />
      )}
    </span>
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
