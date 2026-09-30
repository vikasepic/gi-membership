import { describe, it, expect, vi, afterEach } from "vitest";
import { sendEmail } from "@/lib/email";

const mail = { subject: "s", html: "<p>h</p>", text: "t" };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendEmail's answer", () => {
  it("is 'disabled' when no provider is configured, and nothing is sent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await sendEmail("a@b.co", mail)).toBe("disabled");
    expect(f).not.toHaveBeenCalled();
  });

  it("is 'sent' on success and passes custom headers to the provider", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM", "Store <s@example.com>");
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    const res = await sendEmail("a@b.co", mail, { headers: { "List-Unsubscribe": "<https://x.co/stop>" } });
    expect(res).toBe("sent");
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.headers).toEqual({ "List-Unsubscribe": "<https://x.co/stop>" });
  });

  it("is 'failed' when the provider refuses or cannot be reached", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM", "Store <s@example.com>");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 422 })));
    expect(await sendEmail("a@b.co", mail)).toBe("failed");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await sendEmail("a@b.co", mail)).toBe("failed");
  });
});
