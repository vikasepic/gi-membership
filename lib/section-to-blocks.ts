import { newBlock, ROW_STRUCTURES, type Block, type BlockType, type RowStructure } from "@/lib/blocks";
import { listOf, textOf, type SectionDef, type SectionView } from "@/lib/page-sections";

// Turning a section's typed content into blocks.
//
// One editor, not two. The typed fields were a form; the builder is the editor.
// Rather than asking anyone to retype a page that already exists, a section
// that has never been opened in the builder is CONVERTED on read — its stored
// fields become the block tree they describe.
//
// Conversion is lazy and non-destructive: nothing is written until the first
// save from the builder. Until then the typed content is still there, so this
// is reversible by deleting `content.blocks`.
//
// The rule followed throughout: never invent. A field that is empty produces no
// block. What comes out is exactly what someone wrote, in a shape they can now
// move around.

type Props = Record<string, unknown>;

const block = (type: BlockType, props: Props = {}, style: Partial<Block["style"]> = {}): Block => {
  const b = newBlock(type);
  return { ...b, props: { ...b.props, ...props }, style: { ...b.style, ...style } };
};

const heading = (text: string, tag = "h2"): Block => block("heading", { text, tag });
const paragraph = (text: string): Block => block("text", { html: `<p>${escapeHtml(text)}</p>` });

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Centred, which is how most bands on a sales page set their heading. */
function centred<T extends Block>(b: T): T {
  return { ...b, style: { ...b.style, align: "center" as const } };
}
const wide = <T extends Block>(b: T): T => ({ ...b, style: { ...b.style, width: "full" as const } });

/** Two columns of unequal weight — copy beside a card. */
function split(left: Block[], right: Block[], structure: RowStructure): Block | null {
  if (left.length === 0 && right.length === 0) return null;
  if (left.length === 0 || right.length === 0) return null;
  const row = block("row", { structure, verticalAlign: "flex-start" }, { width: "full" });
  row.columns = [left, right];
  return row;
}

/**
 * A grid of titled cards.
 *
 * One `cards` block rather than a row of heading-and-text pairs. Decomposing
 * these was what made the first conversion read as flat prose: the box, the
 * numbered eyebrow and the columns are the design, and atoms do not carry it.
 */
function cardGrid(
  items: Record<string, string>[],
  numbered: boolean,
  skin: "boxed" | "tinted" | "bordered" | "plain" = "boxed",
  numberStyle: "eyebrow" | "inline" | "circle" = "eyebrow",
): Block[] {
  if (items.length === 0) return [];
  return [
    block(
      "cards",
      { items, columns: evenColumns(items.length), numbered, skin, numberStyle },
      { width: "full" },
    ),
  ];
}

/**
 * How many across, so the rows come out even.
 *
 * Six cards at four across is a row of four and a row of two, which reads as a
 * mistake. Preferring a count that divides the total leaves no short last row.
 */
export function evenColumns(count: number): number {
  if (count <= 1) return 1;
  if (count % 3 === 0) return 3;
  if (count % 4 === 0) return 4;
  if (count % 2 === 0) return 2;
  return Math.min(count, 3);
}

/**
 * The price panel.
 *
 * `price` is deliberately left blank so the card renders the offer's real
 * figure. Everything typed into it is framing; the number is not.
 */
function priceCard(c: Record<string, unknown>, t: (k: string) => string): Block | null {
  // A card renders the real price even with nothing typed into it, which is
  // right for one someone placed — and wrong for a section nobody has written.
  // An unwritten section still converts to nothing.
  const written = ["ctaLabel", "priceEyebrow", "altPrice", "priceBadge", "priceNote", "secureNote", "ctaNote"];
  if (!written.some((k) => t(k))) return null;
  return wide(block("pricecard", {
    eyebrow: t("priceEyebrow"),
    price: "",
    period: "",
    altPrice: t("altPrice"),
    altPeriod: t("altPeriod"),
    badge: t("priceBadge"),
    ctaLabel: t("ctaLabel"),
    note: t("ctaNote") || t("priceNote"),
    secureNote: t("secureNote"),
  }));
}

/** A single boxed panel holding blocks — funnel-kit's bordered sections. */
function boxed(inner: Block[]): Block | null {
  if (inner.length === 0) return null;
  const row = block("row", { structure: "1", gap: 0 }, {
    width: "full",
    padding: { t: 24, r: 24, b: 24, l: 24, u: "px", link: true },
    radius: 18,
  });
  row.style.background = { ...row.style.background, type: "classic", color: null };
  // A null colour on a classic background means the band's panel, resolved at
  // render — so a boxed panel follows the section it sits in.
  row.columns = [inner];
  return row;
}

/**
 * The blocks one section's stored content describes.
 *
 * `c` is the merged content (defaults filled in) that buildSectionView produces.
 */
export function sectionToBlocks(def: SectionDef, c: Record<string, unknown>): Block[] {
  const out: Block[] = [];
  const t = (k: string) => textOf(c, k);
  const push = (b: Block | null | undefined) => {
    if (b) out.push(b);
  };
  switch (def.key) {
    case "hero": {
      // Copy on the left, the facts card on the right — the shape the hero had
      // before the conversion flattened it into one long column with half the
      // band empty beside it.
      const left: Block[] = [];
      if (t("prehead")) left.push(paragraph(t("prehead")));
      if (t("headline")) left.push(wide(heading(t("headline"), "h1")));
      if (t("subhead")) left.push(paragraph(t("subhead")));
      const bullets = listOf(c.bullets, ["text"]);
      if (t("ctaLabel")) left.push(block("button", { text: t("ctaLabel"), action: "buy" }));
      if (t("ctaSecondary")) left.push(block("button", { text: t("ctaSecondary"), variant: "outline", action: "link", link: "#how" }));
      if (t("ctaNote")) left.push(paragraph(t("ctaNote")));
      // The figures sit under the buttons, not as a strip across the band — on
      // the model page they are a small row beneath the call to action.
      const stats = listOf(c.stats, ["value", "label"]);
      if (stats.length) left.push(wide(block("stats", { items: stats, layout: "strip" })));
      // A chip that hugs its text, not a full-width line.
      if (t("audience")) left.push({ ...paragraph(t("audience")), style: { ...paragraph("").style, width: "fit" as const } });

      // The deliverables become the card beside the copy — numbered, boxed,
      // one column. That card is the first thing the model page shows you.
      const right: Block[] = [];
      if (bullets.length) {
        right.push(wide(block("cards", {
          items: bullets.map((b) => ({ title: b.text, body: "" })),
          columns: 1, numbered: true, skin: "list", numberStyle: "eyebrow",
          title: t("packageTitle"), note: t("packageNote"),
        })));
      }
      const facts = listOf(c.facts, ["label", "value", "detail"]);
      if (facts.length) right.push(wide(block("stats", { items: facts, layout: "card" })));

      // Three to two, which is where the model page sits — the copy leads, the
      // card supports. An even split gives them equal weight; 2-1 crushes the
      // card into a column too narrow for its rows.
      const pair = split(left, right, "3-2");
      if (pair) push(pair);
      else out.push(...left, ...right);
      break;
    }

    case "offer": {
      if (t("heading")) push(wide(heading(t("heading"))));
      if (t("note")) push(paragraph(t("note")));
      out.push(...cardGrid(listOf(c.modules, ["title", "body"]), true, "plain", "eyebrow"));
      const stack = listOf(c.stack, ["label", "amount"]);
      if (stack.length || t("totalAmount")) {
        push(
          boxed([
            block(
              "pricing",
              { items: stack, highlightLast: false, totalLabel: t("totalLabel"), totalAmount: t("totalAmount") },
              { width: "full" },
            ),
          ]),
        );
      }
      // The button the stack has been building towards.
      if (t("ctaLabel")) push(block("button", { text: t("ctaLabel"), action: "buy" }));
      if (t("ctaNote")) push(paragraph(t("ctaNote")));
      break;
    }

    case "problem": {
      if (t("heading")) push(centred(wide(heading(t("heading")))));
      if (t("lead")) push(centred(paragraph(t("lead"))));
      out.push(...cardGrid(listOf(c.traps, ["title", "body"]), true, "tinted", "inline"));
      const chips = listOf(c.chips, ["text"]);
      // Their own words, quoted — the quote marks were added by the renderer
      // before, so they are made part of the text here rather than lost.
      if (chips.length) {
        push(block("iconlist", { items: chips.map((x) => ({ text: `“${x.text}”` })), layout: "inline" }, { width: "full" }));
      }
      // One narrower column to close the section — the story they tell
      // themselves in italics, then the reframe in bold. The two-column version
      // gave equal weight to the thing that is wrong and the thing that is
      // right, which is the opposite of the point.
      const feels = t("feels");
      const truth = t("truth");
      if (feels) push(centred(block("text", { html: `<p><em>${escapeHtml(feels)}</em></p>` }, { width: "wide" })));
      if (truth) push(centred(block("text", { html: `<p><strong>${escapeHtml(truth)}</strong></p>` }, { width: "wide" })));
      break;
    }

    case "solution": {
      // Heading on one side, the explanation on the other. The model page uses
      // this shape repeatedly, and it is what stops every band opening alike.
      const head = t("heading") ? [wide(heading(t("heading")))] : [];
      const lead = t("lead") ? [wide(paragraph(t("lead")))] : [];
      const opener = split(head, lead, "1-1");
      if (opener) push(opener);
      else out.push(...head, ...lead);
      // Numbered only when the layout said these were a sequence. The question
      // grid variant is explicitly not one, and numbering it would claim an
      // order that is not there.
      out.push(...cardGrid(listOf(c.steps, ["title", "body"]), true, "boxed", "circle"));
      // Left, like the heading and the cards above it. Centred on its own it
      // read as a stray caption rather than the conclusion of the section.
      if (t("result")) push(block("text", { html: `<p><strong>${escapeHtml(t("result"))}</strong></p>` }, { width: "wide" }));
      break;
    }

    case "benefits": {
      if (t("heading")) push(centred(wide(heading(t("heading")))));
      out.push(...cardGrid(listOf(c.items, ["title", "body", "icon"]), false, "tinted", "eyebrow"));
      break;
    }

    case "authority": {
      // Copy on one side, the portrait on the other — the model page's
      // credibility band.
      const copy: Block[] = [];
      if (t("heading")) copy.push(wide(heading(t("heading"))));
      if (t("body")) copy.push(wide(paragraph(t("body"))));
      const figures = listOf(c.figures, ["value", "label"]);
      if (figures.length) copy.push(wide(block("stats", { items: figures, layout: "strip" })));
      // The logos, in their own panel under the copy.
      const logos = listOf(c.logos, ["name", "url"]);
      if (logos.length) {
        const inner: Block[] = [];
        if (t("logosLabel")) inner.push(wide(block("text", { html: `<p><em>${escapeHtml(t("logosLabel"))}</em></p>` })));
        inner.push(wide(block("cards", {
          items: logos.map((l) => ({ title: l.name, body: "", icon: l.url })),
          columns: Math.min(logos.length, 4), numbered: false, skin: "plain",
        })));
        const panel = boxed(inner);
        if (panel) copy.push(panel);
      }

      const portrait: Block[] = t("imageUrl")
        ? [wide(block("image", { url: t("imageUrl"), alt: "", ratio: "4/3" }, { radius: 18 }))]
        : [];
      const pair = split(copy, portrait, "1-1");
      if (pair) push(pair);
      // With no portrait the copy would run the whole width of the band, which
      // is far too long a line for a headline this size. Kept to a measure.
      else out.push(...copy.map((b) => (b.type === "row" ? b : { ...b, style: { ...b.style, width: "normal" as const } })));
      break;
    }

    case "proof": {
      if (t("heading")) push(centred(wide(heading(t("heading")))));
      const quotes = listOf(c.quotes, ["quote", "name", "role"]);
      if (quotes.length) push(block("slides", { items: quotes, perView: Math.min(quotes.length, 2) }, { width: "full" }));
      const results = listOf(c.results, ["title", "before", "after", "detail"]);
      if (results.length) {
        out.push(...cardGrid(
          results.map((r) => ({
            title: r.title,
            body: r.detail,
            amount: r.before && r.after ? `${r.before} → ${r.after}` : r.after || r.before,
          })),
          false, "boxed", "eyebrow",
        ));
      }
      out.push(...cardGrid(listOf(c.reasons, ["title", "body"]), false, "bordered", "eyebrow"));
      if (t("note")) push(centred(paragraph(t("note"))));
      break;
    }

    case "value": {
      if (t("heading")) push(centred(wide(heading(t("heading")))));
      // What the result is worth, before what it would cost another way. The
      // definition asks for both and we only had the second.
      const worth = listOf(c.worth, ["label", "amount"]);
      if (worth.length) {
        push(block("pricing", { items: worth, highlightLast: false, totalLabel: "", totalAmount: "" }, { width: "full" }));
      }
      const options = listOf(c.options, ["label", "amount", "note"]);
      if (options.length) push(block("pricing", { items: options, highlightLast: true }, { width: "full" }));
      // The checkout box: what is included, the note under the price and the
      // guarantee, in one bordered panel rather than three loose paragraphs.
      const checklist = listOf(c.checklist, ["text"]);
      const boxInner: Block[] = [];
      if (checklist.length) boxInner.push(block("iconlist", { items: checklist }, { width: "wide" }));
      if (t("priceNote")) boxInner.push(paragraph(t("priceNote")));
      // The checklist on the left, the price card on the right — the way the
      // reference page reveals a price. The card's own price is left blank so
      // it shows the offer's real figure.
      const card = priceCard(c, t);
      const priced = card ? split(boxInner, [card], "1-1") : null;
      if (priced) push(priced);
      else { push(boxed(boxInner)); push(card); }
      break;
    }

    case "guarantee": {
      // One panel. A guarantee buried under a price is a guarantee nobody
      // reads, which is the whole reason it was pulled out of section nine.
      const inner: Block[] = [];
      if (t("heading")) inner.push(wide(heading(t("heading"))));
      if (t("body")) inner.push(wide(paragraph(t("body"))));
      const points = listOf(c.points, ["text"]);
      if (points.length) inner.push(wide(block("iconlist", { items: points })));
      if (t("note")) inner.push(wide(paragraph(t("note"))));
      const panel = boxed(inner);
      if (panel) push(panel);
      else out.push(...inner);
      break;
    }

    case "faq": {
      if (t("heading")) push(wide(heading(t("heading"))));
      const faqs = listOf(c.faqs, ["q", "a"]);
      if (faqs.length) push(wide(block("faq", { items: faqs })));
      break;
    }

    case "footer": {
      if (t("logoUrl")) push(centred(block("image", { url: t("logoUrl"), alt: "" }, { width: "narrow" })));
      if (t("note")) push(centred(paragraph(t("note"))));
      const links = listOf(c.links, ["label", "url"]);
      if (links.length) {
        const html = links
          .map((l) => `<a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>`)
          .join(" &middot; ");
        push(centred(block("text", { html: `<p>${html}</p>` }, { width: "wide" })));
      }
      break;
    }

    case "cta": {
      // The close: heading and checklist on the left, the price panel beside
      // it — the way the model page ends, twice.
      const closeLeft: Block[] = [];
      if (t("heading")) closeLeft.push(wide(heading(t("heading"))));
      const checklist = listOf(c.checklist, ["text"]);
      if (checklist.length) closeLeft.push(wide(block("iconlist", { items: checklist })));

      // The same price card that revealed the price at 9, repeated at the
      // close — as the reference page does.
      const closeCard = priceCard(c, t);
      const closePair = closeCard ? split(closeLeft, [closeCard], "1-1") : null;
      if (closePair) push(closePair);
      else { out.push(...closeLeft); push(closeCard); }
      if (t("warningBody")) {
        const warn: Block[] = [];
        if (t("warningTitle")) warn.push(heading(t("warningTitle"), "h4"));
        warn.push(paragraph(t("warningBody")));
        push(boxed(warn));
      }
      break;
    }
  }

  // The free-form Copy field goes last, as it rendered before.
  const copy = t("copy");
  if (copy.replace(/<[^>]*>/g, "").trim()) out.push(block("text", { html: copy }));

  return out;
}

/**
 * The blocks a section renders.
 *
 * Stored blocks win. A section that has never been opened in the builder falls
 * back to the conversion, so every existing page is already a block page — it
 * simply has not been saved as one yet.
 */
export function blocksForSection(view: SectionView): Block[] {
  const saved = view.stored.blocks;
  if (Array.isArray(saved) && saved.length > 0) return saved as Block[];
  // From what was STORED, not from the defaults merged over it. A default is
  // guidance; converting it would hand someone a canvas full of placeholder
  // prose to delete before they could start.
  return sectionToBlocks(view.def, view.stored);
}

/** True when this section is still showing converted content rather than saved blocks. */
export function isUnconverted(view: SectionView): boolean {
  const saved = view.stored.blocks;
  return !Array.isArray(saved) || saved.length === 0;
}
