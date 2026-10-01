/**
 * The email a member gets when their plan renews: a thank-you with the receipt
 * inside it. It replaces the plain receipt for a renewal; switched off, the
 * plain receipt goes instead.
 *
 * Only the words live here. The look (header, signature, font, colours) and the
 * sender are the welcome email's, so the two read as one voice and there is one
 * place to change them.
 *
 * Pure and client-safe: the settings preview renders exactly what is sent.
 */

import { z } from "zod";
import { money } from "@/lib/money";
import { dateWithYear, longDate } from "@/lib/dates";
import {
  POST_PURCHASE_DEFAULTS,
  escapeHtml,
  headerRow,
  paragraphs,
  signatureImage,
  type BuiltEmail,
  type PostPurchaseSettings,
} from "@/lib/post-purchase-email";

export const renewalEmailSchema = z.object({
  // On from the start: the plain receipt it replaces says nothing a member
  // would miss, and the owner asked for this one in its place.
  enabled: z.boolean().default(true),
  subject: z.string().trim().max(200).default("thank you, your {{plan}} has renewed"),
  previewText: z
    .string()
    .trim()
    .max(300)
    .default("Payment of {{amount}} received. Your next renewal is on {{next_date}}."),
  greeting: z.string().max(200).default("hi {{first_name}},"),
  opening: z
    .string()
    .max(1200)
    .default("thank you for staying with us. your {{plan}} subscription has renewed and your payment went through."),
  accountLine: z
    .string()
    .max(600)
    .default("want to update your card, change your plan or cancel? you can do it any time from {{account_link}}."),
  closing: z.string().max(1200).default("questions about this payment? just reply to this email."),
});

export type RenewalEmailSettings = z.infer<typeof renewalEmailSchema>;
export const RENEWAL_EMAIL_DEFAULTS: RenewalEmailSettings = renewalEmailSchema.parse({});

/** "1 × Content Engine — Instagram (at $29.00 / month)" is Stripe's line; the plan is "Content Engine — Instagram". */
export function planNameOf(description: string): string {
  return description
    .trim()
    .replace(/^\d+\s*×\s*/, "")
    .replace(/\s*\(at [^()]*\)$/, "")
    .trim();
}

type Tags = { first_name: string; plan: string; amount: string; next_date: string };

/** Merge tags filled in raw text; escaping happens later, once. A missing name takes its leading space with it. */
function fill(text: string, t: Tags): string {
  return text
    .replace(/\s*\{\{\s*first_name\s*\}\}/g, t.first_name ? ` ${t.first_name}` : "")
    .replace(/\{\{\s*(plan|amount|next_date)\s*\}\}/g, (_, k: keyof Tags) => t[k])
    .trim();
}

export function buildRenewalEmail(args: {
  firstName: string;
  plan: string;
  /** What was charged, tax included. */
  amountCents: number;
  taxCents: number;
  currency: string;
  paidAt: Date;
  /** The period this payment covers; null leaves the period line out. */
  periodStart: Date | null;
  nextDate: Date;
  orderId: string;
  siteUrl: string;
  settings?: Partial<RenewalEmailSettings>;
  look?: Partial<PostPurchaseSettings>;
}): BuiltEmail {
  const c = { ...RENEWAL_EMAIL_DEFAULTS, ...args.settings };
  const s = { ...POST_PURCHASE_DEFAULTS, ...args.look };
  const cur = args.currency;
  const tags: Tags = {
    first_name: args.firstName.trim(),
    plan: args.plan,
    amount: money(args.amountCents, cur),
    next_date: longDate(args.nextDate),
  };
  const accountUrl = `${args.siteUrl.replace(/\/$/, "")}/account`;
  const shortId = args.orderId.slice(0, 8).toUpperCase();
  const period = args.periodStart ? `${dateWithYear(args.periodStart)} to ${dateWithYear(args.nextDate)}` : "";
  const tax = args.taxCents > 0 ? args.taxCents : 0;

  const accountLink = `<a href="${escapeHtml(accountUrl)}" style="color:${s.linkColor};text-decoration:underline;">your account</a>`;
  const para = (text: string) => paragraphs(fill(text, tags), s).replace(/\{\{\s*account_link\s*\}\}/g, accountLink);

  const muted = "color:#5b5b63;font-size:13px;";
  const row = (label: string, value: string, style = muted, pad = "2px 0") =>
    `<tr><td style="${style}padding:${pad};">${label}</td><td align="right" style="${style}padding:${pad};white-space:nowrap;">${value}</td></tr>`;
  const strong = "font-size:15px;font-weight:700;";

  // Tables, inline styles: the same reasons as the welcome. The one <style>
  // block fits the body to a phone; a 600px table with only max-width set
  // still renders 600px wide there.
  const receipt = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;border:1px solid #ece8e1;border-radius:10px;">
<tr><td style="padding:18px 20px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="font-size:15px;line-height:1.4;padding:0 0 12px;">${escapeHtml(args.plan)}${period ? `<br><span style="${muted}">${period}</span>` : ""}</td><td align="right" style="font-size:15px;white-space:nowrap;vertical-align:top;padding:0 0 12px;">${money(args.amountCents - tax, cur)}</td></tr>
${tax ? row("Tax", money(tax, cur), muted, "0 0 12px") : ""}
<tr><td colspan="2" style="border-top:1px solid #ece8e1;font-size:0;line-height:0;">&nbsp;</td></tr>
${row("Total paid", money(args.amountCents, cur), strong, "12px 0 4px")}
${row("Paid on", longDate(args.paidAt))}
${row("Next renewal", longDate(args.nextDate))}
${row("Order", shortId, muted, "2px 0 14px")}
</table>
</td></tr></table>`;

  const host = args.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@media only screen and (max-width: 640px) {
  .rn-body { width:100% !important; }
  .rn-pad { padding:26px 20px 8px !important; }
  .rn-foot { padding:18px 20px 28px !important; }
  .rn-outer { padding:0 !important; }
}
</style></head>
<body style="margin:0;padding:0;background:${s.background};">
<span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(fill(c.previewText, tags))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${s.background};">
<tr><td class="rn-outer" align="center" style="padding:24px 0;">
<table role="presentation" class="rn-body" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;font-family:${s.fontFamily};color:${s.textColor};">
${headerRow(s)}
<tr><td class="rn-pad" style="padding:34px 32px 8px;">
${para(c.greeting)}
${para(c.opening)}
${receipt}
${para(c.accountLine)}
${para(c.closing)}
${signatureImage(s)}
</td></tr>
<tr><td class="rn-foot" style="padding:18px 32px 28px;font-size:12px;line-height:1.5;color:#5b5b63;">Receipt for order ${shortId}. Greater Inside, ${escapeHtml(host)}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    fill(c.greeting, tags),
    fill(c.opening, tags),
    [
      `${args.plan}${period ? ` (${period})` : ""}: ${money(args.amountCents - tax, cur)}`,
      tax ? `Tax: ${money(tax, cur)}` : "",
      `Total paid: ${money(args.amountCents, cur)}`,
      `Paid on: ${longDate(args.paidAt)}`,
      `Next renewal: ${longDate(args.nextDate)}`,
      `Order: ${shortId}`,
    ]
      .filter(Boolean)
      .join("\n"),
    fill(c.accountLine, tags).replace(/\{\{\s*account_link\s*\}\}/g, `your account (${accountUrl})`),
    fill(c.closing, tags),
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject: fill(c.subject, tags), html, text };
}
