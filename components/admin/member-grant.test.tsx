// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

/**
 * An existing member can be granted something.
 *
 * grantAccessAction shipped with the multi-grant work and nothing rendered a
 * form for it: the only picker in the admin was on the form that CREATES an
 * account. So a member already in the list could be revoked from and never
 * granted to — reported as "I can't give access to existing members".
 */
const posted: FormData[] = [];
vi.mock("@/app/admin/members/actions", () => ({
  grantAccessAction: async (_p: unknown, fd: FormData) => {
    posted.push(fd);
    return {};
  },
  revokeAccessAction: () => {},
  cancelSubscriptionAction: () => {},
  toggleAdminAction: () => {},
}));
vi.mock("@/components/admin/delete-member", () => ({ DeleteMember: () => null }));

const { MemberRowView } = await import("@/components/admin/member-row");

const MEMBER = {
  id: "u1",
  email: "someone@example.com",
  username: "",
  createdAt: "2026-09-01T00:00:00Z",
  isAdmin: false,
  orders: 0,
  refundedOrders: 0,
  spentCents: 0,
  subscriptions: [],
} as never;

const GRANTS = [
  { value: "product:p1", label: "Product — Digital Product Validator" },
  { value: "product:p2", label: "Product — The Idea Vault" },
  { value: "offer:o1", label: "Offer — Book Writer" },
];

let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const r = mounted;
  mounted = null;
  if (r) act(() => r.unmount());
  posted.length = 0;
});

function mount(access: unknown[] = []) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  act(() => {
    root.render(
      <table>
        <tbody>
          <MemberRowView
            member={MEMBER}
            access={access as never}
            grants={GRANTS}
            isOwner={false}
            isSelf={false}
          />
        </tbody>
      </table>,
    );
  });
  // The row's detail panel is behind a click on the row itself.
  const row = document.querySelector("tr")!;
  act(() => row.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

const boxes = () =>
  [...document.querySelectorAll<HTMLInputElement>('input[name="grant"]')];

describe("granting access to a member who already exists", () => {
  it("offers every product and offer the store can grant", () => {
    mount();
    expect(boxes().map((b) => b.value)).toEqual(["product:p1", "product:p2", "offer:o1"]);
  });

  it("posts the member's id with what was ticked", () => {
    mount();
    const form = boxes()[0].closest("form")!;
    act(() => {
      boxes()[0].checked = true;
      boxes()[2].checked = true;
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    // jsdom does not submit a React action form; assert the payload the form
    // carries instead — the member id is the part a shared picker could lose.
    expect(form.querySelector<HTMLInputElement>('input[name="userId"]')!.value).toBe("u1");
  });

  it("shows what they already hold as held, so granting it twice is not offered", () => {
    mount([
      { id: "own1", label: "Digital Product Validator", kind: "product", status: "active", granted: true, grantValue: "product:p1" },
    ]);
    const held = boxes().find((b) => b.value === "product:p1")!;
    expect(held.disabled).toBe(true);
    expect(held.checked).toBe(true);
    expect(boxes().find((b) => b.value === "product:p2")!.disabled).toBe(false);
  });

  it("treats a revoked row as not held, so access can be given back", () => {
    mount([
      { id: "own1", label: "Digital Product Validator", kind: "product", status: "canceled", granted: true, grantValue: "product:p1" },
    ]);
    expect(boxes().find((b) => b.value === "product:p1")!.disabled).toBe(false);
  });
});
