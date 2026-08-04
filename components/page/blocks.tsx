import { ROW_STRUCTURES, blockRendersNothing, type Block, type RowStructure } from "@/lib/blocks";
import { blockColors, blockWrapperCss, hiddenClasses, typographyCss } from "@/lib/block-style";
import { imageSrc, type BandTheme } from "@/lib/page-sections";
import { videoEmbed, type VideoSource } from "@/lib/video-embed";

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
const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown): boolean => v === true;

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
type HeadingTag = (typeof HEADING_TAGS)[number];
const headingTag = (v: unknown): HeadingTag =>
  HEADING_TAGS.includes(v as HeadingTag) ? (v as HeadingTag) : "h2";

/** Sizes for a heading level, used only when the block sets none of its own. */
const HEADING_SIZE: Record<HeadingTag, string> = {
  h1: "clamp(1.8rem,4vw,2.9rem)",
  h2: "clamp(1.3rem,2.4vw,1.8rem)",
  h3: "1.15rem",
  h4: "1.02rem",
  h5: "0.94rem",
  h6: "0.84rem",
};

export function Blocks({ blocks, theme }: { blocks: Block[]; theme: BandTheme }) {
  const showing = blocks.filter((b) => !blockRendersNothing(b));
  if (showing.length === 0) return null;
  return (
    <div className="mt-7 flex flex-col">
      {showing.map((b) => (
        <BlockNode key={b.id} block={b} theme={theme} />
      ))}
    </div>
  );
}

function BlockNode({ block, theme }: { block: Block; theme: BandTheme }) {
  // An unfilled block would otherwise emit a wrapper carrying its padding and
  // margin — a gap on the page that nobody placed.
  if (blockRendersNothing(block)) return null;
  const s = block.style;
  const wrapper = blockWrapperCss(block, theme);
  const hidden = hiddenClasses(s);
  return (
    <div
      id={s.cssId || undefined}
      className={[hidden, s.cssClass].filter(Boolean).join(" ") || undefined}
      style={wrapper}
    >
      <Inner block={block} theme={theme} />
    </div>
  );
}

function Inner({ block, theme }: { block: Block; theme: BandTheme }) {
  const s = block.style;
  const p = block.props;
  const c = blockColors(block, theme);
  const type = typographyCss(s);

  switch (block.type) {
    case "heading": {
      const Tag = headingTag(p.tag);
      return (
        <Tag
          className="font-display font-semibold leading-[1.15] tracking-[-0.015em] text-balance"
          // A size the block did not set falls back to the tag's own scale, so
          // changing h2 to h3 changes the look. In the prototype the size was
          // hard-set, which is why the tag control appeared to do nothing.
          style={{ color: c.fg, fontSize: HEADING_SIZE[Tag], ...type }}
        >
          {str(p.text)}
        </Tag>
      );
    }

    case "text":
      return (
        <div
          className="leading-relaxed [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:font-display [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6"
          style={{ color: c.fg, ...type }}
          dangerouslySetInnerHTML={{ __html: str(p.html) }}
        />
      );

    case "image": {
      const src = imageSrc(str(p.url));
      if (!src) return null;
      const img = (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={str(p.alt)}
          style={{
            display: "block",
            width: "100%",
            maxWidth: `${num(p.maxWidth, 100)}%`,
            aspectRatio: str(p.ratio, "16/9"),
            objectFit: "cover",
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
      const style: React.CSSProperties = {
        background: c.fill,
        color: c.fg,
        borderRadius: `${s.radius || 999}px`,
        display: bool(p.fullWidth) ? "block" : "inline-block",
        textAlign: "center",
        ...type,
      };
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

    case "row": {
      const structure = (str(p.structure, "1-1") as RowStructure) in ROW_STRUCTURES
        ? (str(p.structure, "1-1") as RowStructure)
        : "1-1";
      const columns = block.columns ?? [];
      return (
        <div
          className="grid grid-cols-1 @2xl:grid-cols-[var(--cols)]"
          style={
            {
              gap: `${num(p.gap, 24)}px`,
              alignItems: str(p.verticalAlign, "stretch"),
              "--cols": ROW_STRUCTURES[structure].map((w) => `${w}fr`).join(" "),
            } as React.CSSProperties
          }
        >
          {columns.map((col, i) => (
            <div key={i} className="flex min-w-0 flex-col">
              {col
                .filter((child) => !blockRendersNothing(child))
                .map((child) => (
                  <BlockNode key={child.id} block={child} theme={theme} />
                ))}
            </div>
          ))}
        </div>
      );
    }
  }
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
