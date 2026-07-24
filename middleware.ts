import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// - Blocks /admin in production until real owner-auth (phase 2 auth).
// - Refreshes the Supabase auth session so server components see it.
// - Ensures a first-party anon id cookie so attribution can be captured on
//   landing (events don't send until phase 6, but the id must exist now or
//   early traffic is permanently unattributable).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (process.env.NODE_ENV === "production" && pathname.startsWith("/admin")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const res = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    });
    await supabase.auth.getUser();
  }

  if (!req.cookies.get("gi_anon")) {
    res.cookies.set("gi_anon", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return res;
}

export const config = {
  // Run on pages, not static assets or the webhook (which needs a raw body).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api/webhooks).*)"],
};
