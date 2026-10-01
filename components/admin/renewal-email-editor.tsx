"use client";

import { useState } from "react";
import { Section, inputClass } from "@/components/admin/form-controls";
import type { PostPurchaseSettings } from "@/lib/post-purchase-email";
import { buildRenewalEmail, type RenewalEmailSettings } from "@/lib/renewal-email";

/**
 * The renewal email's words, with a preview drawn by the same builder the
 * renewal sends through. The look comes from the welcome email's settings, so
 * this panel has none of its own.
 */

const DAY = 86_400_000;

export function RenewalEmailEditor({
  value,
  look,
  fieldName,
}: {
  value: RenewalEmailSettings;
  look: PostPurchaseSettings;
  fieldName: string;
}) {
  const [s, setS] = useState<RenewalEmailSettings>(value);
  const [name, setName] = useState("Priya");
  const [plan, setPlan] = useState("Funnel App");
  const [taxed, setTaxed] = useState(false);

  const set = <K extends keyof RenewalEmailSettings>(k: K, v: RenewalEmailSettings[K]) =>
    setS((p) => ({ ...p, [k]: v }));

  const today = new Date();
  const mail = buildRenewalEmail({
    firstName: name,
    plan,
    amountCents: taxed ? 3190 : 2900,
    taxCents: taxed ? 290 : 0,
    currency: "usd",
    paidAt: today,
    periodStart: today,
    nextDate: new Date(today.getTime() + 30 * DAY),
    orderId: "8f3a21c0-0000-0000-0000-000000000000",
    siteUrl: "https://grow.greaterinside.com",
    settings: s,
    look,
  });

  const field = (key: Exclude<keyof RenewalEmailSettings, "enabled">, label: string, hint?: string, rows = 0) => (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {rows > 0 ? (
        <textarea rows={rows} value={s[key]} onChange={(e) => set(key, e.target.value)} className={inputClass} />
      ) : (
        <input value={s[key]} onChange={(e) => set(key, e.target.value)} className={inputClass} />
      )}
      {hint && <span className="text-[0.66rem] leading-relaxed">{hint}</span>}
    </label>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <input type="hidden" name={fieldName} value={JSON.stringify(s)} />
      <div className="flex flex-col gap-4">
        <Section title="Send it" hint="Off and renewals get the plain receipt instead.">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={s.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
              className="mt-0.5 size-4"
            />
            <span className="flex flex-col">
              <span>Send this when a plan renews</span>
              <span className="text-xs text-muted">
                It replaces the receipt and carries the receipt inside it. Plan changes and payment-plan
                instalments still get the plain receipt.
              </span>
            </span>
          </label>
        </Section>

        <Section
          title="What it says"
          hint="{{first_name}}, {{plan}}, {{amount}} and {{next_date}} work in every field. The sender, reply-to, header, signature and colours are the post-purchase email's."
        >
          {field("subject", "Subject")}
          {field("previewText", "Preview text", "The grey line an inbox shows after the subject.")}
          {field("greeting", "Greeting", "With no name on file, {{first_name}} disappears with its space, so it never reads “hi ,”.")}
          {field("opening", "Opening", "Sits above the receipt.", 3)}
          {field("accountLine", "Account line", "{{account_link}} becomes a “your account” link to their account page.", 3)}
          {field("closing", "Closing", "A blank line starts a new paragraph.", 3)}
        </Section>
      </div>

      <div className="flex flex-col gap-3">
        <Section title="Preview" hint="Drawn by the same code that sends it.">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Their first name
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Plan
              <input value={plan} onChange={(e) => setPlan(e.target.value)} className={inputClass} />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={taxed} onChange={(e) => setTaxed(e.target.checked)} className="size-4" />
              With tax
            </label>
          </div>
        </Section>

        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="flex flex-col gap-0.5 border-b border-border bg-surface-2 px-4 py-3">
            <span className="text-sm font-medium text-fg">{mail.subject}</span>
            <span className="text-xs text-muted">
              {look.senderName} &lt;{look.senderEmail}&gt;
            </span>
          </div>
          <iframe title="Renewal email" srcDoc={mail.html} className="h-[820px] w-full bg-white" />
        </div>

        <details className="rounded-xl border border-border bg-surface-2 p-3">
          <summary className="cursor-pointer text-xs text-muted">The plain-text version</summary>
          <pre className="mt-2 whitespace-pre-wrap text-[0.7rem] leading-relaxed text-muted">{mail.text}</pre>
        </details>
      </div>
    </div>
  );
}
