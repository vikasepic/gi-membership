import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests (no database) for the Supabase-error handling in
 * lib/post-purchase-sequences.ts.
 *
 * supabase-js reports network/5xx failures as `{ error }`, not a thrown
 * exception. A fake, scripted query builder stands in for the real client so
 * these paths can be driven without a database: every chain method returns
 * the same builder, and awaiting it (directly, or via `.maybeSingle()` /
 * `.single()`) resolves `{ data, error }` from a per-table-and-operation
 * script, in the order each call happens.
 */

type Result = { data: unknown; error: { message: string } | null };
type Call = { table: string; op: string; filters: Record<string, unknown>; payload?: unknown };

const calls: Call[] = [];
const scripts = new Map<string, Result[]>();
const DEFAULT_RESULT: Result = { data: null, error: null };

function push(key: string, r: Result) {
  const arr = scripts.get(key) ?? [];
  arr.push(r);
  scripts.set(key, arr);
}

function nextResult(key: string): Result {
  const arr = scripts.get(key);
  if (arr && arr.length) return arr.shift() as Result;
  return DEFAULT_RESULT;
}

function makeBuilder(table: string) {
  let op = "select";
  let opSet = false;
  let payload: unknown;
  const filters: Record<string, unknown> = {};

  const setOp = (name: string, p?: unknown) => {
    if (!opSet) {
      op = name;
      opSet = true;
    }
    if (p !== undefined) payload = p;
  };

  function run(): Promise<Result> {
    calls.push({ table, op, filters: { ...filters }, payload });
    return Promise.resolve(nextResult(`${table}:${op}`));
  }

  const builder = {
    select: (..._a: unknown[]) => { setOp("select"); return builder; },
    update: (p: unknown) => { setOp("update", p); return builder; },
    upsert: (p: unknown, ..._a: unknown[]) => { setOp("upsert", p); return builder; },
    insert: (p: unknown) => { setOp("insert", p); return builder; },
    delete: () => { setOp("delete"); return builder; },
    eq: (col: string, val: unknown) => { filters[col] = val; return builder; },
    in: (col: string, val: unknown) => { filters[col] = val; return builder; },
    lte: (col: string, val: unknown) => { filters[col] = val; return builder; },
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => run(),
    single: () => run(),
    then: (resolve: (r: Result) => void, reject: (e: unknown) => void) => run().then(resolve, reject),
  };
  return builder;
}

const fakeDb = { from: (table: string) => makeBuilder(table) };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => fakeDb }));

const sendEmailMock = vi.fn(async (..._args: unknown[]): Promise<"sent" | "failed" | "disabled"> => "sent");
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));

const recordErrorMock = vi.fn(async () => {});
vi.mock("@/lib/errors", async (orig) => ({
  ...(await orig<typeof import("@/lib/errors")>()),
  recordError: (...a: Parameters<typeof recordErrorMock>) => recordErrorMock(...a),
}));

vi.mock("@/lib/settings", () => ({
  getSettingsOrDefaults: async () => ({
    postPurchaseEmail: { enabled: true, accessUrl: "https://grow.example.com/login", senderName: "Ajit", senderEmail: "ajit@example.com", replyTo: "" },
  }),
}));

vi.mock("@/lib/post-purchase-stop", () => ({ stopUrl: (id: string) => `https://grow.example.com/email/stop?t=${id}` }));

const { queueSequencesForOrder, sendDueSequenceEmails } = await import("@/lib/post-purchase-sequences");

beforeEach(() => {
  calls.length = 0;
  scripts.clear();
  sendEmailMock.mockClear();
  recordErrorMock.mockClear();
});

const CLAIMED_ROW = {
  id: "send-1",
  order_item_id: "item-1",
  sequence_id: "seq-1",
  email_id: "email-1",
  position: 1,
  to_email: "buyer@example.com",
  store_id: "store-1",
};

const ORDER_ITEM_ROW = {
  id: "item-1",
  description: "Thing",
  offer_id: "offer-1",
  product_id: null,
  post_purchase_stopped_at: null,
  orders: { status: "paid", user_id: "user-1", email: "buyer@example.com" },
};

const EMAIL_ROW = {
  id: "email-1",
  position: 1,
  subject: "Hi",
  preheader: "",
  doc: { type: "doc", content: [] },
  delay_amount: 2,
  delay_unit: "days",
};

/** Scripts the calls that happen before the mark-sent write, so a test only has to set the outcome of the step it cares about. */
function scriptUpToDelivery() {
  push("post_purchase_sends:select", { data: [{ id: "send-1" }], error: null }); // the due sweep
  push("post_purchase_sends:update", { data: CLAIMED_ROW, error: null }); // the claim
  push("order_items:select", { data: ORDER_ITEM_ROW, error: null });
  push("post_purchase_sequences:select", { data: { enabled: true, layout: {} }, error: null });
  push("ownership:select", { data: [{ id: "own-1" }], error: null }); // stillHolds
  push("post_purchase_sends:select", { data: [], error: null }); // sentEmailIds
  push("post_purchase_emails:select", { data: [EMAIL_ROW], error: null }); // emailsInOrder
  push("users:select", { data: { username: "Buyer Name" }, error: null }); // profile
}

describe("sendDueSequenceEmails error handling", () => {
  it("a failed mark-sent write does not lose or duplicate the send", async () => {
    scriptUpToDelivery();
    // The write that marks the row 'sent' fails.
    push("post_purchase_sends:update", { data: null, error: { message: "db unavailable" } });

    const out = await sendDueSequenceEmails({ now: new Date() });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    // queueNext must never run: no upsert to post_purchase_sends after the failed mark-sent write.
    expect(calls.some((c) => c.table === "post_purchase_sends" && c.op === "upsert")).toBe(false);
    expect(recordErrorMock).toHaveBeenCalled();
    // The email went out, so this must not be reported as a lost/failed send.
    expect(out.failed).toBe(0);
  });

  it("a read error before sending is retried, not skipped or sent", async () => {
    push("post_purchase_sends:select", { data: [{ id: "send-1" }], error: null }); // the due sweep
    push("post_purchase_sends:update", { data: CLAIMED_ROW, error: null }); // the claim
    push("order_items:select", { data: null, error: { message: "connection reset" } });

    const out = await sendDueSequenceEmails({ now: new Date() });

    expect(sendEmailMock).not.toHaveBeenCalled();
    // Put back to pending for the next sweep to retry.
    const updates = calls.filter((c) => c.table === "post_purchase_sends" && c.op === "update");
    expect(updates.some((c) => (c.payload as { status?: string })?.status === "pending")).toBe(true);
    expect(updates.some((c) => (c.payload as { status?: string })?.status === "skipped")).toBe(false);
    expect(updates.some((c) => (c.payload as { status?: string })?.status === "failed")).toBe(false);
    expect(recordErrorMock).toHaveBeenCalled();
    // Nothing sent, nothing skipped, nothing failed: it just goes around again.
    expect(out).toEqual({ sent: 0, skipped: 0, failed: 0 });
  });

  it("the provider refusing a send still marks it failed and ends the chain (unchanged behaviour)", async () => {
    scriptUpToDelivery();
    sendEmailMock.mockResolvedValueOnce("failed");

    const out = await sendDueSequenceEmails({ now: new Date() });

    expect(out.failed).toBe(1);
    const updates = calls.filter((c) => c.table === "post_purchase_sends" && c.op === "update");
    expect(updates.some((c) => (c.payload as { status?: string })?.status === "failed")).toBe(true);
    expect(recordErrorMock).toHaveBeenCalled();
  });
});

describe("queueSequencesForOrder error handling", () => {
  it("rejects when the orders read fails, instead of silently queueing nothing", async () => {
    push("orders:select", { data: null, error: { message: "connection reset" } });
    await expect(queueSequencesForOrder("order-1")).rejects.toThrow(/connection reset/);
  });
});
