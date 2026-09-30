/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const save = vi.hoisted(() => vi.fn(async (_input: unknown) => ({ ok: true, emailIds: ["e1"] })));
vi.mock("@/app/admin/post-purchase/actions", () => ({
  savePostPurchaseAction: save,
  sendPostPurchaseTestAction: vi.fn(async () => ({ ok: true, to: "me@x.co" })),
}));
// The TipTap canvas is tested on its own; here a stand-in keeps the section's own logic in view.
vi.mock("@/components/admin/email-editor", () => ({ EmailEditor: () => <div data-testid="editor" /> }));

import { PostPurchaseSection } from "@/components/admin/post-purchase-section";
import { LAYOUT_DEFAULTS } from "@/lib/post-purchase-layout";

let root: Root | null = null;
afterEach(() => {
  const r = root;
  root = null;
  if (r) act(() => r.unmount());
  save.mockClear();
});

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <PostPurchaseSection
        ownerType="offer"
        ownerId="11111111-1111-4111-8111-111111111111"
        ownerName="Funnel App"
        initial={{ id: null, enabled: false, layout: LAYOUT_DEFAULTS, emails: [] }}
        senderName="Store Sender"
        accessUrl="https://store.example.com/start"
      />,
    );
  });
  return host;
}
const click = (el: Element | null) => act(() => (el as HTMLElement).click());

describe("the post-purchase section", () => {
  it("is off by default and shows no editor", () => {
    const host = mount();
    expect((host.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    expect(host.querySelector('[data-testid="editor"]')).toBeNull();
  });

  it("turning it on starts email 1 from the starter, right after the welcome", () => {
    const host = mount();
    click(host.querySelector('input[type="checkbox"]'));
    expect(host.querySelector('[data-testid="editor"]')).not.toBeNull();
    expect(host.textContent).toContain("Right after the welcome email");
    expect((host.querySelector("#pp-subject") as HTMLInputElement).value).toBe("{{first_name}}, thank you for getting Funnel App");
  });

  it("adds a follow-up two days after the one before, and saves the whole sequence", async () => {
    const host = mount();
    click(host.querySelector('input[type="checkbox"]'));
    click([...host.querySelectorAll("button")].find((b) => b.textContent === "+ Add email")!);
    expect(host.textContent).toContain("2 days after email 1");
    await act(async () => click([...host.querySelectorAll("button")].find((b) => b.textContent === "Save")!));
    const payload = save.mock.calls[0][0] as { enabled: boolean; emails: { delayAmount: number; delayUnit: string }[] };
    expect(payload.enabled).toBe(true);
    expect(payload.emails.map((e) => [e.delayAmount, e.delayUnit])).toEqual([[0, "days"], [2, "days"]]);
  });

  it("shows the reason when a save is refused", async () => {
    save.mockResolvedValueOnce({ ok: false, error: "Email 2 needs a subject line." } as never);
    const host = mount();
    click(host.querySelector('input[type="checkbox"]'));
    await act(async () => click([...host.querySelectorAll("button")].find((b) => b.textContent === "Save")!));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Email 2 needs a subject line.");
  });

  it("the preview frame runs no script from the email", () => {
    const host = mount();
    click(host.querySelector('input[type="checkbox"]'));
    click([...host.querySelectorAll("button")].find((b) => b.textContent === "Preview as Priya")!);
    expect(host.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-popups allow-popups-to-escape-sandbox");
  });

  it("previews with the store's real sender and access link", () => {
    const host = mount();
    click(host.querySelector('input[type="checkbox"]'));
    expect(host.querySelector('[aria-label="Email layout"]')?.textContent).toContain("Store Sender");
    click([...host.querySelectorAll("button")].find((b) => b.textContent === "Preview as Priya")!);
    expect(host.querySelector("iframe")?.getAttribute("srcdoc")).toContain('href="https://store.example.com/start"');
  });

  it("keeps the draft and lets the owner try again when the server cannot be reached", async () => {
    save.mockRejectedValueOnce(new Error("Failed to fetch"));
    const host = mount();
    click(host.querySelector('input[type="checkbox"]'));
    const saveButton = [...host.querySelectorAll("button")].find((b) => b.textContent === "Save")!;
    await act(async () => click(saveButton));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Could not reach the server. Your changes are still here; try again.");
    expect(saveButton.disabled).toBe(false);
    expect((host.querySelector("#pp-subject") as HTMLInputElement).value).toBe("{{first_name}}, thank you for getting Funnel App");
  });
});

function mountStore() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <PostPurchaseSection ownerType="store" ownerId="22222222-2222-4222-8222-222222222222" ownerName="Funnel App"
        initial={{ id: null, enabled: false, layout: LAYOUT_DEFAULTS, emails: [] }} senderName="Ajit" accessUrl="https://grow.greaterinside.com/login" />,
    );
  });
  return host;
}

describe("the store series section", () => {
  it("names itself as the welcome email's follow-ups", () => {
    const host = mountStore();
    expect(host.querySelector("#pp-title")?.textContent).toContain("Follow-up emails");
    expect(host.textContent).toContain("Later purchases get only the welcome");
  });

  it("turning it on starts one follow-up 2 days after the welcome", () => {
    const host = mountStore();
    click(host.querySelector('input[type="checkbox"]'));
    expect(host.textContent).toContain("2 days after the welcome email");
  });

  it("saves email 1's own delay", async () => {
    const host = mountStore();
    click(host.querySelector('input[type="checkbox"]'));
    await act(async () => click([...host.querySelectorAll("button")].find((b) => b.textContent === "Save")!));
    const payload = save.mock.calls.at(-1)?.[0] as { ownerType: string; emails: { delayAmount: number }[] };
    expect(payload.ownerType).toBe("store");
    expect(payload.emails[0].delayAmount).toBe(2);
  });

  it("the only store email cannot be deleted, so the section never goes blank", () => {
    const host = mountStore();
    click(host.querySelector('input[type="checkbox"]'));
    const del = () => [...host.querySelectorAll("button")].some((b) => b.textContent === "Delete email");
    expect(del()).toBe(false);
    click([...host.querySelectorAll("button")].find((b) => b.textContent === "+ Add email")!);
    expect(del()).toBe(true);
  });

  it("sends its own reply-to address with the sequence", async () => {
    const host = mountStore();
    click(host.querySelector('input[type="checkbox"]'));
    const field = host.querySelector("#pp-reply-to") as HTMLInputElement;
    expect(field).not.toBeNull();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(field, "a@greaterinside.com");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => click([...host.querySelectorAll("button")].find((b) => b.textContent === "Save")!));
    expect((save.mock.calls.at(-1)?.[0] as { replyTo?: string }).replyTo).toBe("a@greaterinside.com");
  });

  it("saves a header image for the whole series", async () => {
    const host = mountStore();
    click(host.querySelector('input[type="checkbox"]'));
    const field = host.querySelector("#pp-header") as HTMLInputElement;
    expect(field).not.toBeNull();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(field, "https://x.co/header.png");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => click([...host.querySelectorAll("button")].find((b) => b.textContent === "Save")!));
    expect((save.mock.calls.at(-1)?.[0] as { layout: { headerImageUrl?: string } }).layout.headerImageUrl).toBe("https://x.co/header.png");
  });
});
