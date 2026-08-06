import { describe, it, expect } from "vitest";
import {
  applyMemberFilter,
  holdsLabel,
  isAdminMember,
  memberChipCounts,
  memberFilterFrom,
  memberHref,
  memberTotals,
  standingOf,
  DEFAULT_MEMBER_FILTER,
} from "@/lib/member-view";
import type { MemberRow } from "@/lib/members";

const member = (over: Partial<MemberRow> = {}): MemberRow => ({
  id: "u1",
  email: "a@test.com",
  username: null,
  isAdmin: false,
  createdAt: "2026-08-01T00:00:00Z",
  orders: 0,
  refundedOrders: 0,
  spentCents: 0,
  courses: 0,
  subscriptions: [],
  ...over,
});

const sub = (status: string, appName = "Content Engine") => ({
  appName,
  status,
  subscriptionId: "sub_1",
});

/** Close to the real store: seven members, two paying, two on trial. */
const SET: MemberRow[] = [
  member({ id: "1", email: "pm.inlo@greaterinside.com", username: "Muskan", createdAt: "2026-08-05T00:00:00Z" }),
  member({
    id: "2",
    email: "a@ajitnawalkha.com",
    username: "Ajit Nawalkha",
    isAdmin: true,
    subscriptions: [sub("canceled")],
    createdAt: "2026-08-01T10:00:00Z",
  }),
  member({
    id: "3",
    email: "vickybendha+34555@gmail.com",
    username: "Vikas Bendha",
    subscriptions: [sub("trialing")],
    refundedOrders: 1,
    createdAt: "2026-08-01T09:00:00Z",
  }),
  member({
    id: "4",
    email: "vickybendha+1@gmail.com",
    username: "Vikas Bendha",
    subscriptions: [sub("active")],
    refundedOrders: 1,
    createdAt: "2026-08-01T08:00:00Z",
  }),
  member({
    id: "5",
    email: "ronitsurana1819+100@gmail.com",
    username: "Ronit Surana",
    subscriptions: [sub("canceled"), sub("trialing", "Funnel App")],
    refundedOrders: 2,
    createdAt: "2026-07-31T00:00:00Z",
  }),
  member({
    id: "6",
    email: "vikas@gowithepic.com",
    username: "Vikas Bendha",
    orders: 2,
    spentCents: 12699,
    createdAt: "2026-07-22T00:00:00Z",
  }),
  member({ id: "7", email: "old@test.com", courses: 1, createdAt: "2026-07-01T00:00:00Z" }),
];

const ENV = ["vikas@gowithepic.com"];
const at = (f: Partial<typeof DEFAULT_MEMBER_FILTER> = {}) => ({ ...DEFAULT_MEMBER_FILTER, ...f });
const ids = (rows: MemberRow[]) => rows.map((m) => m.id);

describe("where someone stands", () => {
  it("is trialing while a trial is running", () => {
    expect(standingOf(member({ subscriptions: [sub("trialing")] }))).toBe("trialing");
  });

  it("puts a trial ahead of a payment", () => {
    // A trial that has not converted is the state worth acting on.
    expect(standingOf(member({ orders: 3, subscriptions: [sub("trialing")] }))).toBe("trialing");
  });

  it("counts a past_due card as still paying", () => {
    // Stripe is retrying a card that often works on the second attempt, and
    // access has deliberately not been withdrawn.
    expect(standingOf(member({ subscriptions: [sub("past_due")] }))).toBe("paying");
  });

  it("counts a one-off buyer as paying", () => {
    expect(standingOf(member({ orders: 1, spentCents: 700 }))).toBe("paying");
  });

  it("is lapsed when something ended", () => {
    expect(standingOf(member({ subscriptions: [sub("canceled")] }))).toBe("lapsed");
  });

  it("counts a refund as having had something", () => {
    // They bought. It came back. That is a different person from a stranger.
    expect(standingOf(member({ refundedOrders: 1 }))).toBe("lapsed");
  });

  it("is none for an account that never got started", () => {
    // The difference between a win-back and a stranger.
    expect(standingOf(member())).toBe("none");
  });
});

describe("who counts as an admin", () => {
  it("includes the flag in the database", () => {
    expect(isAdminMember(member({ isAdmin: true }), [])).toBe(true);
  });

  it("includes the env list, which the flag cannot see", () => {
    // The guard reads ADMIN_EMAILS first, so a page that only looked at the
    // flag would understate who can reach the admin.
    expect(isAdminMember(member({ email: "owner@test.com" }), ["owner@test.com"])).toBe(true);
  });

  it("matches an address whatever its case", () => {
    expect(isAdminMember(member({ email: "Owner@Test.com" }), ["owner@test.com"])).toBe(true);
  });
});

describe("reading the filter off the URL", () => {
  it("defaults to everyone, newest first", () => {
    expect(memberFilterFrom({})).toEqual(DEFAULT_MEMBER_FILTER);
  });

  it("refuses a standing it does not know", () => {
    expect(memberFilterFrom({ standing: "../../etc" }).standing).toBe("all");
  });

  it("caps a search that is really a payload", () => {
    expect(memberFilterFrom({ q: "x".repeat(400) }).q.length).toBe(120);
  });

  it("leaves nothing in the URL for the default view", () => {
    expect(memberHref(DEFAULT_MEMBER_FILTER, {})).toBe("/admin/members");
  });

  it("keeps the search while changing the standing", () => {
    const href = memberHref(at({ q: "vikas" }), { standing: "paying" });
    expect(href).toContain("standing=paying");
    expect(href).toContain("q=vikas");
  });
});

describe("filtering", () => {
  it("shows everyone by default", () => {
    expect(applyMemberFilter(SET, DEFAULT_MEMBER_FILTER, ENV)).toHaveLength(7);
  });

  it("finds who is on a trial right now", () => {
    expect(ids(applyMemberFilter(SET, at({ standing: "trialing" }), ENV))).toEqual(["3", "5"]);
  });

  it("finds who is paying", () => {
    expect(ids(applyMemberFilter(SET, at({ standing: "paying" }), ENV))).toEqual(["4", "6"]);
  });

  it("finds who has lapsed", () => {
    expect(ids(applyMemberFilter(SET, at({ standing: "lapsed" }), ENV))).toEqual(["2", "7"]);
  });

  it("answers who can reach this admin", () => {
    // Reading every row was the only way to know before.
    expect(ids(applyMemberFilter(SET, at({ standing: "admins" }), ENV))).toEqual(["2", "6"]);
  });

  it("searches name, email and what they hold", () => {
    expect(applyMemberFilter(SET, at({ q: "ronit" }), ENV)).toHaveLength(1);
    expect(applyMemberFilter(SET, at({ q: "Vikas Bendha" }), ENV)).toHaveLength(3);
    expect(applyMemberFilter(SET, at({ q: "funnel" }), ENV)).toHaveLength(1);
  });

  it("sorts by what they have spent", () => {
    expect(ids(applyMemberFilter(SET, at({ sort: "spent" }), ENV))[0]).toBe("6");
  });

  it("does not reorder the caller's array", () => {
    const before = ids(SET);
    applyMemberFilter(SET, at({ sort: "spent" }), ENV);
    expect(ids(SET)).toEqual(before);
  });
});

describe("the figures", () => {
  it("count what is on screen", () => {
    const shown = applyMemberFilter(SET, at({ standing: "trialing" }), ENV);
    expect(memberTotals(shown, ENV).shown).toBe(2);
    expect(memberTotals(SET, ENV).shown).toBe(7);
  });

  it("break the membership down by standing", () => {
    const t = memberTotals(SET, ENV);
    expect(t.paying).toBe(2);
    expect(t.trialing).toBe(2);
    expect(t.lapsed).toBe(2);
    expect(t.admins).toBe(2);
  });
});

describe("the counts on the chips", () => {
  it("say how many each would show", () => {
    const c = memberChipCounts(SET, DEFAULT_MEMBER_FILTER, ENV);
    expect(c.all).toBe(7);
    expect(c.paying).toBe(2);
    expect(c.trialing).toBe(2);
    expect(c.admins).toBe(2);
  });

  it("respect a search that is already on", () => {
    const c = memberChipCounts(SET, at({ q: "vikas" }), ENV);
    expect(c.all).toBe(3);
    expect(c.trialing).toBe(1);
  });

  it("are not changed by the standing already chosen", () => {
    // Otherwise every chip but the active one would read zero.
    const c = memberChipCounts(SET, at({ standing: "paying" }), ENV);
    expect(c.lapsed).toBe(2);
  });
});

describe("what the row says they hold", () => {
  it("names a live subscription", () => {
    expect(holdsLabel(member({ subscriptions: [sub("active")] }))).toBe("Content Engine");
  });

  it("still names one that ended", () => {
    // "cancelled — Content Engine" is more use than "cancelled".
    expect(holdsLabel(member({ subscriptions: [sub("canceled")] }))).toBe("Content Engine");
  });

  it("prefers what is live when there is both", () => {
    const m = member({ subscriptions: [sub("canceled"), sub("trialing", "Funnel App")] });
    expect(holdsLabel(m)).toBe("Funnel App");
  });

  it("falls back to courses", () => {
    expect(holdsLabel(member({ courses: 2 }))).toBe("2 courses");
  });

  it("says nothing when there is nothing", () => {
    expect(holdsLabel(member())).toBe("");
  });
});
