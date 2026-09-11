import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { applyAttributionCookie } from "@/lib/attribution-cookie";

// - Gates /admin to admin users (ADMIN_EMAILS); redirects others to /login.
// - Refreshes the Supabase auth session so server components see it.
// - Ensures a first-party anon id cookie so attribution can be captured on
//   landing (events don't send until phase 6, but the id must exist now or
//   early traffic is permanently unattributable).
// - Maintains the gi_utm cookie: first-touch and last-touch campaign labels
//   plus the landing referrer, for everyone, no JavaScript needed.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // The anon id, resolved before the request headers below are forwarded —
  // reusing the cookie already on the request when there is one, otherwise
  // minting the same id the response cookie will carry. res.cookies.set()
  // only reaches the NEXT request; without forwarding it here too, cookies()
  // in the store layout is blind to it on a new browser's first request, and
  // recordVisit opens the visit one request late — after the landing page
  // and referrer that mattered are already gone.
  const existingAnon = req.cookies.get("gi_anon")?.value;
  const anon = existingAnon ?? crypto.randomUUID();

  // The path, forwarded to the server components. A layout cannot read the URL
  // any other way, and the store layout needs it to keep pasted snippets off
  // the checkout unless one of them says otherwise.
  const withPath = new Headers(req.headers);
  withPath.set("x-pathname", pathname);
  // The query too, for the same reason: a server component cannot read it
  // unless its page happens to take searchParams, and two of the four funnel
  // pages do not. The traffic counter needs it to tell a Meta click from a
  // Google one. Capped: this rides on every matched request, not just the
  // four counted pages, and sourceOf never looks past a handful of params —
  // a pathological query string should not eat the header budget everywhere.
  withPath.set("x-search", req.nextUrl.search.slice(0, 2048));
  withPath.set("x-anon-id", anon);
  const res = NextResponse.next({ request: { headers: withPath } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let userEmail: string | null = null;
  let userId: string | null = null;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
    userId = user?.id ?? null;
  }

  // Admin gate. Two lists, checked in this order:
  //
  //   ADMIN_EMAILS   break-glass, set in the environment, cannot be edited from
  //                  inside the app, so the owner can never be locked out.
  //   users.is_admin flagged through Admin -> Members.
  //
  // The env list is checked first and costs nothing; the table is only queried
  // for someone who is not on it, so the common case adds no round-trip.
  //
  // requireAdmin() in lib/admin-guard.ts repeats both checks on every mutating
  // action. This gate is convenience; that one is the security boundary.
  if (pathname.startsWith("/admin")) {
    const admins = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    let allowed = Boolean(userEmail) && admins.includes((userEmail ?? "").toLowerCase());

    if (!allowed && userId) {
      try {
        const service = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { cookies: { getAll: () => [], setAll: () => {} } },
        );
        const { data } = await service
          .from("users")
          .select("is_admin")
          .eq("id", userId)
          .maybeSingle();
        allowed = Boolean(data?.is_admin);
      } catch {
        // A lookup failure denies rather than allows. An admin gate that opens
        // when the database is unreachable is not a gate.
        allowed = false;
      }
    }

    if (!allowed) {
      const to = req.nextUrl.clone();
      to.pathname = "/login";
      to.search = "";
      return NextResponse.redirect(to);
    }
  }

  if (!existingAnon) {
    res.cookies.set("gi_anon", anon, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  // The campaign that brought them, captured on the server so a visitor who
  // bounces before JavaScript runs is still recorded, and kept for a year so
  // a purchase weeks later still carries it. Labels only — the consent gate
  // stays on click ids, IP and user agent (see lib/attribution.ts).
  applyAttributionCookie(req, res);
  return res;
}

export const config = {
  // Run on pages, not static assets or the webhook (which needs a raw body).
  //
  // `.well-known` is excluded because Apple Pay lives or dies on it: Stripe
  // verifies the domain by fetching
  // /.well-known/apple-developer-merchantid-domain-association, and that fetch
  // carries no cookies and wants the file back and nothing else. Running the
  // session refresh and the visitor cookie over it can only add ways for a
  // static blob to come back as something other than itself.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|api/webhooks|\\.well-known).*)",
  ],
};
