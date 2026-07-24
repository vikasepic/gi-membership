import { describe, it, expect } from "vitest";
import { signOtoToken, verifyOtoToken, type OtoPayload } from "@/lib/oto-token";

const secret = "test-signing-secret";
const base: OtoPayload = {
  orderId: "order-1",
  offerId: "offer-1",
  userId: "user-1",
  exp: Math.floor(Date.now() / 1000) + 600,
};

describe("OTO token", () => {
  it("verifies a freshly signed token", () => {
    const token = signOtoToken(base, secret);
    const res = verifyOtoToken(token, secret);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.payload.offerId).toBe("offer-1");
  });

  it("rejects a token signed with a different secret", () => {
    const token = signOtoToken(base, secret);
    const res = verifyOtoToken(token, "other-secret");
    expect(res).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a tampered payload", () => {
    const token = signOtoToken(base, secret);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, offerId: "offer-EVIL" })).toString("base64url");
    const res = verifyOtoToken(`${forged}.${sig}`, secret);
    expect(res).toEqual({ ok: false, reason: "invalid" });
    expect(body).toBeTruthy();
  });

  it("rejects an expired token", () => {
    const expired = { ...base, exp: Math.floor(Date.now() / 1000) - 5 };
    const res = verifyOtoToken(signOtoToken(expired, secret), secret);
    expect(res).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a malformed token", () => {
    expect(verifyOtoToken("not-a-token", secret)).toEqual({ ok: false, reason: "invalid" });
  });
});
