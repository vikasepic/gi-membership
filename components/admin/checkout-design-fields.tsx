"use client";

import { useState } from "react";
import { Group, Field } from "@/components/admin/form-controls";
import { ColorControl } from "@/components/admin/color-control";
import type { CheckoutDesign } from "@/lib/checkout-design";

/**
 * The whole checkout editor.
 *
 * It used to be the page builder pointed at the checkout — any block, anywhere,
 * with a guard on the live page that refused a saved layout missing its card
 * fields and silently fell back to the one that shipped. The editor and the
 * guard were most of the complexity, and neither existed to make the checkout
 * better; they existed to survive the freedom the editor handed out.
 *
 * Three colours and a list of switches. Nothing here can produce a page that
 * cannot take a payment, so there is nothing left to guard against — the card
 * fields, the total and the pay button are not on this list, because a checkout
 * without them is not a checkout.
 *
 * One hidden input carrying the lot as JSON, which is how every other object
 * setting in this admin is posted. Individual named inputs would need the save
 * action to reassemble them, and an unticked checkbox posts nothing at all —
 * so "off" and "not on this form" would arrive identical, and turning
 * something off would silently do nothing.
 */
export function CheckoutDesignFields({ value, name }: { value: CheckoutDesign; name: string }) {
  const [d, setD] = useState<CheckoutDesign>(value);
  const set = <K extends keyof CheckoutDesign>(k: K, v: CheckoutDesign[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="flex flex-col gap-5">
      <input type="hidden" name={name} value={JSON.stringify(d)} />

      <Group
        label="Colours"
        hint="the whole checkout is painted from these three — the fields, the links and the bump all follow the button"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Panel background" hint="the selling half">
            <ColorControl
              label="Panel background"
              value={d.panelBackground}
              onChange={(v) => set("panelBackground", v ?? "")}
              empty="the built-in"
            />
          </Field>
          <Field label="Page background" hint="behind the form">
            <ColorControl
              label="Page background"
              value={d.pageBackground}
              onChange={(v) => set("pageBackground", v ?? "")}
              empty="the built-in"
            />
          </Field>
          <Field label="Button" hint="pay button and accents">
            <ColorControl
              label="Button"
              value={d.buttonColor}
              onChange={(v) => set("buttonColor", v ?? "")}
              empty="the built-in"
            />
          </Field>
        </div>
      </Group>

      <Group label="On the panel" hint="the half that says what they are buying">
        <Toggle on={d.showImage} set={(v) => set("showImage", v)} label="Product image" />
        <Toggle on={d.showPrice} set={(v) => set("showPrice", v)} label="Price" />
        <Toggle on={d.showBullets} set={(v) => set("showBullets", v)} label="Bullet points" />
        <Toggle on={d.showBackLink} set={(v) => set("showBackLink", v)} label="Back link" />
        <Toggle
          on={d.showSecureLine}
          set={(v) => set("showSecureLine", v)}
          label="&ldquo;Secure checkout&rdquo; line"
        />
      </Group>

      <Group label="On the form" hint="the half that takes the money">
        <Toggle
          on={d.showDiscountCode}
          set={(v) => set("showDiscountCode", v)}
          label="Discount code"
          hint="off hides the link entirely — codes you have already issued stop being usable on this page"
        />
        <Toggle
          on={d.showTrustRow}
          set={(v) => set("showTrustRow", v)}
          label="Reassurance row under the button"
          hint="Stripe secure · card never stored · instant access"
        />
        <Toggle
          on={d.showTaxNote}
          set={(v) => set("showTaxNote", v)}
          label="Tax note beside the total"
        />
        <Toggle
          on={d.showRenewalLine}
          set={(v) => set("showRenewalLine", v)}
          label="Renewal terms beside the total"
          hint="leave this on if you sell anything recurring — “$0 due today” with no renewal stated beside it is the line a chargeback gets argued over"
        />
      </Group>

      <p className="text-xs text-muted">
        The card fields, the total and the pay button are not on this list. A checkout without
        them is not a checkout, so they are not switchable.
      </p>
    </div>
  );
}

function Toggle({
  on,
  set,
  label,
  hint,
}: {
  on: boolean;
  set: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => set(e.target.checked)}
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-[var(--primary)]"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}
