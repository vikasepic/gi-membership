import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { signHandoffToken } from "@/lib/apps";

// The vector handed to external app teams, pinned here.
//
// It is how an integrator checks their verifier without us. If someone changes
// the signing algorithm — the encoding, the field order, what the HMAC covers —
// every already-shipped integration breaks at once, and the only symptom is
// customers who cannot open the app. This test makes that a red build instead.
const vector = JSON.parse(readFileSync("docs/handoff-test-vector.json", "utf8"));

describe("published handoff test vector", () => {
  it("is still what the signer produces", () => {
    expect(signHandoffToken(vector.payload, vector.secret)).toBe(vector.token);
  });
});
