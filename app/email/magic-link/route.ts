import { magicLinkEmailHtml } from "@/lib/auth-email";

export const dynamic = "force-dynamic";

/**
 * The sign-in email template, for Supabase to fetch.
 *
 * GoTrue is configured with a URL rather than inline HTML, so this is that URL.
 * It returns the template with GoTrue's own placeholders still in it —
 * `{{ .ConfirmationURL }}` and friends — which Go fills in when it sends.
 *
 * Public on purpose: GoTrue fetches it server-to-server with no credentials of
 * ours, and there is nothing secret in a template. It contains no link, no
 * token and no address — only the shape one is poured into.
 *
 * Cached at the edge for an hour. GoTrue may fetch this on every send, and a
 * sign-in should not wait on a settings read; an hour is short enough that a
 * change to the branding shows up the same morning.
 */
export async function GET() {
  const html = await magicLinkEmailHtml();
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
