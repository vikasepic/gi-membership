import "server-only";
import { longDate } from "@/lib/dates";

// Transactional email. Without this a buyer pays, gets an account created at
// checkout, and is never told how to reach it — and a forgotten password is
// unrecoverable. Sent via Resend (already used by the sibling apps on this box).
//
// Like tracking, this is OPTIONAL: with no credentials the store still works and
// nothing is sent, so a missing key can never fail a purchase.

export type EmailEnv = { RESEND_API_KEY?: string; RESEND_FROM?: string };

export function emailEnabled(env: EmailEnv): boolean {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM);
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
    cents / 100,
  );

// Brand-consistent shell. Inline styles only — email clients strip <style>.
function shell(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#fafaf8;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e1d9;border-radius:16px;padding:32px;">
    <div style="font-weight:600;font-size:15px;color:#0b0b0d;margin-bottom:24px;">Greater Inside</div>
    ${bodyHtml}
  </div>
  <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#5b5b63;text-align:center;">
    Greater Inside · you received this because you bought something from us.
  </p>
</div>`;
}

const btn = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#c8653d;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:500;">${label}</a>`;

export type BuiltEmail = { subject: string; html: string; text: string };

export function buildWelcomeEmail(args: {
  email: string;
  productTitle: string;
  siteUrl: string;
}): BuiltEmail {
  const loginUrl = `${args.siteUrl}/login`;
  return {
    subject: `Your access to ${args.productTitle}`,
    html: shell(`
      <h1 style="font-size:22px;margin:0 0 12px;color:#0b0b0d;">You're in.</h1>
      <p style="color:#5b5b63;line-height:1.6;margin:0 0 20px;">
        ${args.productTitle} is ready in your library. There is no password to
        remember — enter <strong>${args.email}</strong> and we email you a link
        that signs you straight in.
      </p>
      <p style="margin:0 0 24px;">${btn(loginUrl, "Open your library")}</p>
      <p style="color:#5b5b63;font-size:13px;line-height:1.6;margin:0;">
        Prefer a password? Set one any time at ${args.siteUrl}/reset.
      </p>
    `),
    // Checkout no longer sets a password, so this must not tell people to use
    // one. It said "the password you chose at checkout" — advice that would
    // send every new buyer to a login they cannot complete.
    text: `You're in.

${args.productTitle} is ready in your library.
No password needed — go to ${loginUrl}, enter ${args.email}, and we'll email you a link that signs you in.

Prefer a password? Set one any time at ${args.siteUrl}/reset`,
  };
}

export function buildReceiptEmail(args: {
  email: string;
  orderId: string;
  lines: { description: string; amountCents: number }[];
  /** Before discount and tax. Falls back to the sum of the lines. */
  subtotalCents?: number;
  /** What a coupon took off, and which one. */
  discountCents?: number;
  couponCode?: string | null;
  totalCents: number;
  taxCents: number;
  currency: string;
  /** When it was paid. Defaults to now, which is when this is built. */
  paidAt?: Date;
  siteUrl?: string;
}): BuiltEmail {
  const cur = args.currency;
  const site = args.siteUrl ?? "https://grow.greaterinside.com";
  const subtotal = args.subtotalCents ?? args.lines.reduce((n, l) => n + l.amountCents, 0);
  const discount = args.discountCents ?? 0;
  const paid = args.paidAt ?? new Date();
  const date = longDate(paid);
  // The full uuid is what support asks for, but it is not what a buyer reads.
  // The short form is shown; the full one is spelled out at the bottom.
  const shortId = args.orderId.slice(0, 8).toUpperCase();

  const lineRows = args.lines
    .map(
      (l) =>
        `<tr>
           <td style="padding:14px 0;border-bottom:1px solid #f0ede5;color:#0b0b0d;font-size:15px;line-height:1.4;">${l.description}</td>
           <td style="padding:14px 0;border-bottom:1px solid #f0ede5;text-align:right;color:#0b0b0d;font-size:15px;white-space:nowrap;">${money(l.amountCents, cur)}</td>
         </tr>`,
    )
    .join("");

  // Only the rows that are true. A "Discount $0.00" line on an order with no
  // coupon is noise, and a "Tax $0.00" line invites the question of why not.
  const sub = (label: string, value: string, tone = "#5b5b63") =>
    `<tr>
       <td style="padding:6px 0;color:${tone};font-size:14px;">${label}</td>
       <td style="padding:6px 0;text-align:right;color:${tone};font-size:14px;white-space:nowrap;">${value}</td>
     </tr>`;

  const summaryRows = [
    discount > 0 || args.taxCents > 0 ? sub("Subtotal", money(subtotal, cur)) : "",
    discount > 0
      ? sub(
          args.couponCode ? `Discount (${args.couponCode})` : "Discount",
          `−${money(discount, cur)}`,
          "#4a7c59",
        )
      : "",
    args.taxCents > 0 ? sub("Tax", money(args.taxCents, cur)) : "",
  ].join("");

  return {
    subject: `Your receipt from Greater Inside · ${money(args.totalCents, cur)}`,
    html: shell(`
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a8a93;">Receipt</p>
      <h1 style="font-size:26px;margin:0 0 6px;color:#0b0b0d;line-height:1.2;">Thanks for your order.</h1>
      <p style="color:#5b5b63;font-size:14px;line-height:1.6;margin:0 0 28px;">
        ${date} &middot; Order ${shortId}
      </p>

      <table style="width:100%;border-collapse:collapse;margin:0 0 4px;">
        ${lineRows}
      </table>

      <table style="width:100%;border-collapse:collapse;margin:10px 0 0;">
        ${summaryRows}
        <tr>
          <td style="padding:14px 0 0;border-top:2px solid #0b0b0d;font-weight:600;font-size:17px;color:#0b0b0d;">Total paid</td>
          <td style="padding:14px 0 0;border-top:2px solid #0b0b0d;text-align:right;font-weight:600;font-size:17px;color:#0b0b0d;white-space:nowrap;">${money(args.totalCents, cur)}</td>
        </tr>
      </table>

      <div style="margin:32px 0 0;padding:20px;background:#faf8f4;border-radius:12px;">
        <p style="margin:0 0 14px;color:#0b0b0d;font-size:15px;line-height:1.5;">
          Everything you bought is waiting in your library.
        </p>
        ${btn(`${site}/library`, "Open your library")}
      </div>

      <p style="color:#8a8a93;font-size:12px;line-height:1.6;margin:28px 0 0;">
        Order reference ${args.orderId}<br />
        Charged to ${args.email}. Questions about this order? Reply to this email.
      </p>
    `),
    text: `Receipt from Greater Inside

${date} · Order ${shortId}

${args.lines.map((l) => `${l.description}  ${money(l.amountCents, cur)}`).join("\n")}
${discount > 0 || args.taxCents > 0 ? `\nSubtotal  ${money(subtotal, cur)}` : ""}${
      discount > 0
        ? `\nDiscount${args.couponCode ? ` (${args.couponCode})` : ""}  -${money(discount, cur)}`
        : ""
    }${args.taxCents > 0 ? `\nTax  ${money(args.taxCents, cur)}` : ""}
Total paid  ${money(args.totalCents, cur)}

Everything you bought is in your library: ${site}/library

Order reference ${args.orderId}
Charged to ${args.email}. Questions about this order? Reply to this email.`,
  };
}

// Fire-and-forget send. Failures are logged, never thrown — an email outage
// must not roll back a completed purchase.
export async function sendEmail(
  to: string,
  mail: BuiltEmail,
  /**
   * Who it comes from, where the store has said.
   *
   * The transactional emails go from whatever RESEND_FROM is, which is right
   * for a receipt. The welcome is signed by a person and replies to it are
   * meant to reach that person, so it says so. Unset keeps the old behaviour
   * exactly — and an address on an unverified domain is refused by Resend
   * rather than sent from somewhere else, which is the failure worth having.
   */
  over?: { from?: string; replyTo?: string },
): Promise<void> {
  const env: EmailEnv = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
  };
  if (!emailEnabled(env)) return;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: over?.from?.trim() || env.RESEND_FROM,
        to: [to],
        ...(over?.replyTo?.trim() ? { reply_to: over.replyTo.trim() } : {}),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("[email] send failed:", res.status, await res.text());
  } catch (e) {
    console.error("[email] send threw:", e);
  }
}

/**
 * Three days before a trial converts.
 *
 * Sent because the alternative is a charge nobody was expecting — the single
 * most common reason a first subscription payment gets disputed. It says the
 * date, the amount, and how to stop it, because a warning that makes cancelling
 * hard is not a warning.
 */
export function buildTrialEndingEmail(args: {
  productName: string;
  priceLabel: string;
  intervalLabel: string;
  chargeOn: string;
  manageUrl: string;
}): BuiltEmail {
  const line = `${args.priceLabel}${args.intervalLabel} on ${args.chargeOn}`;
  return {
    subject: `Your ${args.productName} trial ends on ${args.chargeOn}`,
    html: shell(`
      <h1 style="font-size:22px;margin:0 0 12px;color:#0b0b0d;">Your trial ends soon</h1>
      <p style="font-size:15px;line-height:1.6;color:#0b0b0d;margin:0 0 16px;">
        Your free trial of <strong>${args.productName}</strong> ends on ${args.chargeOn}. After that
        it is <strong>${line}</strong>, and it carries on until you cancel.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#0b0b0d;margin:0 0 24px;">
        Nothing to do if you want to keep it. If you would rather not, you can cancel now and keep
        access until the trial runs out.
      </p>
      ${btn(args.manageUrl, "Manage or cancel")}
    `),
    text: `Your free trial of ${args.productName} ends on ${args.chargeOn}. After that it is ${line}.\n\nKeep it and there is nothing to do. To cancel: ${args.manageUrl}`,
  };
}

/**
 * The card was declined.
 *
 * Access is deliberately NOT withdrawn here — Stripe is still retrying a card
 * that often works on the second attempt — so this is the only thing standing
 * between a expired card and a customer who silently disappears.
 */
export function buildPaymentFailedEmail(args: {
  productName: string;
  manageUrl: string;
}): BuiltEmail {
  return {
    subject: `We could not take payment for ${args.productName}`,
    html: shell(`
      <h1 style="font-size:22px;margin:0 0 12px;color:#0b0b0d;">Your card was declined</h1>
      <p style="font-size:15px;line-height:1.6;color:#0b0b0d;margin:0 0 16px;">
        We could not take this month's payment for <strong>${args.productName}</strong>. It is
        usually an expired card or a bank declining an online charge.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#0b0b0d;margin:0 0 24px;">
        <strong>You still have access.</strong> We will try the card again over the next few days —
        updating it now is the quickest way to stop the reminders.
      </p>
      ${btn(args.manageUrl, "Update your card")}
    `),
    text: `We could not take payment for ${args.productName}. You still have access and we will retry — update your card here: ${args.manageUrl}`,
  };
}
