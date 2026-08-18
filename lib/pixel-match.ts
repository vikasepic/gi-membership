import "server-only";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CONSENT_COOKIE, parseConsent, mayTrack } from "@/lib/consent";
import { hashed, nameParts } from "@/lib/tracking-fields";

/**
 * What the browser pixel is allowed to know about whoever is reading.
 *
 * Meta calls this advanced matching, and without it a browser event carries
 * only what Meta can see for itself — the IP, the user agent, its own cookies.
 * Those sit at 100% because Meta fills them in; everything that identifies a
 * PERSON sat near zero, because the pixel was initialised with a pixel id and
 * nothing else while the server knew exactly who was reading.
 *
 * Hashed here rather than in the browser. The pixel will hash raw values
 * itself, but that means the address is in the page and in the arguments of a
 * third-party script; a sha256 that Meta accepts just as readily is not.
 *
 * `external_id` is the same value the server sends on conversions —
 * hashed(userId) — because the whole point of an external id is that the two
 * sides agree on it. A signed-out reader gets their anonymous cookie instead,
 * which is stable for a year and is what ties today's PageView to next week's
 * purchase.
 *
 * Nothing at all without consent: this returns null, the pixel initialises
 * bare, and no hash of anybody's address reaches the page.
 */
export type PixelMatch = {
  em?: string;
  fn?: string;
  ln?: string;
  external_id?: string;
};

export async function pixelMatch(): Promise<PixelMatch | null> {
  const jar = await cookies();
  if (!mayTrack(parseConsent(jar.get(CONSENT_COOKIE)?.value))) return null;

  const anonId = jar.get("gi_anon")?.value;

  let user: { id: string; email?: string | null } | null = null;
  try {
    const {
      data: { user: u },
    } = await (await createClient()).auth.getUser();
    user = u ? { id: u.id, email: u.email } : null;
  } catch {
    // A reader we cannot identify is a reader we describe as anonymous, not a
    // page that fails to render.
  }

  if (!user) {
    // Signed out. The anonymous cookie is still a stable identifier, and an
    // external id on a PageView is what lets Meta join it to the purchase that
    // follows once we know a name.
    return anonId ? { external_id: hashed(anonId) } : null;
  }

  let fullName: string | null = null;
  try {
    const { data } = await createServiceClient()
      .from("users")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    fullName = (data?.username as string | null) ?? null;
  } catch {
    // The name is a bonus; the address and the id are the match.
  }

  const { fn, ln } = nameParts(fullName);
  const match: PixelMatch = {
    em: hashed(user.email),
    fn,
    ln,
    external_id: hashed(user.id),
  };
  // Drop the ones we have no answer for — an empty string is a value Meta
  // tries to match and fails on, which is worse than not sending the field.
  return Object.fromEntries(Object.entries(match).filter(([, v]) => v)) as PixelMatch;
}
