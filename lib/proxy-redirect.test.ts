import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { StoreRedirect } from "@/lib/redirects";

/**
 * Redirects run in the proxy, before the page renders, so a live page can be
 * redirected and the visitor gets a real 301/302.
 * Spec: docs/superpowers/specs/2026-11-17-redirect-manager-design.md.
 */

const state = vi.hoisted(() => ({ rules: [] as StoreRedirect[] }));
vi.mock("@/lib/redirect-cache", () => ({ cachedRedirectRules: async () => state.rules }));
const getUser = vi.hoisted(() => vi.fn(async () => ({ data: { user: null } })));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser } }) }));

const { proxy } = await import("@/proxy");

const rule = (o: Partial<StoreRedirect>): StoreRedirect => ({
  name: "", from: "", to: "", match: "exact", permanent: true, query: "keep", enabled: true, ...o,
});
const hit = (path: string, method = "GET") => proxy(new NextRequest(`https://grow.greaterinside.com${path}`, { method }));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  state.rules = [];
  getUser.mockClear();
});

describe("redirects in the proxy", () => {
  it("redirects a live address with the rule's status and a relative Location for a same-site destination", async () => {
    state.rules = [rule({ from: "/o/x", to: "/p/y" })];
    const res = await hit("/o/x");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/p/y");
  });

  it("sends an external destination as it is, with the visitor's query", async () => {
    state.rules = [rule({ from: "/o/foundation-weekend", to: "https://greaterinside.com", permanent: false })];
    const res = await hit("/o/foundation-weekend?utm_source=meta");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://greaterinside.com/?utm_source=meta");
  });

  it("sets the anon and campaign cookies on the redirect, so the sale is still credited", async () => {
    state.rules = [rule({ from: "/o/x", to: "https://greaterinside.com" })];
    const res = await hit("/o/x?utm_source=meta&utm_campaign=fw");
    expect(res.status).toBe(301);
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain("gi_anon=");
    expect(cookies).toContain("gi_utm=");
  });

  it.each(["/admin", "/checkout", "/account", "/library", "/api/webhooks/stripe"])("lets %s through under a catch-all rule", async (p) => {
    state.rules = [rule({ match: "pattern", from: "^/(.*)$", to: "https://greaterinside.com" })];
    const res = await hit(p);
    // /admin still meets its own sign-in redirect; it must never meet the rule.
    expect(res.headers.get("location") ?? "").not.toMatch(/^https:\/\/greaterinside\.com/);
  });

  it("never redirects a preview or a POST", async () => {
    state.rules = [rule({ from: "/o/x", to: "/p/y" })];
    expect((await hit("/o/x?preview=1")).status).toBe(200);
    expect((await hit("/o/x", "POST")).status).toBe(200);
  });

  it("loads the page normally with no rules", async () => {
    expect((await hit("/o/x")).status).toBe(200);
  });

  it("asks nothing of Supabase before redirecting", async () => {
    state.rules = [rule({ from: "/o/x", to: "/p/y" })];
    await hit("/o/x");
    expect(getUser).not.toHaveBeenCalled();
  });
});
