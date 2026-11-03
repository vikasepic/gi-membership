import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A course link shared with someone who is signed out.
 *
 * They are sent to log in, ask for a magic link, click it, and must land on
 * the course they were sent, not the library. Until 3 Nov 2026 both pages
 * redirected to a bare /login, so the login page had no `next` to put on the
 * link and the callback fell back to /library.
 */

class Redirected extends Error {
  constructor(public readonly to: string) {
    super(`redirect:${to}`);
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock("next/navigation", () => ({
    redirect: (to: string) => {
      throw new Redirected(to);
    },
  }));
  vi.doMock("@/lib/view-as", () => ({ viewer: async () => null }));
});

const whereTo = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (e) {
    if (e instanceof Redirected) return e.to;
    throw e;
  }
  throw new Error("did not redirect");
};

describe("a signed-out visitor on a shared course link", () => {
  it("is sent to log in with the course as where to come back to", async () => {
    const { default: CoursePage } = await import("@/app/(store)/library/[slug]/page");
    const to = await whereTo(() => CoursePage({ params: Promise.resolve({ slug: "book-to-bestseller" }) }));
    expect(to).toBe("/login?next=%2Flibrary%2Fbook-to-bestseller");
  });

  it("is sent to log in with the lesson as where to come back to", async () => {
    const { default: ItemPage } = await import("@/app/(store)/library/[slug]/[itemId]/page");
    const to = await whereTo(() =>
      ItemPage({ params: Promise.resolve({ slug: "book-to-bestseller", itemId: "4b1c9d2e" }) }),
    );
    expect(to).toBe("/login?next=%2Flibrary%2Fbook-to-bestseller%2F4b1c9d2e");
  });
});
