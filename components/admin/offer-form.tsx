"use client";

import { useActionState } from "react";
import { saveOffer, removeOffer, type SaveState } from "@/app/admin/offers/actions";
import { inputClass as input, Field } from "@/components/admin/form-controls";
import type { Offer } from "@/lib/types";
import type { ProductOption, AppOption } from "@/lib/admin";

export function OfferForm({
  offer,
  products,
  apps,
}: {
  offer?: Offer;
  products: ProductOption[];
  apps: AppOption[];
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveOffer, {});

  return (
    <form action={action} className="flex flex-col gap-6">
      {offer && <input type="hidden" name="id" value={offer.id} />}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Name" required hint="internal label">
          <input name="name" defaultValue={offer?.name ?? ""} required className={input} />
        </Field>
        <Field label="Key" required hint="lowercase-with-hyphens">
          <input name="key" defaultValue={offer?.key ?? ""} required className={input} />
        </Field>
      </div>

      {/* Grant — what the offer gives. */}
      <fieldset className="flex flex-col gap-5 rounded-2xl border border-border p-5">
        <legend className="kicker px-2 text-muted">Grant</legend>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Grant type" required>
            <select name="grantType" defaultValue={offer?.grantType ?? "product"} className={input}>
              <option value="product">Product (one-off)</option>
              <option value="subscription">App subscription</option>
            </select>
          </Field>
          <Field label="Product" hint="if grant = product">
            <select name="grantProductId" defaultValue={offer?.grantProductId ?? ""} className={input}>
              <option value="">— none —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </Field>
          <Field label="App" hint="if grant = subscription">
            <select name="grantAppId" defaultValue={offer?.grantAppId ?? ""} className={input}>
              <option value="">— none —</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Entitlement key" hint="what the app grants, e.g. content-engine">
          <input name="grantEntitlementKey" defaultValue={offer?.grantEntitlementKey ?? ""} className={input} />
        </Field>
      </fieldset>

      {/* Billing. */}
      <fieldset className="flex flex-col gap-5 rounded-2xl border border-border p-5">
        <legend className="kicker px-2 text-muted">Billing</legend>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Field label="Billing type" required>
            <select name="billingType" defaultValue={offer?.billingType ?? "one_time"} className={input}>
              <option value="one_time">One-time</option>
              <option value="recurring">Recurring</option>
            </select>
          </Field>
          <Field label="Interval" hint="recurring">
            <select name="interval" defaultValue={offer?.interval ?? ""} className={input}>
              <option value="">—</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </Field>
          <Field label="Every" hint="interval count">
            <input name="intervalCount" type="number" min="1" defaultValue={offer?.intervalCount ?? ""} className={input} />
          </Field>
          <Field label="Trial days" hint="recurring">
            <input name="trialDays" type="number" min="0" defaultValue={offer?.trialDays ?? ""} className={input} />
          </Field>
        </div>
      </fieldset>

      {/* Pricing. */}
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
        <Field label="Price ($)" required>
          <input name="price" type="number" min="0" step="1" defaultValue={offer ? offer.priceCents / 100 : ""} required className={input} />
        </Field>
        <Field label="Compare-at ($)" hint="optional anchor">
          <input name="compareAt" type="number" min="0" step="1" defaultValue={offer?.compareAtCents ? offer.compareAtCents / 100 : ""} className={input} />
        </Field>
        <Field label="Currency">
          <input name="currency" defaultValue={offer?.currency ?? "usd"} className={input} />
        </Field>
      </div>

      {/* Presentation — how the offer renders in bump/OTO slots. */}
      <fieldset className="flex flex-col gap-5 rounded-2xl border border-border p-5">
        <legend className="kicker px-2 text-muted">Presentation</legend>
        <Field label="Headline" required>
          <input name="headline" defaultValue={offer?.headline ?? ""} required className={input} />
        </Field>
        <Field label="Description">
          <textarea name="description" defaultValue={offer?.description ?? ""} rows={2} className={input} />
        </Field>
        <Field label="Bullets" hint="one per line">
          <textarea name="bullets" defaultValue={offer?.bullets.join("\n") ?? ""} rows={3} className={input} />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Accept button">
            <input name="acceptLabel" defaultValue={offer?.acceptLabel ?? "Yes, add this"} className={input} />
          </Field>
          <Field label="Decline button">
            <input name="declineLabel" defaultValue={offer?.declineLabel ?? "No thanks"} className={input} />
          </Field>
        </div>
        <Field label="Image URL" hint="optional">
          <input name="imageUrl" defaultValue={offer?.imageUrl ?? ""} className={input} />
        </Field>
      </fieldset>

      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="active" defaultChecked={offer ? offer.active : true} className="size-4 accent-[var(--primary)]" />
        Active (available to attach)
      </label>

      {state.error && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : offer ? "Save changes" : "Create offer"}
        </button>
        {offer && (
          <button type="submit" formAction={removeOffer} className="text-sm text-muted hover:text-primary">
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
