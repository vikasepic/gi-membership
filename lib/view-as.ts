import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { otoSigningSecret } from "@/lib/env";

/**
 * Looking at the store as one of its members.
 *
 * An admin cannot answer "what does this person actually see" from the admin
 * screens: those show what we recorded, not what the library renders. This
 * puts the admin inside the member's account.
 *
 * It is NOT a login. The Supabase session stays the admin's own, which is
 * what makes leaving instant and what keeps the auth log honest — Supabase
 * never records a sign-in that did not happen. What changes is who the
 * store's own pages consider the viewer, and that is resolved in exactly one
 * place, `viewer()` below.
 *
 * The cookie is signed with the same secret as the OTO and preview tokens,
 * carries an expiry, and is HttpOnly. Without a signature, anyone who could
 * set a cookie could become any member, which is the whole store.
 */

const COOKIE = "gi_view_as";
const TTL_SECONDS = 60 * 60;

type Payload = { admin: string; member: string; exp: number };

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signViewAsToken(adminId: string, memberId: string, now = Date.now()): string {
  const payload: Payload = { admin: adminId, member: memberId, exp: Math.floor(now / 1000) + TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, otoSigningSecret())}`;
}

/** Null for anything that is not a live, correctly signed token. */
export function verifyViewAsToken(token: string | undefined, now = Date.now()): Payload | null {
  if (!token) return null;
  const [body, given] = token.split(".");
  if (!body || !given) return null;
  const expected = sign(body, otoSigningSecret());
  // Constant time, and length-checked first: timingSafeEqual throws on a
  // length mismatch rather than returning false.
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (!payload.admin || !payload.member) return null;
    if (payload.exp * 1000 < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export type Viewer = {
  /** Whose data the store shows. The member's id while viewing as. */
  id: string;
  email: string | null;
  /** Set only while viewing as: the admin actually at the keyboard. */
  actingAdminId: string | null;
  viewingAs: boolean;
  /** The member's display name, for the banner. */
  name: string | null;
};

/**
 * Who the store is rendering for.
 *
 * Every page, action and route in the store area resolves the viewer here
 * rather than calling `auth.getUser()` directly, so there is one answer and
 * one place to change it. Null means nobody is signed in.
 *
 * The cookie is re-checked against the signed-in user on every call: a token
 * minted for one admin is useless in anyone else's browser, and an admin who
 * loses their admin rights stops being able to use a token they already hold.
 */
export async function viewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const jar = await cookies();
  const payload = verifyViewAsToken(jar.get(COOKIE)?.value);
  if (!payload || payload.admin !== user.id) {
    return { id: user.id, email: user.email ?? null, actingAdminId: null, viewingAs: false, name: null };
  }

  // Still an admin? The token outlives a demotion otherwise.
  const { userIsAdmin } = await import("@/lib/admin-guard");
  if (!(await userIsAdmin({ id: user.id, email: user.email }))) {
    return { id: user.id, email: user.email ?? null, actingAdminId: null, viewingAs: false, name: null };
  }

  const db = createServiceClient();
  const { data: member } = await db
    .from("users")
    .select("id, email, username")
    .eq("id", payload.member)
    .maybeSingle();
  // A member deleted while being viewed drops the admin back into their own
  // account rather than rendering a page for somebody who is not there.
  if (!member) {
    return { id: user.id, email: user.email ?? null, actingAdminId: null, viewingAs: false, name: null };
  }

  return {
    id: member.id as string,
    email: (member.email as string) ?? null,
    actingAdminId: user.id,
    viewingAs: true,
    name: (member.username as string | null) ?? null,
  };
}

export async function setViewAsCookie(adminId: string, memberId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, signViewAsToken(adminId, memberId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function clearViewAsCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * Is somebody standing in for a member right now?
 *
 * Used by the paths that move money. An admin viewing a member can do the
 * things support needs — read their library, mark progress, cancel a
 * subscription — but starting a checkout would put a charge on that member's
 * card, and nothing about inspecting an account calls for that. It is the one
 * line this feature does not cross, and it is drawn here rather than in five
 * separate guards.
 */
export async function isViewingAs(): Promise<boolean> {
  return (await viewer())?.viewingAs ?? false;
}
