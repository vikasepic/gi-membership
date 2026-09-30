import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A scripted stand-in for the Supabase client, as in
 * lib/post-purchase-sequences.test.ts: every chain method returns the same
 * builder, and awaiting it resolves `{ data, error }` from the script for
 * that table and operation, recording the call.
 */
type Result = { data: unknown; error: { message: string } | null };
const calls: { table: string; op: string }[] = [];
const script = new Map<string, Result>();
function builder(table: string) {
  let op = "";
  const run = () => {
    calls.push({ table, op });
    return Promise.resolve(script.get(`${table}:${op}`) ?? { data: null, error: null });
  };
  const b: Record<string, unknown> = {
    maybeSingle: run,
    single: run,
    then: (res: (r: Result) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
  };
  for (const m of ["eq", "not", "order", "limit"]) b[m] = () => b;
  for (const m of ["select", "upsert", "delete"]) b[m] = () => { op ||= m; return b; };
  return b;
}
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ from: builder }) }));
vi.mock("@/lib/store", () => ({ getStoreId: async () => "s" }));
const { saveProblem, saveSequence, getSequence } = await import("@/lib/post-purchase-store");
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

describe("a failed read never passes for an empty sequence", () => {
  beforeEach(() => {
    calls.length = 0;
    script.clear();
  });

  it("a save whose email-id read fails changes nothing, so no buyer's email ids are replaced", async () => {
    script.set("post_purchase_sequences:upsert", { data: { id: "seq-1" }, error: null });
    script.set("post_purchase_emails:select", { data: null, error: { message: "connection reset" } });
    const res = await saveSequence(input({ emails: [email({ id: crypto.randomUUID() })] }));
    expect(res).toEqual({ ok: false, error: "Could not save: connection reset" });
    expect(calls.filter((c) => c.table === "post_purchase_emails").map((c) => c.op)).toEqual(["select"]);
  });

  it("loading the sequence rejects when either read fails, rather than showing it off and empty", async () => {
    script.set("post_purchase_sequences:select", { data: { id: "seq-1", enabled: true, layout: {} }, error: null });
    script.set("post_purchase_emails:select", { data: null, error: { message: "connection reset" } });
    await expect(getSequence("offer", crypto.randomUUID())).rejects.toThrow(/connection reset/);
    script.set("post_purchase_sequences:select", { data: null, error: { message: "timeout" } });
    await expect(getSequence("offer", crypto.randomUUID())).rejects.toThrow(/timeout/);
  });
});

describe("the store series", () => {
  const store = (over: Partial<SaveInput> = {}) => input({ ownerType: "store", ...over });

  it("needs a delay on email 1 too, because the welcome goes first", () => {
    expect(saveProblem(store({ emails: [email({ delayAmount: 0, delayUnit: "hours" })] }))).toMatch(/Email 1 needs a delay of at least 1 hour/);
    expect(saveProblem(store({ emails: [email({ delayAmount: 2 })] }))).toBeNull();
  });
});
