import { describe, it, expect, vi } from "vitest";

/**
 * Where a magic link lands. The destination rides on the link as `next`, and
 * it has to survive a failed attempt too: a link opened in another browser,
 * or an expired one, bounces back to log in, and the second link asked for
 * from there should still bring the person to the page they were sent.
 */

const auth = vi.hoisted(() => ({ error: null as { message: string } | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: auth.error }),
      verifyOtp: async () => ({ error: auth.error }),
    },
  }),
}));

const { GET } = await import("@/app/auth/callback/route");
const land = async (query: string) => (await GET(new Request(`https://x.test/auth/callback${query}`))).headers.get("location");
const NEXT = "next=%2Flibrary%2Fbook-to-bestseller";

describe("the magic link callback", () => {
  it("lands on the page the link was asked for from", async () => {
    auth.error = null;
    expect(await land(`?code=abc&${NEXT}`)).toBe("/library/book-to-bestseller");
  });

  it("falls back to the library, and never leaves the site", async () => {
    auth.error = null;
    expect(await land("?code=abc")).toBe("/library");
    expect(await land("?code=abc&next=%2F%2Fevil.example")).toBe("/library");
    expect(await land("?code=abc&next=https%3A%2F%2Fevil.example")).toBe("/library");
  });

  it("keeps where to go when it bounces back with an error", async () => {
    auth.error = { message: "invalid request: both auth code and code verifier should be non-empty" };
    expect(await land(`?code=abc&${NEXT}`)).toBe(`/login?error=wrong_device&${NEXT}`);
    expect(await land(`?error_code=otp_expired&${NEXT}`)).toBe(`/login?error=link_expired&${NEXT}`);
    expect(await land(`?${NEXT}`)).toBe(`/login?error=missing_link&${NEXT}`);
  });

  describe("a link verified on the server (token_hash), which any browser can open", () => {
    // What GoTrue was given as the address to come back to: this callback, with `next` on it.
    const cameFrom = (next: string) => encodeURIComponent(`https://x.test/auth/callback?next=${encodeURIComponent(next)}`);

    it("lands where the link was asked for from, read off the address GoTrue was given", async () => {
      auth.error = null;
      expect(await land(`?token_hash=h&type=magiclink&redirect_to=${cameFrom("/library/book-to-bestseller")}`)).toBe("/library/book-to-bestseller");
    });

    it("reads it the same when the address was pasted from the email by hand", async () => {
      // Written out in the email the inner address is not encoded a second
      // time (checked against the local auth server, 18 Nov 2026).
      auth.error = null;
      expect(await land("?token_hash=h&type=magiclink&redirect_to=https://x.test/auth/callback?next=%2Flibrary%2Fbook-to-bestseller")).toBe("/library/book-to-bestseller");
    });

    it("falls back to the library when that address says nothing, or is not an address", async () => {
      auth.error = null;
      expect(await land(`?token_hash=h&type=magiclink&redirect_to=${encodeURIComponent("https://x.test/auth/callback")}`)).toBe("/library");
      expect(await land("?token_hash=h&type=magiclink&redirect_to=not-a-url")).toBe("/library");
      expect(await land("?token_hash=h&type=magiclink")).toBe("/library");
    });

    it("never leaves the site, whatever that address says", async () => {
      auth.error = null;
      expect(await land(`?token_hash=h&type=magiclink&redirect_to=${cameFrom("//evil.example")}`)).toBe("/library");
      expect(await land(`?token_hash=h&type=magiclink&redirect_to=${cameFrom("https://evil.example/x")}`)).toBe("/library");
      // Only its `next` is read. The address itself is never gone to.
      expect(await land(`?token_hash=h&type=magiclink&redirect_to=${encodeURIComponent("https://evil.example/auth/callback?next=/library/x")}`)).toBe("/library/x");
    });

    it("prefers a `next` of its own", async () => {
      auth.error = null;
      expect(await land(`?token_hash=h&type=magiclink&next=%2Freset%2Fupdate&redirect_to=${cameFrom("/library")}`)).toBe("/reset/update");
    });

    it("keeps where to go when the link has been used already", async () => {
      auth.error = { message: "Email link is invalid or has expired" };
      expect(await land(`?token_hash=h&type=magiclink&redirect_to=${cameFrom("/library/book-to-bestseller")}`)).toBe(`/login?error=link_expired&${NEXT}`);
    });
  });

  it("adds nothing to an error bounce when there is nowhere to go back to", async () => {
    auth.error = null;
    expect(await land("?error_code=otp_expired")).toBe("/login?error=link_expired");
    expect(await land("?error_code=otp_expired&next=%2F%2Fevil.example")).toBe("/login?error=link_expired");
  });
});
