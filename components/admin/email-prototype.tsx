"use client";

import { useState } from "react";
import { Section, inputClass } from "@/components/admin/form-controls";
import {
  POST_PURCHASE_DEFAULTS,
  buildPostPurchaseEmail,
  type PostPurchaseSettings,
} from "@/lib/post-purchase-email";

/**
 * The post-purchase email, and the panel that edits it.
 *
 * A prototype: nothing saves and nothing sends. What is real is the PREVIEW —
 * it is rendered by `buildPostPurchaseEmail`, the same function the send path
 * will call, so what is on the right is the email itself rather than a picture
 * of one. That is the only way a preview is worth anything.
 *
 * It is a form rather than a block builder on purpose. The checkout is a page
 * and deserved a canvas; an email is one column that has to survive Gmail,
 * Outlook and a ten-year-old phone, and every degree of freedom added here is
 * another way for it to arrive broken in one client and fine in another.
 */

const SAMPLE = ["The Business Model Masterclass", "Funnel App — Yearly", "The Growth Vault"];

export function EmailPrototype({
  value,
  fieldName,
}: {
  /** What is stored. Absent means the prototype route, which saves nothing. */
  value?: PostPurchaseSettings;
  /**
   * The hidden input this writes into, so the settings form saves it.
   *
   * The whole panel is one JSON field for the same reason the typography and
   * header panels are: it is one document edited by one form, and twenty flat
   * names would be twenty things every other reader of the schema scrolls past.
   */
  fieldName?: string;
}) {
  const [s, setS] = useState<PostPurchaseSettings>(
    value ?? { ...POST_PURCHASE_DEFAULTS, enabled: true },
  );
  const [name, setName] = useState("Priya");
  const [count, setCount] = useState(2);

  const set = <K extends keyof PostPurchaseSettings>(k: K, v: PostPurchaseSettings[K]) =>
    setS((p) => ({ ...p, [k]: v }));

  const mail = buildPostPurchaseEmail({
    firstName: name,
    products: SAMPLE.slice(0, count),
    settings: s,
  });

  const field = (
    key: keyof PostPurchaseSettings,
    label: string,
    hint?: string,
    rows = 0,
  ) => (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {rows > 0 ? (
        <textarea
          rows={rows}
          value={String(s[key] ?? "")}
          onChange={(e) => set(key, e.target.value as PostPurchaseSettings[typeof key])}
          className={inputClass}
        />
      ) : (
        <input
          value={String(s[key] ?? "")}
          onChange={(e) => set(key, e.target.value as PostPurchaseSettings[typeof key])}
          className={inputClass}
        />
      )}
      {hint && <span className="text-[0.66rem] leading-relaxed">{hint}</span>}
    </label>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {fieldName && <input type="hidden" name={fieldName} value={JSON.stringify(s)} />}
      <div className="flex flex-col gap-4">
        <Section
          title="Send it"
          hint="Off and nothing goes out. The receipt is separate and is not affected."
        >
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={s.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
              className="mt-0.5 size-4"
            />
            <span className="flex flex-col">
              <span>Send this after a purchase</span>
              <span className="text-xs text-muted">
                It goes once the whole checkout is finished — after the bump and the upsell — so it
                can list everything they bought in one message rather than the part that had
                happened when payment cleared.
              </span>
            </span>
          </label>
        </Section>

        <Section title="Who it comes from">
          {field("senderName", "Sender name")}
          {field("senderEmail", "Sender address", "Has to be on a domain verified in Resend, or it will not send at all.")}
          {field("replyTo", "Reply-to")}
          {field("subject", "Subject")}
        </Section>

        <Section
          title="Pictures"
          hint="Both come from the media library. Upload them there and paste the URL — a photo bundled into the code is one nobody can change without a deploy."
        >
          {field("headerImageUrl", "Header strip", "The pink band with the logo. 600px wide or more.")}
          <label className="flex flex-col gap-1 text-xs text-muted">
            Band colour
            <span className="flex items-center gap-2">
              <input
                type="color"
                value={s.headerBackground}
                onChange={(e) => set("headerBackground", e.target.value)}
                className="size-8 cursor-pointer rounded border border-border bg-transparent"
              />
              <input
                value={s.headerBackground}
                onChange={(e) => set("headerBackground", e.target.value)}
                className={inputClass}
              />
            </span>
            <span className="text-[0.66rem]">
              Shows behind the picture while it loads, and instead of it for anyone who blocks
              images — which on a first email from an unknown sender is a lot of people.
            </span>
          </label>
          {field("signatureImageUrl", "Signature strip", "The photo, the signature and the founder line.")}
        </Section>

        <Section title="What it says">
          {field("greeting", "Greeting", "{{first_name}} is replaced with their first name — and with nothing at all when we do not have one, so it never reads “hi ,”.")}
          {field("intro", "Opening", undefined, 2)}
          {field("listIntro", "Above the list")}
          {field("accessIntro", "Before the link")}
          {field("accessUrl", "The link")}
          {field("accessNote", "After the link", undefined, 2)}
          {field("supportLine", "Support line", undefined, 2)}
          {field("feedbackLine", "Feedback", "A blank line starts a new paragraph.", 5)}
          {field("signOff", "Sign-off", "Sits above the signature picture. Blank it if the picture already signs off.", 2)}
        </Section>

        <Section title="Colours">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Text
            <input value={s.textColor} onChange={(e) => set("textColor", e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Links
            <input value={s.linkColor} onChange={(e) => set("linkColor", e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Page
            <input value={s.background} onChange={(e) => set("background", e.target.value)} className={inputClass} />
          </label>
        </Section>
      </div>

      <div className="flex flex-col gap-3">
        <Section
          title="Preview"
          hint="Drawn by the same code that will send it, so this cannot drift from what lands in an inbox."
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Their first name
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Things they bought
              <span className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={SAMPLE.length}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
                <span className="w-4 tabular-nums">{count}</span>
              </span>
            </label>
            <span className="text-[0.66rem] text-muted">
              Try it with no name and with one purchase — those are the two that usually read
              badly, and both happen every day.
            </span>
          </div>
        </Section>

        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="flex flex-col gap-0.5 border-b border-border bg-surface-2 px-4 py-3">
            <span className="text-sm font-medium text-fg">{mail.subject}</span>
            <span className="text-xs text-muted">
              {s.senderName} &lt;{s.senderEmail}&gt;
            </span>
          </div>
          {/* An iframe, because the email carries its own colours and font and
              must not inherit the admin's. It is also the only honest preview:
              the admin's stylesheet is not in anybody's inbox. */}
          <iframe
            title="Post-purchase email"
            srcDoc={mail.html}
            className="h-[860px] w-full bg-white"
          />
        </div>

        <details className="rounded-xl border border-border bg-surface-2 p-3">
          <summary className="cursor-pointer text-xs text-muted">
            The plain-text version — what a watch, a screen reader and a spam filter read
          </summary>
          <pre className="mt-2 whitespace-pre-wrap text-[0.7rem] leading-relaxed text-muted">
            {mail.text}
          </pre>
        </details>
      </div>
    </div>
  );
}
