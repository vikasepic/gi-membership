import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { SETTINGS_DEFAULTS, type Settings } from "@/lib/settings-schema";
import { normalizeSiteShell, siteShellCss, type SiteShell } from "@/lib/site-shell";

// A buyer mid-payment should not be handed four ways to leave. The upsell page
// escaped the shell for that reason long before the checkout did.

const src = readFileSync("components/app-shell.tsx", "utf8");
const owns = (src.match(/OWNS_THE_WINDOW = \[([^\]]*)\]/)?.[1] ?? "")
  .split(",")
  .map((s) => s.trim().replace(/^"|"$/g, ""))
  .filter(Boolean);

describe("which pages own the whole window", () => {
  it.each(["/checkout", "/checkout/offer", "/checkout/oto"])("%s does", (path) => {
    expect(owns).toContain(path);
  });

  it("thank-you does not", () => {
    // At that point the navigation is how someone reaches what they just
    // bought. Taking it away strands them on a receipt.
    expect(owns).not.toContain("/checkout/thank-you");
  });

  it("matches exactly, not by prefix", () => {
    // startsWith("/checkout") would have swallowed thank-you and every future
    // page under it, silently.
    expect(src).toContain("OWNS_THE_WINDOW.includes(pathname)");
  });
});

// ---------------------------------------------------------------------------
// What the Header & navigation settings do, and what leaving them alone does
// ---------------------------------------------------------------------------

const nav = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));

const { AppShell } = await import("@/components/app-shell");

function render(shell: Partial<SiteShell> = {}, path = "/"): string {
  nav.path = path;
  const settings: Settings = {
    ...SETTINGS_DEFAULTS,
    name: "Greater Inside",
    siteShell: normalizeSiteShell(shell),
  };
  return renderToStaticMarkup(
    <AppShell settings={settings}>
      <p>page</p>
    </AppShell>,
  );
}

/** Every `class="…"` in the markup, so a class list can be checked as a whole. */
const classes = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1].replace(/&#x27;/g, "'"));

const hasClass = (html: string, exact: string) => classes(html).includes(exact);

/**
 * The class strings this file rendered before any of it was settable.
 *
 * Copied from the version at the commit that introduced these settings, not
 * regenerated from the component — a snapshot taken from the thing under test
 * proves only that it agrees with itself.
 */
const TODAY = {
  mobileBar:
    "sticky top-0 z-20 flex items-center justify-center border-b border-border bg-surface/85 px-5 py-3.5 backdrop-blur md:hidden",
  desktopBar: "sticky top-0 z-20 hidden border-b border-border bg-surface/80 backdrop-blur md:block",
  desktopBarInner: "mx-auto flex max-w-5xl items-center justify-between px-6 py-4",
  main: "mx-auto w-full max-w-5xl flex-1 px-5 pt-6 md:px-6",
  footer:
    "mx-auto w-full max-w-5xl px-5 pt-10 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pb-10",
  tabBar: "fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/90 backdrop-blur md:hidden",
  linkCurrent: "rounded-full px-4 py-2 text-sm transition-colors bg-surface-2 text-fg",
  linkIdle: "rounded-full px-4 py-2 text-sm transition-colors text-muted hover:text-fg",
  tabCurrent: "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-primary",
  brand: "h-7 w-auto text-fg",
  footerBrand: "h-5 w-auto text-fg",
};

describe("with nothing set", () => {
  const html = render();

  it("ships no stylesheet at all", () => {
    // Not "an empty one" — an untouched store must cost zero bytes, and the
    // hook classes below only exist when there is a rule aiming at them.
    expect(html).not.toContain("<style");
    expect(html).not.toContain("shell-");
  });

  it.each([
    ["mobile bar", TODAY.mobileBar],
    ["desktop bar", TODAY.desktopBar],
    ["desktop bar inner", TODAY.desktopBarInner],
    ["main", TODAY.main],
    ["tab bar", TODAY.tabBar],
    ["current link", TODAY.linkCurrent],
    ["idle link", TODAY.linkIdle],
    ["current tab", TODAY.tabCurrent],
    ["brand", TODAY.brand],
    ["footer, reserved padding and all", TODAY.footer],
  ])("renders today's %s", (_what, expected) => {
    expect(hasClass(html, expected)).toBe(true);
  });

  it("renders the three links it always had, in order, twice", () => {
    // Twice: once in the desktop bar and once in the tab row. The labels are
    // the tab labels as well, so six occurrences is the whole nav.
    const labels = [...html.matchAll(/>(Store|Library|Account)</g)].map((m) => m[1]);
    expect(labels).toEqual(["Store", "Library", "Account", "Store", "Library", "Account"]);
  });

  it("has no call to action and no footer note", () => {
    expect(html).not.toContain("bg-primary-hover");
    expect(hasClass(html, "pt-4 text-xs text-muted")).toBe(false);
  });

  it("draws the logo mark rather than the store name", () => {
    expect(hasClass(html, TODAY.footerBrand)).toBe(true);
    expect(html).not.toContain("Greater Inside<");
  });
});

describe("a switched-off link", () => {
  const html = render({
    links: [
      { label: "Store", href: "/", on: true },
      { label: "Library", href: "/library", on: false },
      { label: "Account", href: "/account", on: true },
    ],
  });

  it("goes from the desktop bar and the mobile tabs together", () => {
    // One list feeds both, so "hidden on desktop, still in the tabs" is not a
    // state this can get into.
    expect(html).not.toContain("Library");
    expect(html).not.toContain('href="/library"');
  });

  it("leaves the others alone", () => {
    expect((html.match(/href="\/account"/g) ?? []).length).toBe(2);
    expect((html.match(/>Store</g) ?? []).length).toBe(2);
  });
});

describe("switching the tab bar off", () => {
  const html = render({ mobileNav: "menu" });

  it("takes the reserved padding with it", () => {
    // The 6rem exists only to clear the fixed bar. Left behind, every page on
    // the site would end in six empty rems.
    expect(html).not.toContain("pb-[calc(6rem+env(safe-area-inset-bottom))]");
    expect(classes(html).some((c) => c.includes("pt-10") && c.includes("pb-10"))).toBe(true);
  });

  it("removes the bar itself", () => {
    expect(hasClass(html, TODAY.tabBar)).toBe(false);
  });

  it("puts the links in a menu instead, so they are still reachable", () => {
    expect(html).toContain("<details");
    expect(html).toContain('aria-label="Menu"');
    expect(html).toContain('href="/library"');
  });

  it("keeps the reserved padding when the tabs are merely unlabelled", () => {
    expect(render({ tabLabels: "off" })).toContain("pb-[calc(6rem+env(safe-area-inset-bottom))]");
  });
});

describe("the rest of the panel", () => {
  it("shows the store name when there is no logo and the owner asked for it", () => {
    expect(render({ brandFallback: "name" })).toContain("Greater Inside<");
  });

  it("shows a call to action only when it has both a label and a link", () => {
    expect(render({ ctaLabel: "Join", ctaHref: "/p/join" })).toContain(">Join<");
    expect(render({ ctaLabel: "Join" })).not.toContain(">Join<");
  });

  it("keeps the call to action off the phone unless asked", () => {
    const off = render({ ctaLabel: "Join", ctaHref: "/p/join" });
    const on = render({ ctaLabel: "Join", ctaHref: "/p/join", ctaOnMobile: "on" });
    expect((off.match(/>Join</g) ?? []).length).toBe(1);
    expect((on.match(/>Join</g) ?? []).length).toBe(2);
  });

  it("drops the tab label but keeps the link reachable", () => {
    const html = render({ tabLabels: "off" });
    expect(html).toContain('aria-label="Library"');
    // Once, in the desktop bar — the tab is the icon alone.
    expect((html.match(/>Library</g) ?? []).length).toBe(1);
  });

  it("keeps a label on a custom link, which has no icon to stand in for it", () => {
    const html = render({
      links: [{ label: "Blog", href: "/blog", on: true }],
      tabLabels: "off",
    });
    expect((html.match(/>Blog</g) ?? []).length).toBe(2);
  });

  it("renders the owner's footer line", () => {
    expect(render({ footerNote: "© 2026 Greater Inside Ltd" })).toContain("2026 Greater Inside Ltd");
  });
});

describe("the stylesheet", () => {
  const css = (shell: Partial<SiteShell>) => siteShellCss(normalizeSiteShell(shell));

  it("is empty until something is set", () => {
    expect(css({})).toBe("");
    // Including the values that mean "what it already does".
    expect(css({ barSticky: "on", currentMark: "pill", mobileNav: "tabs" })).toBe("");
  });

  it("repaints the bar opaque when the blur goes", () => {
    // The translucency lives in `bg-surface/85`, so switching the blur off and
    // leaving the alpha would show the page through a bar that no longer
    // blurs it — the worst of both.
    const out = css({ barTranslucent: "off" });
    expect(out).toContain("backdrop-filter:none");
    expect(out).toContain("background:var(--surface)");
  });

  it("lets a chosen colour beat the surface it falls back to", () => {
    const out = css({ barTranslucent: "off", barColor: "#112233" });
    expect(out.indexOf("background:var(--surface)")).toBeLessThan(out.indexOf("background:#112233"));
  });

  it("paints out the pill when the current page is marked another way", () => {
    // The pill is drawn by a class in the markup, so the other two marks have
    // to remove it rather than ask the markup not to draw it.
    expect(css({ currentMark: "underline" })).toContain("background:none");
    expect(css({ currentMark: "none" })).toContain("background:none");
    expect(css({ currentMark: "underline" })).toContain("text-decoration:underline");
  });

  it("leaves the tab bar fixed when the header stops sticking", () => {
    // Both wear `shell-bar` so a colour reaches both. `position:static` on a
    // fixed bar would drop it into the page.
    expect(css({ barSticky: "off" })).toContain("header.shell-bar{position:static}");
  });

  it("writes no media query", () => {
    // The shell already renders the two widths as two elements, so "per
    // device" is a different selector here and 768px stays written down once.
    const everything = css({
      logoHeightDesktop: "40px",
      logoHeightMobile: "24px",
      barHeightDesktop: "80px",
      barHeightMobile: "60px",
      linkSizeDesktop: "15px",
      linkSizeMobile: "10px",
    });
    expect(everything).not.toContain("@media");
  });

  it("refuses a link that is not a link", () => {
    const s = normalizeSiteShell({
      links: [
        { label: "Evil", href: "javascript:alert(1)", on: true },
        { label: "Fine", href: "/fine", on: true },
      ],
    });
    expect(s.links.map((l) => l.href)).toEqual(["/fine"]);
  });
});
