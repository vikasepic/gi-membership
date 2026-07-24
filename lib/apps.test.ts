import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signHandoffToken } from "@/lib/apps";

// Locks the handoff-token format documented in docs/app-bridge-contract.md.
// If this changes, the Content Machine repo's verification breaks.
describe("signHandoffToken (app bridge contract)", () => {
  const secret = "shared-secret";
  const payload = { email: "a@b.com", userId: "u1", appId: "app1", exp: 9_999_999_999 };

  it("is verifiable by recomputing HMAC-SHA256 over the base64url body", () => {
    const token = signHandoffToken(payload, secret);
    const [body, sig] = token.split(".");
    const expected = createHmac("sha256", secret).update(body).digest("base64url");
    expect(sig).toBe(expected);
    expect(JSON.parse(Buffer.from(body, "base64url").toString("utf8"))).toEqual(payload);
  });

  it("produces a different signature under a different shared secret", () => {
    expect(signHandoffToken(payload, "s1")).not.toBe(signHandoffToken(payload, "s2"));
  });
});
