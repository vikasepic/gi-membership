import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/store", () => ({ getStoreId: async () => "s" }));
const { saveProblem } = await import("@/lib/post-purchase-store");
import type { SaveInput } from "@/lib/post-purchase-store";
import { LAYOUT_DEFAULTS, starterDoc, type DocNode } from "@/lib/post-purchase-layout";

type EmailIn = SaveInput["emails"][number];
const email = (over: Partial<EmailIn> = {}): EmailIn => ({ id: null, delayAmount: 2, delayUnit: "days", subject: "Hi", preheader: "", doc: starterDoc("X"), ...over });
const input = (over: Partial<SaveInput> = {}): SaveInput => ({ ownerType: "offer", ownerId: crypto.randomUUID(), enabled: true, layout: LAYOUT_DEFAULTS, emails: [email()], ...over });

describe("what stops a save", () => {
  it("nothing, for a normal sequence", () => {
    expect(saveProblem(input())).toBeNull();
  });

  it("turning it on with no emails", () => {
    expect(saveProblem(input({ emails: [] }))).toMatch(/at least one email/);
  });

  it("an email with no subject, once it is on", () => {
    expect(saveProblem(input({ emails: [email({ subject: "" })] }))).toMatch(/Email 1 needs a subject/);
    expect(saveProblem(input({ enabled: false, emails: [email({ subject: "" })] }))).toBeNull();
  });

  it("a follow-up with no delay", () => {
    expect(saveProblem(input({ emails: [email(), email({ delayAmount: 0, delayUnit: "hours" })] }))).toMatch(/Email 2 needs a delay of at least 1 hour/);
  });

  it("a pasted image or an http link, naming the email", () => {
    const pasted: DocNode = { type: "doc", content: [{ type: "image", attrs: { src: "data:image/png;base64,AAAA" } }] };
    expect(saveProblem(input({ emails: [email(), email({ doc: pasted })] }))).toMatch(/Email 2: an image was pasted in/);
    const http: DocNode = { type: "doc", content: [{ type: "emailButton", attrs: { href: "http://x.co" } }] };
    expect(saveProblem(input({ emails: [email({ doc: http })] }))).toMatch(/Email 1: http:\/\/x\.co must start with https/);
  });
});
