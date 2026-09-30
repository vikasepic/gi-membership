import { it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const guard = vi.hoisted(() => ({ admin: false }));
vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: async () => {
    if (!guard.admin) throw new Error("NEXT_REDIRECT /login");
    return { id: "u", email: "admin@example.com" };
  },
}));
const save = vi.hoisted(() => vi.fn(async () => ({ ok: true, emailIds: [] })));
vi.mock("@/lib/post-purchase-store", async (orig) => ({ ...(await orig<typeof import("@/lib/post-purchase-store")>()), saveSequence: save }));
const send = vi.hoisted(() => vi.fn(async () => "sent"));
vi.mock("@/lib/email", () => ({ sendEmail: send }));
vi.mock("@/lib/settings", () => ({
  getSettingsOrDefaults: async () => ({ postPurchaseEmail: { accessUrl: "https://x.co/login", senderName: "", senderEmail: "s@x.co", replyTo: "" } }),
}));

const { savePostPurchaseAction, sendPostPurchaseTestAction } = await import("@/app/admin/post-purchase/actions");
beforeEach(() => {
  guard.admin = false;
  save.mockClear();
  send.mockClear();
});

it.each([
  ["save", () => savePostPurchaseAction({})],
  ["send a test", () => sendPostPurchaseTestAction({})],
])("someone who is not an admin cannot %s", async (_, call) => {
  await expect(call()).rejects.toThrow(/NEXT_REDIRECT/);
  expect(save).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("refuses a malformed sequence before it reaches the database", async () => {
  guard.admin = true;
  const res = await savePostPurchaseAction({ ownerType: "course", ownerId: "x", enabled: true, layout: {}, emails: [] });
  expect(res.ok).toBe(false);
  expect(save).not.toHaveBeenCalled();
});

vi.mock("@/lib/store", () => ({ getStoreId: async () => "22222222-2222-4222-8222-222222222222" }));

it("saves the store series under this store, whatever id the page sent, and refreshes Settings", async () => {
  const { revalidatePath } = await import("next/cache");
  const { LAYOUT_DEFAULTS } = await import("@/lib/post-purchase-layout");
  guard.admin = true;
  const res = await savePostPurchaseAction({
    ownerType: "store", ownerId: "11111111-1111-4111-8111-111111111111", enabled: false, layout: LAYOUT_DEFAULTS, emails: [],
  });
  expect(res.ok).toBe(true);
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ ownerType: "store", ownerId: "22222222-2222-4222-8222-222222222222" }));
  expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/admin/settings");
});
