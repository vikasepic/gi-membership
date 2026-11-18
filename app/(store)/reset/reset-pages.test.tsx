// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Resetting a password, for someone whose mail opens links in another browser.
 *
 * The reset email used to be GoTrue's own, with the link that only finishes
 * in the browser that asked for it. Opened anywhere else it left the person
 * on "Choose a new password" with no session, and saving said "Auth session
 * missing!" (a member's report, 17 Nov 2026). The reset now sends the store's
 * own sign-in link, which any browser can open, and lands on the new-password
 * page signed in.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  otp: [] as { email: string; options: { emailRedirectTo?: string; shouldCreateUser?: boolean } }[],
  recovery: 0,
  updateError: null as { message: string } | null,
  pushed: [] as string[],
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: async (a: (typeof auth.otp)[number]) => (auth.otp.push(a), { error: null }),
      resetPasswordForEmail: async () => (auth.recovery++, { error: null }),
      updateUser: async () => ({ error: auth.updateError }),
    },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (to: string) => auth.pushed.push(to), refresh: () => {} }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function mount(el: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(el));
  return host;
}
async function fill(h: HTMLElement, selector: string, value: string) {
  const el = h.querySelector(selector) as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const submit = (h: HTMLElement) =>
  act(async () => {
    h.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

beforeEach(() => {
  auth.otp = [];
  auth.recovery = 0;
  auth.updateError = null;
  auth.pushed = [];
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("asking for a password reset", () => {
  it("sends the store's own sign-in link, pointed at the new-password page", async () => {
    const { default: Page } = await import("@/app/(store)/reset/page");
    const h = await mount(<Page />);
    await fill(h, 'input[type="email"]', "buyer@example.test");
    await submit(h);
    expect(auth.otp).toHaveLength(1);
    expect(auth.otp[0].email).toBe("buyer@example.test");
    const back = new URL(auth.otp[0].options.emailRedirectTo!);
    expect(back.pathname).toBe("/auth/callback");
    expect(back.searchParams.get("next")).toBe("/reset/update");
    // Asking to reset must never mint an account for a mistyped address.
    expect(auth.otp[0].options.shouldCreateUser).toBe(false);
    // Not GoTrue's recovery email: its link only finishes in the browser that asked.
    expect(auth.recovery).toBe(0);
    expect(h.textContent).toContain("on its way");
  });
});

describe("choosing the new password", () => {
  const save = async () => {
    const { default: Page } = await import("@/app/(store)/reset/update/page");
    const h = await mount(<Page />);
    await fill(h, 'input[type="password"]', "a-new-password");
    await submit(h);
    return h;
  };

  it("goes to the library once it is saved", async () => {
    await save();
    expect(auth.pushed).toEqual(["/library"]);
  });

  it("with no session, says what to do instead of 'Auth session missing!'", async () => {
    auth.updateError = { message: "Auth session missing!" };
    const h = await save();
    expect(h.textContent).not.toContain("Auth session missing");
    expect(h.textContent).toContain("This page needs the link from your email");
    expect(h.querySelector('a[href="/reset"]')).not.toBeNull();
    expect(auth.pushed).toEqual([]);
  });

  it("still shows any other reason as it is", async () => {
    auth.updateError = { message: "New password should be different from the old password." };
    const h = await save();
    expect(h.textContent).toContain("New password should be different from the old password.");
  });
});
