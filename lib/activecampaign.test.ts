import { describe, it, expect, vi, afterEach } from "vitest";
import { tagContact, activeCampaignEnabled } from "@/lib/activecampaign";

// These calls sit after the card has been charged, so the tests care about two
// things: that the right requests go out, and that nothing here can ever throw.

const BASE = "https://acct.api-us1.com";
const TOKEN = "tok_test";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function enable() {
  vi.stubEnv("ACTIVECAMPAIGN_API_URL", BASE);
  vi.stubEnv("ACTIVECAMPAIGN_API_TOKEN", TOKEN);
}

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const spy = vi.fn(async (url: string, init: RequestInit) => handler(url, init));
  vi.stubGlobal("fetch", spy);
  return spy;
}

const okSync = () =>
  new Response(JSON.stringify({ contact: { id: 7 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("activeCampaign", () => {
  it("is disabled until both env vars are set", () => {
    vi.stubEnv("ACTIVECAMPAIGN_API_URL", BASE);
    vi.stubEnv("ACTIVECAMPAIGN_API_TOKEN", "");
    expect(activeCampaignEnabled()).toBe(false);
  });

  it("upserts the contact then applies each tag", async () => {
    enable();
    const spy = stubFetch((url) => (url.endsWith("/contact/sync") ? okSync() : new Response("{}", { status: 201 })));

    await tagContact({ email: "buyer@example.com", fullName: "Jane Cooper", tagIds: ["42", "9"] });

    expect(spy).toHaveBeenCalledTimes(3);
    const [syncUrl, syncInit] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(syncUrl).toBe(`${BASE}/api/3/contact/sync`);
    expect((syncInit.headers as Record<string, string>)["Api-Token"]).toBe(TOKEN);
    expect(JSON.parse(syncInit.body as string)).toEqual({
      contact: { email: "buyer@example.com", firstName: "Jane", lastName: "Cooper" },
    });

    const [tagUrl, tagInit] = spy.mock.calls[1] as unknown as [string, RequestInit];
    expect(tagUrl).toBe(`${BASE}/api/3/contactTags`);
    // AC's own examples send these as strings; the contact id comes back as a
    // number from sync, so this asserts it was stringified on the way out.
    expect(JSON.parse(tagInit.body as string)).toEqual({
      contactTag: { contact: "7", tag: "42" },
    });
  });

  // "Mary Anne van der Berg" must not lose everything after the second word.
  it("splits the name at the first space only", async () => {
    enable();
    const spy = stubFetch(() => okSync());
    await tagContact({ email: "a@b.com", fullName: "Mary Anne van der Berg", tagIds: [] });
    expect(JSON.parse((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      contact: { email: "a@b.com", firstName: "Mary", lastName: "Anne van der Berg" },
    });
  });

  it("sends no lastName for a single-word name", async () => {
    enable();
    const spy = stubFetch(() => okSync());
    await tagContact({ email: "a@b.com", fullName: "Prince", tagIds: [] });
    const body = JSON.parse((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.contact.firstName).toBe("Prince");
    expect(body.contact.lastName).toBeUndefined();
  });

  it("deduplicates tags and ignores blanks", async () => {
    enable();
    const spy = stubFetch((url) => (url.endsWith("/contact/sync") ? okSync() : new Response("{}", { status: 201 })));
    await tagContact({ email: "a@b.com", fullName: null, tagIds: ["5", "5", "", "  "] });
    expect(spy).toHaveBeenCalledTimes(2); // one sync, one tag
  });

  it("does nothing when not configured", async () => {
    vi.stubEnv("ACTIVECAMPAIGN_API_URL", "");
    vi.stubEnv("ACTIVECAMPAIGN_API_TOKEN", "");
    const spy = stubFetch(() => okSync());
    await tagContact({ email: "a@b.com", tagIds: ["1"] });
    expect(spy).not.toHaveBeenCalled();
  });

  // The point of the guards: a marketing outage must never fail a paid order.
  it("never throws when the API is down", async () => {
    enable();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    // Reports the failure instead of throwing — that flag is what makes the
    // caller queue a retry rather than silently drop the tag.
    await expect(tagContact({ email: "a@b.com", tagIds: ["1"] })).resolves.toEqual({ ok: false });
  });

  it("never throws on a rejected sync", async () => {
    enable();
    stubFetch(() => new Response("nope", { status: 403 }));
    await expect(tagContact({ email: "a@b.com", tagIds: ["1"] })).resolves.toEqual({ ok: false });
  });

  // A repeat buyer already carries the tag; AC answers 422 and that is fine.
  it("treats an already-applied tag as success", async () => {
    enable();
    const spy = stubFetch((url) =>
      url.endsWith("/contact/sync") ? okSync() : new Response("duplicate", { status: 422 }),
    );
    await expect(tagContact({ email: "a@b.com", tagIds: ["1"] })).resolves.toEqual({ ok: true });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
