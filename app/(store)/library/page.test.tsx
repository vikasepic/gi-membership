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
  more: [] as Record<string, unknown>[],
  fullName: "Priya Shah" as string | null,
  moreAsked: null as unknown,
  last: null as Record<string, unknown> | null,
}));

vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); } }));
vi.mock("@/lib/view-as", () => ({ viewer: async () => ({ id: "member-1", email: "priya.shah@gmail.com" }) }));
vi.mock("@/lib/library", () => ({
  listOwnedApps: async () => state.apps,
  listMoreForMember: async (_u: string, opts: unknown) => {
    state.moreAsked = opts;
    return state.more;
  },
  // The bug: this reads the signed-in admin, not the member being viewed.
  ownedProductIdsForViewer: async () => new Set(["admin-product-1", "admin-product-2"]),
}));
vi.mock("@/lib/checkout", () => ({ ownershipFor: async () => ({ productIds: state.productIds, appIds: new Set(), appChannels: new Map() }) }));
vi.mock("@/lib/courses", () => ({ coursesForUser: async () => state.courses }));
vi.mock("@/lib/learning", () => ({ progressForCourses: async () => new Map(), lastLessonFor: async () => state.last }));
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
  state.more = [];
  state.fullName = "Priya Shah";
  state.moreAsked = null;
  state.last = null;
});

describe("a member who bought one app", () => {
  it("is welcomed by name and sent straight to it, not told the library is empty", async () => {
    state.apps = [contentEngine()];
    const html = await render();
    expect(html).toContain("Welcome back, Priya");
    expect(html).toContain("Content Engine is ready for you.");
    expect(html).toContain("Open Content Engine");
    expect(html).not.toContain("Nothing here yet");
    // The app's own tile, not the offer's marketing banner.
    expect(html).toMatch(/>CE<\/span>/);
    // One app: one large card under "Your app".
    expect(html).toContain(">Your app<");
    expect(html).toContain("Opens content.greaterinside.com. You&#x27;ll be signed in automatically.");
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

describe("the welcome", () => {
  it("capitalises a first name typed in lower case", async () => {
    state.fullName = "vikas bendha";
    state.apps = [contentEngine()];
    expect(await render()).toContain("Welcome back, Vikas");
  });
});

describe("the page uses the screen", () => {
  it("asks the store layout for the wide width", async () => {
    // The store shell keeps every other page at its usual width; a page that
    // carries this marker gets 1240px (components/app-shell.tsx).
    state.apps = [contentEngine()];
    expect(await render()).toContain("store-wide");
  });
});

describe("a member with several things", () => {
  it("gets compact cards side by side, each with Open at the bottom and one small billing link", async () => {
    state.apps = [
      contentEngine({ status: "active", statusLine: { tone: "ok", text: "Active" } }),
      { ...contentEngine(), id: "mp", key: "micro-product-builder", name: "Micro-Product Builder", kind: "internal", route: "/apps/micro-product-builder", host: null, initials: "MP", badges: [], description: null },
    ];
    const html = await render();
    expect(html).toContain("Open Content Engine");
    expect(html).toContain("Open Micro-Product Builder");
    expect(html).toContain("Signed in automatically");
    expect(html).toContain("Opens right here");
    expect(html).toMatch(/>Billing<\/a>/);
    expect(html).not.toContain("Billing and invoices");
  });

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
  const funnel = {
    id: "fa-offer", kind: "app", name: "Funnel App", imageUrl: "https://cdn.test/funnel.webp",
    priceLine: "7 days free, then $29 a month", blurb: "Build the entire low-ticket funnel in one sitting.",
    href: "/library/offer/fa-offer", valueCents: 2900, currency: "usd", contentId: "funnel-builder",
  };
  const carousels = {
    id: "p-carousels", kind: "course", name: "The Guide to Viral Carousels", imageUrl: "https://cdn.test/carousels.webp",
    priceLine: "$19, one payment", blurb: "150 hooks, 5 formats, and a posting schedule.",
    href: "/p/the-guide-to-viral-carousels", valueCents: 1900, currency: "usd", contentId: "the-guide-to-viral-carousels",
  };

  it("sits at the bottom, marked as not theirs, and never repeats an app they already have", async () => {
    state.apps = [contentEngine()];
    state.more = [funnel];
    const html = await render();
    expect(html).toContain("More from Greater Inside");
    expect(html).toContain("Not in your plan");
    expect(html).toContain('href="/library/offer/fa-offer"');
    expect(html).toContain("7 days free, then $29 a month");
    expect(state.moreAsked).toEqual({ excludeAppIds: ["ce"] });
  });

  it("shows courses beside apps, each with its picture and its kind", async () => {
    state.apps = [contentEngine()];
    state.more = [funnel, carousels];
    const html = await render();
    expect(html).toContain("The Guide to Viral Carousels");
    expect(html).toContain('href="/p/the-guide-to-viral-carousels"');
    expect(html).toContain('src="https://cdn.test/carousels.webp"');
    expect(html).toContain('src="https://cdn.test/funnel.webp"');
    expect(html).toContain(">Course<");
    expect(html).toContain(">App<");
  });

  it("shows at most eight, with the way to the rest of the store", async () => {
    state.apps = [contentEngine()];
    state.more = Array.from({ length: 10 }, (_, i) => ({ ...carousels, id: `p${i}`, name: `Course ${i}`, href: `/p/course-${i}` }));
    const html = await render();
    expect(html).toContain("Course 7");
    expect(html).not.toContain("Course 8");
    expect(html).toContain("Everything in the store");
  });

  it("leaves the section out when there is nothing they don't own", async () => {
    state.apps = [contentEngine()];
    expect(await render()).not.toContain("More from Greater Inside");
  });
});

describe("an app's picture", () => {
  it("shows the product picture instead of the initials", async () => {
    state.apps = [contentEngine({ imageUrl: "https://cdn.test/ce.webp" })];
    const html = await render();
    expect(html).toContain('src="https://cdn.test/ce.webp"');
    expect(html).not.toContain(">CE<");
  });

  it("falls back to the initials when the app has no picture", async () => {
    state.apps = [contentEngine({ imageUrl: null }), contentEngine({ id: "fa", key: "funnel", name: "Funnel App", initials: "FA", imageUrl: null })];
    const html = await render();
    expect(html).toContain(">CE<");
    expect(html).toContain(">FA<");
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

describe("picking up where they left off", () => {
  it("sits beside the welcome as one slim card that opens the lesson", async () => {
    state.apps = [contentEngine()];
    state.courses = [{ id: "c1", slug: "book-launch", title: "The Book Launch System", subtitle: "From manuscript to book.", type: "course", coverPath: null }];
    state.last = { courseId: "c1", itemId: "i9", title: "Complete Book Launch System", courseTitle: "The Book Launch System", courseSlug: "book-launch", at: "2026-09-21T10:00:00Z", positionSeconds: null, durationSeconds: null, completed: false };
    const html = await render();
    expect(html).toContain("Pick up where you left off");
    expect(html).toContain("Complete Book Launch System");
    expect(html).toContain('href="/library/book-launch/i9"');
  });
});

describe("courses", () => {
  it("an untouched course says Start, with its title at the library's size", async () => {
    state.courses = [{ id: "c1", slug: "book-launch", title: "The Book Launch System", subtitle: "From manuscript to book.", type: "course", coverPath: null }];
    const html = await render();
    expect(html).toContain(">Your course<");
    expect(html).toContain("Start");
    expect(html).toContain('href="/library/book-launch"');
  });
});
