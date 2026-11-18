import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { applyAttributionCookie } from "@/lib/attribution-cookie";
import { matchRedirect } from "@/lib/redirects";
import { cachedRedirectRules } from "@/lib/redirect-cache";
import { VIEWER_HOME, viewerMayOpen } from "@/lib/viewer-paths";

// - Gates /admin to admin users (ADMIN_EMAILS, users.is_admin) and lets a
//   read-only person (users.is_viewer) into the report pages; others to /login.
// - Refreshes the Supabase auth session so server components see it.
// - Ensures a first-party anon id cookie so attribution can be captured on
//   landing (events don't send until phase 6, but the id must exist now or
//   early traffic is permanently unattributable).
// - Sends an address with a redirect rule on, before the page renders
//   (Settings › Redirects; docs/superpowers/specs/2026-11-17-redirect-manager-design.md).
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

  const redirected = await redirectFor(req);
  if (redirected) {
    // The campaign and the visitor still count: a redirected ad link credits its sale.
    if (!existingAnon) setAnonCookie(redirected, anon);
    applyAttributionCookie(req, redirected);
    return redirected;
  }

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

  // Admin gate. Three lists, checked in this order:
  //
  //   ADMIN_EMAILS    break-glass, set in the environment, cannot be edited from
  //                   inside the app, so the owner can never be locked out.
  //   users.is_admin  flagged through Admin -> Members.
  //   users.is_viewer read-only: the report pages in lib/viewer-paths.ts and
  //                   nothing else. Any other admin address sends them to
  //                   Journeys rather than to a login they are already past.
  //
  // The env list is checked first and costs nothing; the table is only queried
  // for someone who is not on it, and both columns come from that one query.
  //
  // requireAdmin() in lib/admin-guard.ts repeats the admin checks on every
  // admin page and every mutating
  // action. This gate is convenience; that one is the security boundary.
  if (pathname.startsWith("/admin")) {
    const admins = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    let allowed = Boolean(userEmail) && admins.includes((userEmail ?? "").toLowerCase());
    let viewer = false;

    if (!allowed && userId) {
      try {
        const service = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { cookies: { getAll: () => [], setAll: () => {} } },
        );
        const { data } = await service
          .from("users")
          .select("is_admin, is_viewer")
          .eq("id", userId)
          .maybeSingle();
        viewer = !data?.is_admin && Boolean(data?.is_viewer);
        allowed = Boolean(data?.is_admin) || (viewer && viewerMayOpen(pathname));
      } catch {
        // A lookup failure denies rather than allows. An admin gate that opens
        // when the database is unreachable is not a gate.
        allowed = false;
        viewer = false;
      }
    }

    if (!allowed) {
      const to = req.nextUrl.clone();
      to.pathname = viewer ? VIEWER_HOME : "/login";
      to.search = "";
      const away = NextResponse.redirect(to);
      // getUser() above may have rotated the session and set the new tokens
      // on `res`. They go with the redirect, or the next request arrives with
      // tokens the auth server has already replaced.
      for (const c of res.cookies.getAll()) away.cookies.set(c);
      return away;
    }
  }

  if (!existingAnon) setAnonCookie(res, anon);
  // The campaign that brought them, captured on the server so a visitor who
  // bounces before JavaScript runs is still recorded, and kept for a year so
  // a purchase weeks later still carries it. Labels only — the consent gate
  // stays on click ids, IP and user agent (see lib/attribution.ts).
  applyAttributionCookie(req, res);
  return res;
}

function setAnonCookie(res: NextResponse, anon: string): void {
  res.cookies.set("gi_anon", anon, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}

/**
 * The store's redirect rule for this request, as a response, or null. GET and
 * HEAD only, never a page-editor preview, never a protected address (the
 * matcher refuses those). Never throws: a redirect that cannot be worked out
 * must cost the visitor nothing but the redirect.
 */
async function redirectFor(req: NextRequest): Promise<NextResponse | null> {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  if (req.nextUrl.searchParams.get("preview") === "1") return null;
  try {
    const hit = matchRedirect(await cachedRedirectRules(), req.nextUrl.pathname, req.nextUrl.search);
    if (!hit) return null;
    // Absolute, unlike a route handler: Next's adapter runs new URL(location)
    // with no base after the proxy returns, so a bare path is a 500 (final
    // review, 17 Nov). It turns a same-host URL back into a relative one itself,
    // as it does for the admin gate above.
    const res = NextResponse.redirect(new URL(hit.location, req.nextUrl), hit.status);
    // A browser keeps a 301 for ever unless told otherwise; an hour lets a
    // mistaken rule heal itself once it is removed.
    res.headers.set("Cache-Control", "max-age=3600");
    return res;
  } catch (e) {
    console.error("[redirects] skipped:", e);
    return null;
  }
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
