import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, short-TTL OTO token. The signature proves the payload wasn't tampered;
// single-use is enforced separately by the oto_tokens table (this is the crypto
// half only). Accept must be POST — never encode intent in a GET.

export type OtoPayload = {
  orderId: string;
  offerId: string;
  userId: string;
  exp: number; // unix seconds
};

export type VerifyResult =
  | { ok: true; payload: OtoPayload }
  | { ok: false; reason: "invalid" | "expired" };

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signOtoToken(payload: OtoPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifyOtoToken(token: string, secret: string): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "invalid" };
  const [body, sig] = parts;

  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };

  let payload: OtoPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}
