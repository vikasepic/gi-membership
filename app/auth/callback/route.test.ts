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

  it("adds nothing to an error bounce when there is nowhere to go back to", async () => {
    auth.error = null;
    expect(await land("?error_code=otp_expired")).toBe("/login?error=link_expired");
    expect(await land("?error_code=otp_expired&next=%2F%2Fevil.example")).toBe("/login?error=link_expired");
  });
});
