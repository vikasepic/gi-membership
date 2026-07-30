import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Where email auth links land: magic link, and anything else GoTrue redirects
// back to us. Establishing the session server-side means the cookie is set by
// the time the next page renders — no flash of a logged-out shell.
//
// Two shapes are handled because GoTrue sends different ones depending on the
// email template:
//
//   ?code=…                  PKCE. What supabase-js sends by default. Requires
//                            the code verifier cookie from the SAME browser
//                            that asked for the link.
//   ?token_hash=…&type=…     Verifiable without the verifier, so it survives
//                            being opened on a different device. Used if the
//                            magic-link email template is switched to
//                            {{ .TokenHash }}.
//
// Supporting both is a few lines and means changing the template later needs no
// code change.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  // GoTrue redirects HERE with an error when the link itself is bad — a reused
  // or expired one arrives as error_code=otp_expired. Without this the request
  // falls through to "missing_link" and tells someone their link was incomplete
  // when in fact they had already used it.
  const errorCode = url.searchParams.get("error_code");
  if (errorCode) {
    const mapped = errorCode === "otp_expired" ? "link_expired" : errorCode;
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(mapped)}`, url.origin));
  }

  // Only ever redirect somewhere on our own origin — `next` arrives from a URL
  // and an open redirect here would hand a session straight to another site.
  const requested = url.searchParams.get("next") ?? "/library";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/library";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason(error.message))}`, url.origin));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "magiclink" | "email" | "recovery" | "invite" | "signup" | "email_change",
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason(error.message))}`, url.origin));
  }

  return NextResponse.redirect(new URL("/login?error=missing_link", url.origin));
}

// GoTrue's messages are accurate but unhelpful to a reader ("both auth code and
// code verifier should be non-empty"). Map the ones people actually hit; pass
// anything else through so a real fault stays diagnosable.
function reason(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("code verifier")) return "wrong_device";
  if (m.includes("expired") || m.includes("invalid")) return "link_expired";
  return message;
}
