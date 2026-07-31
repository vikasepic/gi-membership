import "server-only";

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
  totalCents: number;
  taxCents: number;
  currency: string;
}): BuiltEmail {
  const rows = args.lines
    .map(
      (l) =>
        `<tr><td style="padding:8px 0;color:#0b0b0d;">${l.description}</td>
         <td style="padding:8px 0;text-align:right;color:#0b0b0d;">${money(l.amountCents, args.currency)}</td></tr>`,
    )
    .join("");
  const taxRow =
    args.taxCents > 0
      ? `<tr><td style="padding:8px 0;color:#5b5b63;">Tax</td>
         <td style="padding:8px 0;text-align:right;color:#5b5b63;">${money(args.taxCents, args.currency)}</td></tr>`
      : "";

  return {
    subject: `Your receipt from Greater Inside`,
    html: shell(`
      <h1 style="font-size:22px;margin:0 0 12px;color:#0b0b0d;">Receipt</h1>
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px;">
        ${rows}
        ${taxRow}
        <tr><td style="padding:12px 0 0;border-top:1px solid #e4e1d9;font-weight:600;">Total</td>
            <td style="padding:12px 0 0;border-top:1px solid #e4e1d9;text-align:right;font-weight:600;">
              ${money(args.totalCents, args.currency)}</td></tr>
      </table>
      <p style="color:#5b5b63;font-size:12px;margin:0;">Order ${args.orderId}</p>
    `),
    text: `Receipt from Greater Inside

${args.lines.map((l) => `${l.description}  ${money(l.amountCents, args.currency)}`).join("\n")}${
      args.taxCents > 0 ? `\nTax  ${money(args.taxCents, args.currency)}` : ""
    }
Total  ${money(args.totalCents, args.currency)}

Order ${args.orderId}`,
  };
}

// Fire-and-forget send. Failures are logged, never thrown — an email outage
// must not roll back a completed purchase.
export async function sendEmail(to: string, mail: BuiltEmail): Promise<void> {
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
        from: env.RESEND_FROM,
        to: [to],
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
