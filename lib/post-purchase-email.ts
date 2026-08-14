/**
 * The email a buyer gets once the whole checkout is finished.
 *
 * Not "once payment clears" — once they are OUT of the funnel. A bump is taken
 * at the checkout and an upsell one page later, so an email sent at payment can
 * only ever list part of what somebody just bought. Listing two of their three
 * purchases is worse than listing none: it reads as a delivery that went wrong.
 *
 * This module only BUILDS the email. What decides when it goes is the send
 * path, and it is deliberately somewhere else.
 *
 * Everything here is inline-styled and table-free by design: `<style>` blocks
 * are stripped by Gmail and Outlook, and a layout that depends on flexbox is a
 * layout that collapses in half the clients that will receive it.
 */

export type PostPurchaseSettings = {
  /** Off means nothing is sent. Kept as a setting rather than a deploy. */
  enabled: boolean;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  subject: string;
  /** The pink band at the top. A media-library URL — never bundled into code. */
  headerImageUrl: string;
  headerBackground: string;
  /** The photo-and-signature strip at the foot. Also a media-library URL. */
  signatureImageUrl: string;
  /** Sits above the signature image. Blank where the image already signs off. */
  signOff: string;
  greeting: string;
  intro: string;
  /** The line that introduces the list of what they bought. */
  listIntro: string;
  accessIntro: string;
  accessUrl: string;
  accessNote: string;
  supportLine: string;
  feedbackLine: string;
  textColor: string;
  linkColor: string;
  background: string;
  fontFamily: string;
};

/**
 * The copy as written, lowercase and all.
 *
 * Left exactly as it was given. The voice is the point — a "corrected" version
 * with capital letters is a different person writing.
 */
export const POST_PURCHASE_DEFAULTS: PostPurchaseSettings = {
  enabled: false,
  senderName: "Ajit from Greater Inside",
  senderEmail: "support@greaterinside.com",
  replyTo: "support@greaterinside.com",
  subject: "You’re in. Welcome to Greater Inside.",
  headerImageUrl: "",
  headerBackground: "#f5e0da",
  signatureImageUrl: "",
  signOff: "in love and service,\najit",
  greeting: "hi {{first_name}}",
  intro: "you are officially now a part of greater inside community. welcome!",
  listIntro: "first things first, here is what you just got:",
  accessIntro: "you can access it all here:",
  accessUrl: "https://grow.greaterinside.com/login",
  accessNote:
    "just enter your email on the link, confirm it and you are in. No password needed. Voila!",
  supportLine: "for anything that’s not working, email us at support@greaterinside.com.",
  feedbackLine:
    "now, we are a new-ish company. Which means that we thrive on feedback, stories of success and just overall love from our clients.\n\nfor any and all of it, you can simply email me directly at a@ajitnawalkha.com.",
  textColor: "#1a1a1a",
  linkColor: "#1155cc",
  background: "#ffffff",
  fontFamily: "Poppins, 'Helvetica Neue', Helvetica, Arial, sans-serif",
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Addresses and URLs in the copy become links.
 *
 * The copy names an email address and a URL in the middle of a sentence, and a
 * support address that is not clickable is a support address people retype
 * wrongly. Done after escaping so nothing typed into the editor can inject
 * markup — this text is written by an admin, but it is sent to buyers.
 */
function autoLink(escaped: string, linkColor: string): string {
  return escaped
    .replace(
      /\bhttps?:\/\/[^\s<>"]+/g,
      (m) => `<a href="${m}" style="color:${linkColor};text-decoration:underline;">${m}</a>`,
    )
    .replace(
      /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
      (m) => `<a href="mailto:${m}" style="color:${linkColor};text-decoration:underline;">${m}</a>`,
    );
}

/** Blank lines become paragraphs; single newlines become breaks. */
function paragraphs(text: string, s: PostPurchaseSettings): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:${s.textColor};">${autoLink(
          escapeHtml(p),
          s.linkColor,
        ).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n      ");
}

/**
 * The buyer's first name, or nothing.
 *
 * "hi" alone reads fine; "hi there" is a mail-merge that failed and everybody
 * can tell. A signed-in member may have no name stored at all, which is why
 * this has to degrade rather than substitute something friendly.
 */
export function firstNameOf(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  // An address in the name field is not a name. It happens often enough —
  // browsers autofill it — and "hi jane@gmail.com" is worse than "hi".
  return first.includes("@") ? "" : first;
}

export type BuiltEmail = { subject: string; html: string; text: string };

export function buildPostPurchaseEmail(args: {
  firstName: string;
  /** Everything they bought, base first, then bump, then any upsell. */
  products: string[];
  settings?: Partial<PostPurchaseSettings>;
}): BuiltEmail {
  const s = { ...POST_PURCHASE_DEFAULTS, ...args.settings };
  const name = args.firstName.trim();
  // Collapsed rather than left as "hi ,". The trailing space goes with it.
  const greeting = s.greeting.replace(/\s*\{\{\s*first_name\s*\}\}/g, name ? ` ${name}` : "");

  const items =
    args.products.length > 0
      ? `<ul style="margin:0 0 18px;padding-left:20px;">${args.products
          .map(
            (p) =>
              `<li style="margin:0 0 6px;font-size:15px;line-height:1.75;color:${s.textColor};">${escapeHtml(p)}</li>`,
          )
          .join("")}</ul>`
      : "";

  const header = s.headerImageUrl
    ? `<tr><td style="background:${s.headerBackground};padding:0;">
         <img src="${escapeHtml(s.headerImageUrl)}" alt="Greater Inside" width="600"
              style="display:block;width:100%;max-width:600px;height:auto;border:0;" /></td></tr>`
    : `<tr><td style="background:${s.headerBackground};height:84px;"></td></tr>`;

  const signature = s.signatureImageUrl
    ? `<img src="${escapeHtml(s.signatureImageUrl)}" alt="Ajit Nawalkha, Founder, Greater Inside"
            width="360" style="display:block;width:100%;max-width:360px;height:auto;border:0;margin-top:8px;" />`
    : "";

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${s.background};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:${s.background};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:100%;font-family:${s.fontFamily};">
        ${header}
        <tr><td style="padding:34px 8px 8px;">
      ${paragraphs(greeting, s)}
      ${paragraphs(s.intro, s)}
      ${paragraphs(s.listIntro, s)}
      ${items}
      ${paragraphs(`${s.accessIntro} ${s.accessUrl}`, s)}
      ${paragraphs(s.accessNote, s)}
      ${paragraphs(s.supportLine, s)}
      ${paragraphs(s.feedbackLine, s)}
      ${paragraphs(s.signOff, s)}
      ${signature}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    greeting,
    s.intro,
    s.listIntro,
    ...args.products.map((p) => `- ${p}`),
    `${s.accessIntro} ${s.accessUrl}`,
    s.accessNote,
    s.supportLine,
    s.feedbackLine,
    s.signOff,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject: s.subject, html, text };
}
