// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The library as a member sees it (5 Oct 2026 redesign, direction A).
 *
 * 76 of 135 members own one app and nothing else. Their library opened with
 * "Nothing here yet", their app below it under "Included with your purchase",
 * and the channel they bought as one grey word. Data is mocked; what is
 * tested is what the page draws from it.
 */

type App = Record<string, unknown>;
const state = vi.hoisted(() => ({
  apps: [] as App[],
  courses: [] as Record<string, unknown>[],
  productIds: new Set<string>(),
  standing: null as Record<string, unknown> | null,
  fullName: "Priya Shah" as string | null,
  standingAsked: null as unknown,
}));

vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); } }));
vi.mock("@/lib/view-as", () => ({ viewer: async () => ({ id: "member-1", email: "priya.shah@gmail.com" }) }));
vi.mock("@/lib/library", () => ({
  listOwnedApps: async () => state.apps,
  getStandingOffer: async (_u: string, opts: unknown) => {
    state.standingAsked = opts;
    return state.standing;
  },
  // The bug: this reads the signed-in admin, not the member being viewed.
  ownedProductIdsForViewer: async () => new Set(["admin-product-1", "admin-product-2"]),
}));
vi.mock("@/lib/checkout", () => ({ ownershipFor: async () => ({ productIds: state.productIds, appIds: new Set(), appChannels: new Map() }) }));
vi.mock("@/lib/courses", () => ({ coursesForUser: async () => state.courses }));
vi.mock("@/lib/learning", () => ({ progressForCourses: async () => new Map(), lastLessonFor: async () => null }));
vi.mock("@/lib/profile", () => ({ getProfile: async () => ({ fullName: state.fullName, email: "priya.shah@gmail.com" }) }));
vi.mock("@/app/(store)/library/actions", () => ({ openAppAction: async () => {} }));

const { default: LibraryPage } = await import("@/app/(store)/library/page");
const render = async (offer?: string) =>
  renderToStaticMarkup(await LibraryPage({ searchParams: Promise.resolve(offer ? { offer } : {}) }));

const contentEngine = (over: App = {}): App => ({
  id: "ce",
  key: "content-engine",
  name: "Content Engine",
  kind: "external",
  route: null,
  host: "content.greaterinside.com",
  status: "trialing",
  statusLine: { tone: "trial", text: "Free trial · ends 8 Oct" },
  channels: ["instagram"],
  description: "Get inspiration from leaders in your industry.",
  initials: "CE",
  badges: [
    { channel: "instagram", label: "Instagram", included: true, addHref: null, addText: null },
    { channel: "linkedin", label: "LinkedIn", included: false, addHref: "/library/offer/li-offer", addText: "Add LinkedIn to your plan for $29 a month" },
  ],
  ...over,
});

beforeEach(() => {
  state.apps = [];
  state.courses = [];
  state.productIds = new Set();
  state.standing = null;
  state.fullName = "Priya Shah";
  state.standingAsked = null;
});

describe("a member who bought one app", () => {
  it("is welcomed by name and sent straight to it, not told the library is empty", async () => {
    state.apps = [contentEngine()];
    const html = await render();
    expect(html).toContain("Welcome back, Priya");
    expect(html).toContain("Content Engine is ready for you.");
    expect(html).toContain("Open Content Engine");
    expect(html).toContain("Opens content.greaterinside.com. You&#x27;ll already be signed in.");
    expect(html).not.toContain("Nothing here yet");
    // The app's own tile, not the offer's marketing banner.
    expect(html).toMatch(/>CE<\/span>/);
    // One app is the whole library: no section heading over a single card.
    expect(html).not.toContain(">Your apps<");
  });

  it("sees what their plan includes, and what it doesn't, with the way to add it", async () => {
    state.apps = [contentEngine()];
    const html = await render();
    expect(html).toContain("What your plan includes");
    expect(html).toMatch(/Instagram<\/span>[\s\S]{0,400}Included/);
    expect(html).toMatch(/LinkedIn<\/span>[\s\S]{0,400}Not in your plan/);
    expect(html).toContain('href="/library/offer/li-offer"');
    expect(html).toContain("Add LinkedIn to your plan for $29 a month");
  });

  it("keeps billing to the status line and one link", async () => {
    state.apps = [contentEngine()];
    const html = await render();
    expect(html).toContain("Free trial · ends 8 Oct");
    expect(html).toContain('href="/account"');
    expect(html).toContain("Billing and invoices");
  });

  it("is told plainly when a payment failed, with the way to fix it", async () => {
    state.apps = [contentEngine({ status: "past_due", statusLine: { tone: "bad", text: "Payment failed · update your card" } })];
    const html = await render();
    expect(html).toContain("Payment failed · update your card");
    expect(html).toContain("Update your card");
  });
});

describe("a member with several things", () => {
  it("gets a heading over their apps, and both cards", async () => {
    state.apps = [
      contentEngine({ status: "active", statusLine: { tone: "ok", text: "Active" }, badges: [] }),
      { ...contentEngine(), id: "funnel", key: "funnel", name: "Funnel App", initials: "FA", badges: [], host: "funnel.greaterinside.com" },
    ];
    const html = await render();
    expect(html).toContain(">Your apps<");
    expect(html).toContain("Open Content Engine");
    expect(html).toContain("Open Funnel App");
    expect(html).toContain("Your apps are below.");
  });
});

describe("what else is on offer", () => {
  it("sits at the bottom, marked as not theirs, and never repeats an app they already have", async () => {
    state.apps = [contentEngine()];
    state.standing = {
      id: "fa-offer", key: "funnel-app", name: "Funnel App", headline: "Build the entire low-ticket funnel in one sitting.",
      description: "A product outline, a 21-step sales letter.", billingType: "recurring", interval: "month", intervalCount: 1,
      trialDays: 7, priceCents: 2900, currency: "usd", grantAppId: "funnel",
    };
    const html = await render();
    expect(html).toContain("More from Greater Inside");
    expect(html).toContain("Not in your plan");
    expect(html).toContain('href="/library/offer/fa-offer"');
    expect(html).toContain("7 days free, then $29 a month");
    expect(state.standingAsked).toEqual({ excludeAppIds: ["ce"] });
  });
});

describe("a member with nothing to open", () => {
  it("counts the member's own products, not the admin's who is viewing as them", async () => {
    // "You own 2 products, but no course has been attached" showed whenever the
    // owner used "Open the store as them" on an app-only member: it counted
    // the owner's own 2 products against the member's empty course list.
    state.fullName = null;
    const html = await render();
    expect(html).not.toContain("You own");
    expect(html).toContain("Nothing here yet");
    expect(html).toContain("Welcome back<");
  });

  it("still explains a product with no course attached, when the member really owns one", async () => {
    state.productIds = new Set(["p1"]);
    const html = await render();
    expect(html).toContain("You own a product");
  });
});

describe("messages after a purchase", () => {
  it("still shows the outcome the checkout sent them back with", async () => {
    state.apps = [contentEngine()];
    expect(await render("added")).toContain("Added — it’s ready in your library.");
  });
});
