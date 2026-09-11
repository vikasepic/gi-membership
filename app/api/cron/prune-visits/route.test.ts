import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * The gate is copied verbatim from app/api/cron/retry/route.ts, so what
 * needs pinning here is that the copy still refuses what it must refuse, and
 * that the delete itself is scoped to the retention window rather than
 * everything in the table.
 */

const ORIGINAL_SECRET = process.env.CRON_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
  vi.doUnmock("@/lib/supabase/server");
  vi.resetModules();
});

async function post(headers: Record<string, string> = {}) {
  const { POST } = await import("@/app/api/cron/prune-visits/route");
  return POST(new Request("http://localhost/api/cron/prune-visits", { method: "POST", headers }));
}

describe("the shared-secret gate", () => {
  it("refuses to run when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    vi.resetModules();
    const res = await post();
    expect(res.status).toBe(503);
  });

  it("refuses a request with the wrong bearer", async () => {
    process.env.CRON_SECRET = "s3cret";
    vi.resetModules();
    const res = await post({ authorization: "Bearer wrong" });
    expect(res.status).toBe(401);
  });

  it("refuses a request with no bearer at all", async () => {
    process.env.CRON_SECRET = "s3cret";
    vi.resetModules();
    const res = await post();
    expect(res.status).toBe(401);
  });
});

describe("the prune", () => {
  it("deletes only visits past the retention window and reports how many", async () => {
    process.env.CRON_SECRET = "s3cret";
    vi.resetModules();
    let queriedColumn = "";
    let cutoffArg = "";
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => ({
        from: (table: string) => {
          expect(table).toBe("visits");
          return {
            delete: () => ({
              lt: (col: string, cutoff: string) => {
                queriedColumn = col;
                cutoffArg = cutoff;
                return { select: async () => ({ data: [{ id: "a" }, { id: "b" }, { id: "c" }], error: null }) };
              },
            }),
          };
        },
      }),
    }));

    const res = await post({ authorization: "Bearer s3cret" });
    const body = await res.json();

    expect(body).toEqual({ ok: true, deleted: 3 });
    expect(queriedColumn).toBe("started_at");
    // ~400 days back — not "just now" and not an off-by-a-factor typo.
    const daysBack = (Date.now() - Date.parse(cutoffArg)) / 86_400_000;
    expect(daysBack).toBeGreaterThan(399);
    expect(daysBack).toBeLessThan(401);
  });

  it("reports failure without crashing the route when the delete errors", async () => {
    process.env.CRON_SECRET = "s3cret";
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => ({
        from: () => ({
          delete: () => ({
            lt: () => ({ select: async () => ({ data: null, error: new Error("db unreachable") }) }),
          }),
        }),
      }),
    }));

    const res = await post({ authorization: "Bearer s3cret" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});
