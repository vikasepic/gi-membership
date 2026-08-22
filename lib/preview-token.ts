import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { otoSigningSecret } from "@/lib/env";

/**
 * Proof that an admin asked for this preview, that survives an iframe.
 *
 * The admin preview panels render a real page in a frame, and they guarded it
 * with requireAdmin() — a cookie check. A cookie set SameSite=Lax is sent on
 * top-level navigations only, and loading a document into an iframe is not
 * one, so the framed request arrives with no session however signed-in the
 * person watching is. requireAdmin then redirected to /login, the frame
 * followed it to the store root, and the root refuses to be framed at all:
 *
 *   Framing 'https://grow.greaterinside.com/' violates the following Content
 *   Security Policy directive: "frame-ancestors 'none'".
 *
 * Which is why the panel showed a broken-document icon rather than an error
 * anybody could act on. The server was answering 200 the whole time; the
 * redirect happened inside the frame, after the response.
 *
 * So the authorisation travels in the URL instead. The page holding the iframe
 * is a Server Component that has already proved who the admin is; it mints a
 * token there and the framed route verifies it. Short-lived, scoped to one
 * kind of preview, and signed with a secret the browser never sees — a URL
 * somebody copies out of devtools stops working within the hour, and grants
 * nothing but the page they were already looking at.
 */

const TTL_SECONDS = 60 * 60;

type Payload = { kind: string; exp: number };

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Mint one. Call from a Server Component that has already run requireAdmin(). */
export function signPreviewToken(kind: string, now = Date.now()): string {
  const payload: Payload = { kind, exp: Math.floor(now / 1000) + TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, otoSigningSecret())}`;
}

/**
 * True only for an unexpired token minted for this exact kind of preview.
 *
 * Narrows `token` to a string, because a verified preview has to put the same
 * token back into every link it renders — the page is its own destination.
 */
export function verifyPreviewToken(
  token: string | undefined,
  kind: string,
  now = Date.now(),
): token is string {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;

  const expected = sign(body, otoSigningSecret());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // Length first: timingSafeEqual throws on a mismatch rather than returning
  // false, and a thrown comparison is a 500 on a preview.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    // The kind is checked, so a token minted for one preview cannot open
    // another. They all grant little, but "little" is not "the same little".
    return payload.kind === kind && payload.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}
