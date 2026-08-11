import { newBlock, type Block } from "@/lib/blocks";
import { HOME_SECTION_KEYS } from "@/lib/page-sections";

/**
 * The built-in home page, as blocks.
 *
 * The storefront falls back to a hardcoded page until someone builds one, which
 * is safe but leaves the editor as four empty bands — a blank canvas where a
 * working page used to be, and no way to get from one to the other except by
 * retyping it. This is that button: start from what is live, then change it.
 *
 * It reproduces the SHAPE, not the code. The hardcoded page has an asymmetric
 * hero with a featured panel beside it and a line reading "6 products · from
 * $4.99"; both are computed from the catalogue at render time and neither is a
 * block. What comes out here is the same page said in blocks — heading, line,
 * button, then the catalogue, then the memberships — which is a page somebody
 * can now edit rather than a facsimile they cannot.
 *
 * The copy lives in `HOME_COPY`, which the storefront renders too, so the
 * starter cannot quietly drift from the page it claims to be starting from.
 */

/** The words on the built-in home page. Rendered there, seeded from here. */
export const HOME_COPY = {
  eyebrow: "Greater Inside",
  headline: "A store for the work that goes deeper.",
  subhead:
    "Field-tested guides, audio, and tools — with Content Engine when you’re ready to keep the momentum.",
  browseLabel: "Browse the store",
  catalogTitle: "Everything in the store",
  membershipTitle: "Keep going",
} as const;

const dim = (t: number, r: number, b: number, l: number) =>
  ({ t, r, b, l, u: "px" as const, link: false });

/** One band's starting blocks, keyed by the band it belongs to. */
export function homeStarterBlocks(): Record<string, Block[]> {
  const heading = newBlock("heading", {
    props: { text: HOME_COPY.headline, tag: "h1" },
  });
  const sub = newBlock("text", {
    props: { html: `<p>${HOME_COPY.subhead}</p>` },
    // A new text block is centred inside a 680px measure, which is right for a
    // sales page's prose and wrong here: it put the sub-headline a third of the
    // way in while the heading above and the button below sat flush left, so
    // the hero disagreed with itself.
    style: {
      ...newBlock("text").style,
      blockAlign: "left",
      margin: dim(0, 0, 4, 0),
    },
  });
  const button = newBlock("button", {
    // A link, not a buy: the storefront sells nothing by itself, and a Buy
    // button here would have no price behind it.
    props: { text: HOME_COPY.browseLabel, link: "#catalog", action: "link", variant: "solid", fullWidth: false },
    style: { ...newBlock("button").style, margin: dim(8, 0, 0, 0) },
  });

  const catalog = newBlock("catalog", {
    props: { title: HOME_COPY.catalogTitle, limit: 0, columns: 3, showPrice: true },
  });
  const memberships = newBlock("memberships", {
    props: { title: HOME_COPY.membershipTitle, showOwned: true },
  });

  return {
    welcome: [heading, sub, button],
    browse: [catalog],
    membership: [memberships],
    // Deliberately empty. There is nothing after the shelves on the built-in
    // page, and seeding a band with placeholder prose would hand somebody
    // copy to delete before they could start.
    closing: [],
  };
}

/** Every band the starter writes, in page order. */
export const HOME_STARTER_KEYS = HOME_SECTION_KEYS;
