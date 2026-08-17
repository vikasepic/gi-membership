import "server-only";
import { getSettingsOrDefaults } from "@/lib/settings";

/**
 * The sign-in email, built here and fetched by Supabase.
 *
 * Supabase Auth sends this one, not the app — so the app cannot simply write it
 * the way it writes the receipt. What GoTrue takes is a URL to an HTML
 * template, which it fetches and fills in. So the template lives at a route of
 * ours: version-controlled, styled from the store's own settings, and editable
 * without touching infrastructure.
 *
 * The placeholders are GoTrue's and are left EXACTLY as they are — Go's
 * templating fills them in at send time:
 *
 *   {{ .ConfirmationURL }}  the one-time link
 *   {{ .Email }}            who asked for it
 *   {{ .SiteURL }}          the store's address
 *
 * Nothing here may HTML-escape them, which is why this is assembled as a string
 * rather than rendered through React.
 *
 * Same shell as the post-purchase email on purpose: tables and inline styles
 * only, because Gmail and Outlook strip `<style>` blocks and a flexbox email
 * collapses in half the clients that receive it.
 */
export async function magicLinkEmailHtml(): Promise<string> {
  // Borrowed from the post-purchase email so the two look like one shop. A
  // buyer sees the welcome and the sign-in link within minutes of each other.
  const s = (await getSettingsOrDefaults()).postPurchaseEmail;

  const header = s.headerImageUrl
    ? `<tr><td style="background:${s.headerBackground};padding:0;">
         <img src="${s.headerImageUrl}" alt="" width="600"
              style="display:block;width:100%;max-width:600px;height:auto;border:0;" /></td></tr>`
    : `<tr><td style="background:${s.headerBackground};height:84px;"></td></tr>`;

  const p = (text: string) =>
    `<p style="margin:0 0 18px;font-size:16px;line-height:1.75;color:${s.textColor};">${text}</p>`;

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${s.background};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${s.background};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:100%;font-family:${s.fontFamily};">
        ${header}
        <tr><td style="padding:34px 8px 8px;">
          ${p("Here is your sign-in link.")}
          ${p("It opens your library straight away — there is no password to remember or reset.")}

          <!-- A button, and the address underneath it.
               Some clients strip buttons, some people paste links into another
               browser, and a link that only exists inside an anchor is a link
               those people cannot use. The bordered table is the shape Outlook
               renders reliably; a styled <a> alone collapses to plain text
               there. -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;">
            <tr><td align="center" bgcolor="#b0532f" style="border-radius:999px;">
              <a href="{{ .ConfirmationURL }}"
                 style="display:inline-block;padding:14px 32px;font-family:${s.fontFamily};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">
                Sign in
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 18px;font-size:13px;line-height:1.7;color:${s.textColor};opacity:0.75;">
            Button not working? Paste this into your browser:<br />
            <a href="{{ .ConfirmationURL }}" style="color:${s.linkColor};word-break:break-all;">{{ .ConfirmationURL }}</a>
          </p>

          <!-- Said because it is the question somebody asks when a sign-in
               email arrives that they did not ask for. -->
          ${p(
            `<span style="opacity:0.75;font-size:14px;">This link was requested for {{ .Email }} and can only be used once. If that was not you, nothing has happened to your account — you can ignore this.</span>`,
          )}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
