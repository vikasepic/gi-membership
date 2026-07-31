import { describe, it, expect, vi, afterEach } from "vitest";
import { removeTag } from "@/lib/activecampaign";

const BASE = "https://acct.api-us1.com";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function enable() {
  vi.stubEnv("ACTIVECAMPAIGN_API_URL", BASE);
  vi.stubEnv("ACTIVECAMPAIGN_API_TOKEN", "tok");
}

describe("removeTag", () => {
  // Deleting needs the ASSOCIATION id, not the tag id. Sending the tag id to
  // /contactTags/{id} would delete a different association entirely — the whole
  // reason this does a lookup first.
  it("looks up the association id and deletes that", async () => {
    enable();
    const spy = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/contacts/7/contactTags")) {
        return new Response(
          JSON.stringify({
            contactTags: [
              { id: "111", tag: "99" },
              { id: "222", tag: "42" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      expect(init.method).toBe("DELETE");
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", spy);

    expect(await removeTag("7", "42")).toBe(true);
    expect((spy.mock.calls[1] as unknown as [string])[0]).toBe(`${BASE}/api/3/contactTags/222`);
  });

  // Refunding twice, or refunding an order whose product carried no tag, is
  // normal — it must not read as a failure.
  it("treats a tag that isn't applied as success, and deletes nothing", async () => {
    enable();
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ contactTags: [{ id: "111", tag: "99" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", spy);
    expect(await removeTag("7", "42")).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1); // lookup only, no DELETE
  });

  it("never throws when the API is down", async () => {
    enable();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    await expect(removeTag("7", "42")).resolves.toBe(false);
  });
});
