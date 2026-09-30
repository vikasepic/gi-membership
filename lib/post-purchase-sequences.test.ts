import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests (no database) for the Supabase-error handling in
 * lib/post-purchase-sequences.ts. A scripted fake query builder stands in for
 * the client: every chain method returns the builder, and awaiting it (or
 * `.maybeSingle()` / `.single()`) resolves `{ data, error }` from a script
 * keyed by "table:operation", in call order.
 */

type Result = { data: unknown; error: { message: string } | null };
type Call = { table: string; op: string; filters: Record<string, unknown>; payload?: unknown };

const calls: Call[] = [];
const scripts = new Map<string, Result[]>();
const push = (key: string, r: Result) => scripts.set(key, [...(scripts.get(key) ?? []), r]);
const nextResult = (key: string): Result => scripts.get(key)?.shift() ?? { data: null, error: null };

function makeBuilder(table: string) {
  let op = "select";
  let opSet = false;
  let payload: unknown;
  const filters: Record<string, unknown> = {};
  const setOp = (name: string, p?: unknown) => {
    if (!opSet) { op = name; opSet = true; }
    if (p !== undefined) payload = p;
  };
  const run = (): Promise<Result> => {
    calls.push({ table, op, filters: { ...filters }, payload });
    return Promise.resolve(nextResult(`${table}:${op}`));
  };
  const filter = (col: string, val: unknown) => { filters[col] = val; return builder; };
  const builder = {
    select: () => { setOp("select"); return builder; },
    update: (p: unknown) => { setOp("update", p); return builder; },
    upsert: (p: unknown) => { setOp("upsert", p); return builder; },
    insert: (p: unknown) => { setOp("insert", p); return builder; },
    delete: () => { setOp("delete"); return builder; },
    eq: filter, in: filter, is: filter, gt: filter, gte: filter, lte: filter, ilike: filter,
    not: (col: string, _op: string, val: unknown) => filter(col, val),
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => run(),
    single: () => run(),
    then: (resolve: (r: Result) => void, reject: (e: unknown) => void) => run().then(resolve, reject),
  };
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ from: (t: string) => makeBuilder(t) }) }));
const sendEmailMock = vi.fn(async (..._a: unknown[]): Promise<"sent" | "failed" | "disabled"> => "sent");
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));
const recordErrorMock = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/errors", async (orig) => ({
  ...(await orig<typeof import("@/lib/errors")>()),
  recordError: (...a: unknown[]) => recordErrorMock(...a),
}));
vi.mock("@/lib/settings", () => ({
  getSettingsOrDefaults: async () => ({
    postPurchaseEmail: { enabled: true, accessUrl: "https://grow.example.com/login", senderName: "Ajit", senderEmail: "ajit@example.com", replyTo: "" },
  }),
}));
vi.mock("@/lib/post-purchase-stop", () => ({ stopUrl: (id: string) => `https://grow.example.com/email/stop?t=${id}` }));

const { startFlowsForOrder, sendDueSequenceEmails } = await import("@/lib/post-purchase-sequences");

const NOW = new Date("2026-10-01T10:00:00Z");
const CLAIMED = { id: "send-1", flow_id: "flow-1", run: 1, sequence_id: "seq-1", email_id: "email-1", position: 1, to_email: "buyer@example.com", store_id: "store-1" };
const FLOW = { id: "flow-1", store_id: "store-1", sequence_id: "seq-1", email: "buyer@example.com", status: "running", run: 1, order_id: "order-1" };
const SEQ = { id: "seq-1", enabled: true, layout: {}, owner_type: "offer", owner_id: "offer-1" };
const ORDER = { id: "order-1", status: "paid", user_id: "user-1", email: "buyer@example.com" };
const EMAIL = (id: string, position: number) => ({ id, position, subject: `Subject ${position}`, preheader: "", doc: { type: "doc", content: [] }, delay_amount: 2, delay_unit: "days" });

/** Everything a clean send of email 1 reads, in order, up to the send itself. */
function scriptUpToSend() {
  push("post_purchase_sends:select", { data: [{ id: "send-1" }], error: null }); // the due list
  push("post_purchase_sends:update", { data: CLAIMED, error: null }); // the claim
  push("post_purchase_flows:select", { data: FLOW, error: null });
  push("post_purchase_sequences:select", { data: SEQ, error: null });
  push("orders:select", { data: ORDER, error: null });
  push("ownership:select", { data: [{ id: "own-1" }], error: null });
  push("post_purchase_sends:select", { data: [], error: null }); // sentEmailIds
  push("post_purchase_emails:select", { data: [EMAIL("email-1", 1), EMAIL("email-2", 2)], error: null }); // emailToSend
  push("users:select", { data: { username: "Priya Shah" }, error: null });
  push("offers:select", { data: { name: "Funnel App" }, error: null });
}

beforeEach(() => {
  calls.length = 0;
  scripts.clear();
  sendEmailMock.mockReset();
  sendEmailMock.mockImplementation(async () => "sent");
  recordErrorMock.mockClear();
});

describe("database errors while sending", () => {
  it("a failed mark-sent write never queues the next email or re-sends this one", async () => {
    scriptUpToSend();
    push("post_purchase_sends:update", { data: null, error: { message: "mark-sent failed" } });
    push("post_purchase_emails:select", { data: [EMAIL("email-1", 1), EMAIL("email-2", 2)], error: null }); // queueNext would find email 2
    const out = await sendDueSequenceEmails({ now: NOW });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const afterSend = calls.slice(calls.findIndex((c) => c.table === "users"));
    expect(afterSend.some((c) => c.table === "post_purchase_sends" && c.op === "upsert")).toBe(false);
    expect(afterSend.some((c) => c.table === "post_purchase_sends" && (c.payload as { status?: string })?.status === "pending")).toBe(false);
    expect(recordErrorMock.mock.calls.some((a) => String((a[0] as { message: string }).message).includes("email sent but the chain could not continue"))).toBe(true);
    expect(out.sent).toBe(1);
  });

  it("a read error before sending puts the email back half an hour later and records it", async () => {
    push("post_purchase_sends:select", { data: [{ id: "send-1" }], error: null });
    push("post_purchase_sends:update", { data: CLAIMED, error: null });
    push("post_purchase_flows:select", { data: null, error: { message: "flows read failed" } });
    await sendDueSequenceEmails({ now: NOW });
    expect(sendEmailMock).not.toHaveBeenCalled();
    const revert = calls.find((c) => c.table === "post_purchase_sends" && (c.payload as { status?: string })?.status === "pending");
    expect(new Date((revert!.payload as { due_at: string }).due_at).getTime()).toBe(NOW.getTime() + 30 * 60_000);
    expect(calls.some((c) => (c.payload as { status?: string })?.status === "skipped")).toBe(false);
    expect(recordErrorMock).toHaveBeenCalled();
  });

  it("email sending not configured is retried later, not skipped", async () => {
    scriptUpToSend();
    sendEmailMock.mockImplementation(async () => "disabled");
    await sendDueSequenceEmails({ now: NOW });
    const revert = calls.find((c) => c.table === "post_purchase_sends" && (c.payload as { status?: string })?.status === "pending");
    expect(new Date((revert!.payload as { due_at: string }).due_at).getTime()).toBe(NOW.getTime() + 30 * 60_000);
    expect(calls.some((c) => (c.payload as { status?: string })?.status === "skipped")).toBe(false);
    expect(recordErrorMock.mock.calls.some((a) => String((a[0] as { message: string }).message).includes("not configured"))).toBe(true);
  });
});

describe("database errors while starting flows", () => {
  it("a failed order read rejects rather than reading as nothing to do", async () => {
    push("orders:select", { data: null, error: { message: "orders read failed" } });
    await expect(startFlowsForOrder("order-1", NOW)).rejects.toThrow(/startFlowsForOrder: orders/);
  });
});
