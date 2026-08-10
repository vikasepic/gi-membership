import { z } from "zod";
import { normalizeHex } from "@/lib/color";
import { cleaned, isRecord, matching, oneOf } from "@/lib/site-typography";

/**
 * The header, the navigation and the footer, as data.
 *
 * Everything in `components/app-shell.tsx` was a literal: three link labels, a
 * logo height, three different surface alphas, and 6rem of footer padding that
 * exists only to clear the tab bar. Changing any of them was a deploy, and
 * renaming "Library" to "Courses" was a deploy that touched a component two
 * unrelated pages also render.
 *
 * Two rules, the same two `lib/site-typography` holds itself to:
 *
 *  1. **Unset emits nothing and changes nothing.** Every field is a string and
 *     empty means "whatever the shell already does". A store that has never
 *     opened this panel must ship no extra CSS and no different markup — which
 *     is why the hook classes below are only worn when a rule targets them.
 *  2. **Nothing here throws.** It is read from jsonb on every store page. A
 *     value that does not match its allow-list becomes "", because a header
 *     that renders the default is better than a store that 500s.
 *
 * No database client and no `server-only` import: `components/app-shell.tsx`
 * runs in the browser and reads this module directly.
 */

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

/** One entry in the bar and the tabs. `on: false` keeps it here but off screen. */
export type ShellLink = { label: string; href: string; on: boolean };

export type SiteShell = {
  // Logo & bar
  logoHeightDesktop: string;
  logoHeightMobile: string;
  /** "" and "mark" both mean the drawn logo, which is what renders today. */
  brandFallback: string;
  barColor: string;
  /** "off" turns off both the blur and the translucency behind it. */
  barTranslucent: string;
  barSticky: string;
  barBorder: string;
  barHeightDesktop: string;
  barHeightMobile: string;
  /** "" and "page" both mean the max-w-5xl column the pages use. */
  barWidth: string;
  // Links
  /**
   * `null` means nobody has written the list down and the shell's own three
   * apply. An array means somebody did — and an EMPTY array means they emptied
   * it on purpose. Two states, because one (`[]` for both) meant pressing × on
   * the last link put all three straight back and the button looked broken.
   */
  links: ShellLink[] | null;
  linkSizeDesktop: string;
  linkSizeMobile: string;
  linkWeight: string;
  linkCase: string;
  linkLetterSpacing: string;
  linkColor: string;
  linkHoverColor: string;
  linkCurrentColor: string;
  /** "" and "pill" both mean the filled pill the desktop bar draws today. */
  currentMark: string;
  // Call to action
  ctaLabel: string;
  ctaHref: string;
  ctaOnMobile: string;
  // Mobile navigation
  /** "" and "tabs" both mean the bottom tab bar. */
  mobileNav: string;
  tabLabels: string;
  // Footer
  footerLogoHeight: string;
  footerNote: string;
};

/** The three links the shell has always had, in the order it has always had them. */
export const SHELL_DEFAULT_LINKS: readonly ShellLink[] = [
  { label: "Store", href: "/", on: true },
  { label: "Library", href: "/library", on: true },
  { label: "Account", href: "/account", on: true },
];

export const SHELL_WEIGHTS = ["400", "500", "600", "700"] as const;
export const SHELL_CASES = ["none", "uppercase", "lowercase", "capitalize"] as const;

// ---------------------------------------------------------------------------
// The schema
// ---------------------------------------------------------------------------

const LENGTH = /^(\d*\.?\d+(px|em|rem))?$/;
const SPACE = /^(-?\d*\.?\d+(px|em))?$/;
const SWITCH = ["on", "off"] as const;

/**
 * Where a link may point.
 *
 * Anything else — `javascript:` first among them — becomes "" and the link is
 * dropped. These strings come from a form an admin fills in, but they are
 * written straight into an `href` that every visitor is invited to click, and
 * that is a trust boundary whatever the shape of the session behind it.
 *
 * `(?![\/\\])` after the first slash is what stops `//evil.com`: a protocol-
 * relative URL looks like a path to a regex and like another origin to a
 * browser, and "starts with a slash so it is on this site" was the whole
 * reason that branch is allowed. The backslash is in there because the URL
 * parser treats `\` as `/` in an http(s) URL and a regex does not — `/\evil.com`
 * read as a path and resolved to `https://evil.com/`.
 */
const HREF = /^(\/(?![/\\])[^\s]*|https?:\/\/[^\s]+|mailto:[^\s]+)$/i;

export function shellHrefIsValid(raw: string): boolean {
  const v = raw.trim();
  return v === "" || HREF.test(v);
}

const linkSchema = z.unknown().transform((v): ShellLink => {
  const r = isRecord(v) ? v : {};
  const label = typeof r.label === "string" ? r.label.trim().slice(0, 40) : "";
  const rawHref = typeof r.href === "string" ? r.href.trim().slice(0, 300) : "";
  return {
    label,
    href: HREF.test(rawHref) ? rawHref : "",
    // Absent means on: a link somebody added and never touched the switch on
    // is a link they wanted.
    on: r.on !== false,
  };
});

/** At most a dozen: a nav bar is not a sitemap, and the tab row has to fit a phone. */
const linksSchema = z
  .unknown()
  .optional()
  .transform((v) =>
    Array.isArray(v)
      ? v
          .slice(0, 12)
          .map((item) => linkSchema.parse(item))
          // A row with neither a label nor a destination is a row somebody
          // started and abandoned, not a link.
          .filter((l) => l.label !== "" && l.href !== "")
      : // Not an array at all: never written. Distinct from an empty array,
        // which is somebody having emptied the bar deliberately.
        null,
  );

const shellSchema = z.object({
  logoHeightDesktop: matching(LENGTH),
  logoHeightMobile: matching(LENGTH),
  brandFallback: oneOf(["mark", "name"]),
  barColor: cleaned((raw) => (raw ? normalizeHex(raw, "") : "")),
  barTranslucent: oneOf(SWITCH),
  barSticky: oneOf(SWITCH),
  barBorder: oneOf(SWITCH),
  barHeightDesktop: matching(LENGTH),
  barHeightMobile: matching(LENGTH),
  barWidth: oneOf(["page", "full"]),
  links: linksSchema,
  linkSizeDesktop: matching(LENGTH),
  linkSizeMobile: matching(LENGTH),
  linkWeight: oneOf(SHELL_WEIGHTS),
  linkCase: oneOf(SHELL_CASES),
  linkLetterSpacing: matching(SPACE),
  linkColor: cleaned((raw) => (raw ? normalizeHex(raw, "") : "")),
  linkHoverColor: cleaned((raw) => (raw ? normalizeHex(raw, "") : "")),
  linkCurrentColor: cleaned((raw) => (raw ? normalizeHex(raw, "") : "")),
  currentMark: oneOf(["pill", "underline", "none"]),
  ctaLabel: cleaned((raw) => raw.slice(0, 40)),
  ctaHref: cleaned((raw) => (HREF.test(raw.slice(0, 300)) ? raw.slice(0, 300) : "")),
  ctaOnMobile: oneOf(SWITCH),
  mobileNav: oneOf(["tabs", "menu"]),
  tabLabels: oneOf(SWITCH),
  footerLogoHeight: matching(LENGTH),
  footerNote: cleaned((raw) => raw.slice(0, 300)),
});

/**
 * Total, not strict. Parses `{}`, `null`, last year's shape and its own output
 * back to the same thing — it is read on every store page render.
 */
export const SITE_SHELL_SCHEMA: z.ZodType<SiteShell, unknown> = z
  .unknown()
  // Optional so it can be a key in an object schema parsed from `{}`, which is
  // exactly what a store that has never saved settings holds.
  .optional()
  .transform((v) => shellSchema.parse(isRecord(v) ? v : {}) as SiteShell);

export function normalizeSiteShell(value: unknown): SiteShell {
  return SITE_SHELL_SCHEMA.parse(value);
}

/** Everything unset: the shell exactly as it was hardcoded. */
export const SITE_SHELL_DEFAULTS: SiteShell = normalizeSiteShell({});

// ---------------------------------------------------------------------------
// What the shell asks it
// ---------------------------------------------------------------------------

/**
 * The links to draw.
 *
 * `null` is the untouched store and gets the shell's own three. An empty array
 * is somebody having removed every row, and gets nothing — which is the only
 * reading under which the × button does what it says.
 */
export function shellLinks(s: SiteShell): ShellLink[] {
  return (s.links ?? SHELL_DEFAULT_LINKS).filter((l) => l.on);
}

/**
 * Whether the bottom tab bar renders.
 *
 * The footer reserves 6rem of bottom padding for one reason only: to keep the
 * fixed bar off the last line of every page. Switch the bar off and that
 * padding has to go with it, or every page on the site ends in six empty rems
 * of nothing. The two answers come from this one function so they cannot
 * disagree.
 */
export function shellHasTabs(s: SiteShell): boolean {
  return s.mobileNav !== "menu" && shellLinks(s).length > 0;
}

// ---------------------------------------------------------------------------
// The CSS writer
// ---------------------------------------------------------------------------

/**
 * The classes the rules below aim at.
 *
 * They are worn only when `siteShellCss` returns something — a store that has
 * set nothing renders the markup it always rendered, down to the class
 * attribute, and this file is provably a no-op for it.
 */
export const SHELL_CLASS = {
  bar: "shell-bar",
  barInner: "shell-bar-inner",
  barMobile: "shell-bar-mobile",
  brandDesktop: "shell-brand-desktop",
  brandMobile: "shell-brand-mobile",
  brandFooter: "shell-brand-footer",
  link: "shell-link",
  tab: "shell-tab",
  current: "shell-current",
} as const;

/**
 * A hook class, named twice.
 *
 * The same trick `blockClass` uses, for the same reason. One class is 0-1-0,
 * which loses to the `:root a` that Typography → Link writes (0-1-1) — so a
 * nav colour set in the panel actually called "Header & navigation" was
 * overruled by one set under Typography, while `.shell-link:hover` still won
 * its own fight. Naming it twice is 0-2-0 and puts the shell back on top of its
 * own bar without an !important. It matches exactly what one class matched.
 */
const twice = (name: string) => `.${name}.${name}`;

/**
 * The stylesheet, or "" when nothing is set.
 *
 * No media queries, deliberately. The shell already renders the two widths as
 * two separate elements — a `md:hidden` mobile header and a `hidden md:block`
 * desktop one, a tab row and a nav row — so "per device" here is a different
 * selector rather than a different width, and the one breakpoint that would
 * have to be written down (768px) stays written down in exactly one place.
 *
 * Every class is named twice — see `twice`. Tailwind's utilities are in
 * `@layer utilities` and would lose to one class, but `:root a` from
 * Typography → Link is unlayered and 0-1-1, and it was quietly overruling the
 * nav colour set in this very panel.
 */
export function siteShellCss(s: SiteShell): string {
  const out: string[] = [];

  const bar: string[] = [];
  if (s.barTranslucent === "off") {
    // The translucency is baked into `bg-surface/85`, so turning it off has to
    // repaint the ground opaque as well — otherwise the page keeps showing
    // through a bar that no longer blurs it, which is the worst of both.
    bar.push("backdrop-filter:none", "background:var(--surface)");
  }
  // After the line above, so a colour and "not translucent" together give the
  // colour rather than the surface.
  if (s.barColor) bar.push(`background:${s.barColor}`);
  if (bar.length > 0) out.push(`${twice(SHELL_CLASS.bar)}{${bar.join(";")}}`);

  // The two headers only. The mobile tab row wears the same class so a colour
  // reaches it too, but it is `fixed` to the bottom of the window — turning
  // sticky off there would drop it into the middle of the page, and its border
  // is on the other edge.
  const head: string[] = [];
  if (s.barSticky === "off") head.push("position:static");
  if (s.barBorder === "off") head.push("border-bottom-width:0");
  if (head.length > 0) out.push(`header${twice(SHELL_CLASS.bar)}{${head.join(";")}}`);

  const inner: string[] = [];
  if (s.barWidth === "full") inner.push("max-width:none");
  if (s.barHeightDesktop) inner.push(`min-height:${s.barHeightDesktop}`);
  if (inner.length > 0) out.push(`${twice(SHELL_CLASS.barInner)}{${inner.join(";")}}`);
  if (s.barHeightMobile) out.push(`${twice(SHELL_CLASS.barMobile)}{min-height:${s.barHeightMobile}}`);

  if (s.logoHeightDesktop) out.push(`${twice(SHELL_CLASS.brandDesktop)}{height:${s.logoHeightDesktop}}`);
  if (s.logoHeightMobile) out.push(`${twice(SHELL_CLASS.brandMobile)}{height:${s.logoHeightMobile}}`);
  if (s.footerLogoHeight) out.push(`${twice(SHELL_CLASS.brandFooter)}{height:${s.footerLogoHeight}}`);

  const link: string[] = [];
  if (s.linkWeight) link.push(`font-weight:${s.linkWeight}`);
  if (s.linkCase) link.push(`text-transform:${s.linkCase}`);
  if (s.linkLetterSpacing) link.push(`letter-spacing:${s.linkLetterSpacing}`);
  if (s.linkColor) link.push(`color:${s.linkColor}`);
  if (link.length > 0) out.push(`${twice(SHELL_CLASS.link)},${twice(SHELL_CLASS.tab)}{${link.join(";")}}`);
  if (s.linkSizeDesktop) out.push(`${twice(SHELL_CLASS.link)}{font-size:${s.linkSizeDesktop}}`);
  if (s.linkSizeMobile) out.push(`${twice(SHELL_CLASS.tab)}{font-size:${s.linkSizeMobile}}`);

  // The pill is drawn by `bg-surface-2` in the markup, so the other two marks
  // have to paint it out rather than ask the markup not to draw it. Same
  // reason as everywhere else here: unset must not change what renders.
  if (s.currentMark === "underline") {
    out.push(`${twice(SHELL_CLASS.current)}{background:none;text-decoration:underline;text-underline-offset:0.35em}`);
  } else if (s.currentMark === "none") {
    out.push(`${twice(SHELL_CLASS.current)}{background:none}`);
  }
  if (s.linkCurrentColor) out.push(`${twice(SHELL_CLASS.current)}{color:${s.linkCurrentColor}}`);
  // Last, and 0-2-0 against the 0-1-0 above it, so hovering the page you are
  // already on still responds.
  if (s.linkHoverColor) {
    out.push(`${twice(SHELL_CLASS.link)}:hover,${twice(SHELL_CLASS.tab)}:hover{color:${s.linkHoverColor}}`);
  }

  return out.join("");
}
