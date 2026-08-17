"use client";

import { createContext, useContext, useMemo, useState, type ReactNode, type RefObject } from "react";
import { PaymentElement } from "@stripe/react-stripe-js";
import type { StripePaymentElementOptions } from "@stripe/stripe-js";
import { money } from "@/lib/money";
import { priceLabel, priceTerms, savingAgainst, type OfferPrice } from "@/lib/offer-prices";
import { OrderBump } from "@/components/checkout/order-bump";
import {
  COUNTRIES,
  MIN_CHARGE_CENTS_CLIENT,
  type BumpChoice,
  type BumpSummary,
  type CheckoutProduct,
} from "@/components/checkout/checkout-types";

/**
 * The checkout, in pieces that can be put anywhere.
 *
 * Every part of this page used to be one block of JSX in one order, which is
 * why changing a word on it was a deploy. Each piece is now a component that
 * reads the live form out of context, so the SAME piece renders whether the
 * store has laid the page out itself or is on the arrangement that shipped.
 *
 * That is the whole trick, and it is the reason there is no second renderer to
 * keep in step: the default checkout is these components in a fixed order, and
 * an edited checkout is these components wherever the builder put them. A bug
 * fixed in the pay button is fixed for both.
 *
 * Nothing here holds state. The form owns all of it — see checkout-form.tsx —
 * because the pieces have to agree about one total, one chosen bump and one
 * submission no matter how they are arranged.
 */

export type CheckoutSlotValue = {
  product: CheckoutProduct;

  signedInEmail: string | null;
  fullName: string;
  setFullName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  emailHint: string | null;
  acceptEmailHint: () => void;
  country: string;
  setCountry: (v: string) => void;
  captureEmail: () => void;

  /** Every way to buy the product, and which is picked. */
  prices: OfferPrice[];
  pricePick: number | null;
  setPricePick: (i: number) => void;
  /** Where to send somebody who pressed Pay without choosing one. */
  priceRef?: RefObject<HTMLFieldSetElement | null>;

  bump: BumpSummary | null;
  bumpAlt: BumpSummary | null;
  bumpOptions: BumpSummary[];
  bumpChoice: BumpChoice | null;
  setBumpChoice: (c: BumpChoice) => void;
  bumpRef: RefObject<HTMLDivElement | null>;
  chosenBump: BumpSummary | null;
  bumpUnanswered: boolean;
  /**
   * More than one way to buy, and none of them picked yet.
   *
   * The same rule the bump has, for the same reason. Nothing is preselected
   * when there is a real choice — choosing FOR somebody is how a person ends up
   * subscribed when they meant to buy once — but the button was quoting the
   * first price anyway, so "Pay $49" was reachable with no radio ticked and the
   * server duly charged the option at the top of the list.
   */
  priceUnanswered?: boolean;

  coupon: { label: string; discountCents: number; clamped?: boolean } | null;
  couponInput: string;
  setCouponInput: (v: string) => void;
  couponBusy: boolean;
  couponError: string | null;
  applyCoupon: () => void;

  totalNow: number;
  busy: boolean;
  error: string | null;
  canPay: boolean;
  notePaymentInfo: () => void;
  /** The published terms, where the store has named one. See TrustBlock. */
  termsUrl?: string;

  /**
   * Ask for the country ourselves after all.
   *
   * False on the redesign, where Stripe's own card form collects it. True once
   * the server has said it still does not know — which is what happens when
   * somebody pays by wallet and never touches that form. A layout that hides
   * the field must honour this or the buyer is stuck on an error they have no
   * control to answer.
   */
  askCountry?: boolean;

  /**
   * Drawn in the builder, not on a real checkout.
   *
   * Only one piece cares: the card fields are Stripe's, and a PaymentElement
   * outside a live Elements provider throws — which would take the editor down
   * the moment somebody dropped the block. It draws its own likeness instead.
   */
  preview?: boolean;
};

const Ctx = createContext<CheckoutSlotValue | null>(null);

export const CheckoutSlots = ({ value, children }: { value: CheckoutSlotValue; children: ReactNode }) => (
  <Ctx.Provider value={value}>{children}</Ctx.Provider>
);

/**
 * The live form, or null.
 *
 * Null everywhere but a checkout — which is exactly what a card-fields block
 * dropped on a sales page must draw. Every slot below returns null on it
 * rather than throwing, because a block in the wrong place is a mistake in an
 * editor, not a reason to take a page down.
 */
export const useCheckout = () => useContext(Ctx);

const input =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-primary";

/**
 * The small print, sized where the cascade cannot reach it.
 *
 * The store's typography writes `:root p` for its sales pages, which is 0-1-1
 * and beats every Tailwind size class. On a checkout that turned a footnote
 * about tax into a 21px paragraph competing with the total beside it. These
 * lines are chrome, not copy, so they say their own size and stop arguing.
 */
const FINE = { fontSize: "0.75rem", lineHeight: 1.5 } as const;
const SMALL = { fontSize: "0.875rem", lineHeight: 1.5 } as const;

/** A style object with the nulls dropped, so an unset colour inherits. */
const set = (o: Record<string, string | number | undefined | null>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));

// ---------------------------------------------------------------------------

export function BuyerDetailsSlot(p: {
  title?: string;
  namePlaceholder?: string;
  emailPlaceholder?: string;
  countryPlaceholder?: string;
  note?: string;
  titleColor?: string | null;
  titleSize?: number | null;
  noteColor?: string | null;
  noteSize?: number | null;
  inputBg?: string | null;
  inputBorder?: string | null;
  inputColor?: string | null;
  radius?: number | null;
  /**
   * Somebody else is asking for the country — don't ask twice.
   *
   * True only where the country is genuinely still collected: the redesign
   * lets Stripe's own card form ask for it, and reads it back out of the
   * element (see CardFieldsSlot). Two country selects on one page is a form
   * where the buyer picks one and the tax is computed from the other.
   */
  hideCountry?: boolean;
}) {
  const c = useCheckout();
  if (!c) return null;

  const fieldStyle = set({
    background: p.inputBg,
    borderColor: p.inputBorder,
    color: p.inputColor,
    borderRadius: p.radius ?? undefined,
  });
  // Hidden because somebody else is asking — unless they asked and got no
  // answer, which is what askCountry means.
  const countryField = p.hideCountry && !c.askCountry ? null : (
    <select
      required
      value={c.country}
      onChange={(e) => c.setCountry(e.target.value)}
      className={input}
      style={fieldStyle}
      aria-label="Billing country"
      autoComplete="country"
    >
      <option value="">{p.countryPlaceholder || "Billing country…"}</option>
      {COUNTRIES.map((x) => (
        <option key={x.code} value={x.code}>
          {x.name}
        </option>
      ))}
    </select>
  );

  // Signed in? Then we already know who they are — don't ask again. The country
  // is still asked, because it decides the VAT rate and a member can be
  // somewhere new.
  if (c.signedInEmail) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="kicker text-muted" style={set({ color: p.titleColor, fontSize: p.titleSize ?? undefined })}>
            Your account
          </span>
          <div className="flex flex-wrap items-center gap-x-2 rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-sm">
            <span className="text-fg">{c.signedInEmail}</span>
            <span className="text-muted">— signed in</span>
          </div>
        </div>
        {countryField}
      </div>
    );
  }

  return (
    /* Name, email and country are one block, two across from `sm` up. Three
       stacked full-width fields each with its own heading pushed the card entry
       below the fold on a laptop, and the further the payment form sits from
       the top the more people leave before they reach it. */
    <fieldset className="flex flex-col gap-3">
      {p.title?.trim() && (
        <legend
          className="kicker mb-1 text-muted"
          style={set({ color: p.titleColor, fontSize: p.titleSize ?? undefined })}
        >
          {p.title}
        </legend>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="text"
          required
          placeholder={p.namePlaceholder || "Full name"}
          value={c.fullName}
          autoComplete="name"
          aria-label="Full name"
          onChange={(e) => c.setFullName(e.target.value)}
          // A name typed after the address still belongs on the buffered lead.
          onBlur={c.captureEmail}
          className={input}
          style={fieldStyle}
        />
        <input
          type="email"
          required
          placeholder={p.emailPlaceholder || "Email"}
          value={c.email}
          autoComplete="email"
          aria-label="Email"
          onChange={(e) => c.setEmail(e.target.value)}
          // On blur rather than on every keystroke: mid-typing an address is a
          // different (and usually invalid) address.
          onBlur={c.captureEmail}
          className={input}
          style={fieldStyle}
        />
      </div>

      {/* The typo suggestion. A wrong email is the most expensive mistake on
          this page: the receipt and the access link both follow it. */}
      {c.emailHint && (
        <p className="-mt-1 text-sm" style={SMALL}>
          <span className="text-muted">Did you mean </span>
          <button
            type="button"
            onClick={c.acceptEmailHint}
            className="font-medium text-primary underline underline-offset-2"
          >
            {c.emailHint}
          </button>
          <span className="text-muted">?</span>
        </p>
      )}

      {/* Country determines the VAT rate on digital sales — Stripe cannot
          calculate tax without it. */}
      {countryField}

      {p.note?.trim() !== "" && (
        <span
          className="text-xs text-muted"
          style={set({ color: p.noteColor, fontSize: p.noteSize ?? undefined })}
        >
          {p.note ?? "Your receipt and access link go to this email. No password to create."}
        </span>
      )}
    </fieldset>
  );
}

/**
 * How they want to buy it — monthly, yearly, once.
 *
 * Only drawn where there is more than one way, so a product sold at a single
 * price renders exactly what it always has. Nothing is preselected when there
 * IS a choice: picking one FOR somebody is how a person ends up subscribed
 * when they meant to buy once.
 */
export function PriceChoiceSlot(p: {
  title?: string;
  titleColor?: string | null;
  titleSize?: number | null;
  /**
   * "cards" gives each way to pay a full row with the figure at the size a
   * decision deserves, and states what the longer term saves. Same radios, same
   * state, same posted index — only the room they get differs.
   */
  variant?: "rows" | "cards";
}) {
  const c = useCheckout();
  if (!c || c.prices.length < 2) return null;
  if (p.variant === "cards") return <PriceCards title={p.title} />;
  return (
    <fieldset className="flex flex-col gap-2" ref={c.priceRef}>
      {p.title?.trim() && (
        <legend className="kicker mb-1 text-muted" style={set({ color: p.titleColor, fontSize: p.titleSize ?? undefined })}>
          {p.title}
        </legend>
      )}
      {c.prices.map((price, i) => {
        const on = c.pricePick === i;
        return (
          <label
            key={price.id}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors ${
              on ? "border-primary bg-primary/5" : "border-border hover:border-primary"
            }`}
          >
            <input
              type="radio"
              name="way-to-buy"
              checked={on}
              onChange={() => c.setPricePick(i)}
              className="size-[18px] shrink-0 cursor-pointer accent-[var(--primary)]"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-display font-semibold tabular-nums">
                {priceLabel(price, c.product.currency)}
                {price.label.trim() && (
                  <span className="ml-2 text-[0.72rem] font-medium text-muted">{price.label.trim()}</span>
                )}
              </span>
              {priceTerms(price, c.product.currency) && (
                <span className="text-[0.76rem] text-muted">{priceTerms(price, c.product.currency)}</span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * The same choice, given the room a subscription decision needs.
 *
 * The saving is DERIVED from the prices beside it — savingAgainst compares
 * cost per day and refuses unless the longer term genuinely costs less — so
 * this cannot advertise a discount the store does not give. Nothing is
 * preselected, for the reason stated above: picking a recurring plan for
 * somebody is how a person ends up subscribed when they meant to buy once.
 */
function PriceCards({ title }: { title?: string }) {
  const c = useCheckout()!;
  // The cheapest per day is the honest baseline to measure the others against.
  const baseline = c.prices.reduce<OfferPrice | null>(
    (best, p) => (best === null || p.priceCents < best.priceCents ? p : best),
    null,
  );

  return (
    <fieldset className="flex flex-col gap-2.5" ref={c.priceRef}>
      {title?.trim() && <legend className="kicker mb-1.5 text-muted">{title}</legend>}
      {c.prices.map((price, i) => {
        const on = c.pricePick === i;
        const saving = baseline && baseline.id !== price.id ? savingAgainst(baseline, price) : null;
        const terms = priceTerms(price, c.product.currency);
        return (
          <label
            key={price.id}
            className={`flex cursor-pointer items-start gap-3.5 rounded-2xl border px-4 py-4 transition-colors ${
              on ? "border-primary bg-primary/[0.07]" : "border-border bg-surface hover:border-primary/60"
            }`}
            style={on ? { borderWidth: 1.5 } : undefined}
          >
            <input
              type="radio"
              name="way-to-buy"
              checked={on}
              onChange={() => c.setPricePick(i)}
              className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-[var(--primary)]"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span
                  className="font-display font-bold tabular-nums text-fg"
                  style={{ fontSize: "1.2rem", lineHeight: 1.15 }}
                >
                  {priceLabel(price, c.product.currency)}
                </span>
                {price.label.trim() && (
                  <span className="text-muted" style={{ fontSize: "0.78rem" }}>
                    {price.label.trim()}
                  </span>
                )}
                {saving && (
                  <span
                    className="rounded-full bg-primary px-2 py-0.5 font-bold uppercase tracking-[0.08em] text-primary-fg"
                    style={{ fontSize: "0.62rem" }}
                  >
                    {saving}
                  </span>
                )}
              </span>
              {terms && (
                <span className="text-muted" style={{ fontSize: "0.83rem", lineHeight: 1.5 }}>
                  {terms}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function OrderBumpSlot(p: {
  title?: string;
  titleColor?: string | null;
  titleSize?: number | null;
  /** The indoor-voice card — see OrderBump. */
  quiet?: boolean;
}) {
  const c = useCheckout();
  // No bump on this product, or one the buyer already owns. Draws nothing —
  // which is why this block is not among the fixed ones.
  if (!c?.bump) return null;
  return (
    <div ref={c.bumpRef} className="flex flex-col gap-2">
      {p.title?.trim() && (
        <span className="kicker text-muted" style={set({ color: p.titleColor, fontSize: p.titleSize ?? undefined })}>
          {p.title}
        </span>
      )}
      <OrderBump
        view={c.bump}
        // A ticked price list is passed as `options` and answers in indexes;
        // the old pairing keeps `alt` and answers in the two words the server
        // still understands. One component, both.
        alt={c.bumpOptions.length > 1 ? null : c.bumpAlt}
        options={c.bumpOptions.length > 1 ? c.bumpOptions : null}
        choice={c.bumpChoice}
        onChoose={c.setBumpChoice}
        quiet={p.quiet}
      />
    </div>
  );
}

export function OrderSummarySlot(p: {
  title?: string;
  showThumb?: boolean;
  showLines?: boolean;
  showTax?: boolean;
  titleSize?: number | null;
  textSize?: number | null;
  labelColor?: string | null;
  valueColor?: string | null;
  ruleColor?: string | null;
}) {
  const c = useCheckout();
  if (!c) return null;
  const label = set({ color: p.labelColor, fontSize: p.textSize ?? undefined });
  const value = set({ color: p.valueColor, fontSize: p.textSize ?? undefined });

  // What they chose, not the headline.
  //
  // This line used to be `product.priceCents` unconditionally, which is right
  // for the products that have one price and wrong for every one that does
  // not: pick the monthly on a product listed at $27 and the summary said $27
  // while the total beside it said $29. A summary that disagrees with the
  // total is worse than no summary — it is the number somebody quotes back
  // when they dispute the charge.
  const chosenPrice = c.pricePick === null ? null : (c.prices[c.pricePick] ?? null);
  const lineCents = chosenPrice?.priceCents ?? c.product.priceCents;
  const lineTerms = chosenPrice ? priceTerms(chosenPrice, c.product.currency) : null;

  return (
    <div className="flex flex-col gap-4">
      {p.title?.trim() && (
        <span className="kicker text-muted" style={set({ fontSize: p.titleSize ?? undefined })}>
          {p.title}
        </span>
      )}

      {p.showLines !== false && (
        <>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="flex min-w-0 items-center gap-2.5">
              {p.showThumb !== false && c.product.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.product.coverUrl}
                  alt=""
                  className="size-9 shrink-0 rounded-md object-cover"
                />
              )}
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-muted" style={label}>
                  {c.product.title}
                </span>
                {/* Which way, where there was a choice. "The Field Guide" twice
                    over on two lines at two prices is not a summary. */}
                {lineTerms && (
                  <span className="truncate text-muted" style={{ ...FINE, ...label }}>
                    {lineTerms}
                  </span>
                )}
              </span>
            </span>
            <span className="shrink-0" style={value}>
              {money(lineCents, c.product.currency)}
            </span>
          </div>

          {c.coupon && (
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-navy" style={label}>
                {c.coupon.label}
              </span>
              <span className="shrink-0 text-navy" style={value}>
                −{money(c.coupon.discountCents, c.product.currency)}
              </span>
            </div>
          )}

          {c.chosenBump && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted" style={label}>
                {/* The name, not the pitch. An order line is a record of what
                    is being bought, and "Yes I want! …" in that slot reads as
                    though the shop does not know what it just sold you. The
                    receipt and the welcome email already used the name —
                    order_items records it — so this was the one place quoting
                    the advert back. */}
                {c.chosenBump.name}
              </span>
              <span style={value}>{money(c.chosenBump.chargeNowCents, c.product.currency)}</span>
            </div>
          )}
        </>
      )}

      {/* Tax is calculated by Stripe from the billing country at the moment of
          payment, so this page can say that it happens and not what it is —
          quoting a figure here that the receipt then contradicts is worse than
          quoting none. */}
      {p.showTax !== false && (
        <p className="text-xs text-muted" style={{ ...FINE, ...set({ color: p.labelColor }) }}>
          Tax is calculated at your country&rsquo;s rate and shown on your receipt.
        </p>
      )}
      {p.ruleColor && <div className="h-px w-full" style={{ background: p.ruleColor }} />}
    </div>
  );
}

export function CouponSlot(p: {
  label?: string;
  placeholder?: string;
  buttonLabel?: string;
  labelColor?: string | null;
  inputBg?: string | null;
  inputBorder?: string | null;
  inputColor?: string | null;
  buttonBg?: string | null;
  buttonColor?: string | null;
  radius?: number | null;
}) {
  const c = useCheckout();
  // Open once it has been asked for, and stay open once a code has stuck — a
  // panel that collapses over an applied discount looks like it removed it.
  const [open, setOpen] = useState(false);
  if (!c) return null;
  const showing = open || Boolean(c.coupon) || Boolean(c.couponError);

  /* Folded away until asked for.
     It was a permanently open field, and on a checkout that is an empty box
     asking a question most buyers cannot answer — it competed with the total
     beside it and made the panel read as a form with something missing. The
     old argument for leaving it open was that hiding it sends people off to
     hunt for a code; a one-line link they can see does not, because the answer
     to "do I have one" is already known before it is clicked. */
  if (!showing) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-sm text-muted underline underline-offset-4 transition-colors hover:text-fg"
        style={SMALL}
      >
        {p.label?.trim() || "Have a discount code?"}
      </button>
    );
  }

  const applied = Boolean(c.coupon);

  return (
    <div className="flex flex-col gap-2">
      {/* One field with the action inside it, rather than a box and a button
          fighting for the same row. The seam between the two was the clumsy
          part: two borders, two corner radii, and a gap down the middle of a
          control that does one thing. */}
      <div
        className="flex items-center gap-1 rounded-xl border border-border bg-surface pr-1 transition-colors focus-within:border-primary"
        style={set({
          background: p.inputBg,
          borderColor: applied ? undefined : p.inputBorder,
          borderRadius: p.radius ?? undefined,
        })}
      >
        <input
          type="text"
          value={c.couponInput}
          onChange={(e) => c.setCouponInput(e.target.value)}
          // Enter here must not submit the payment form — pressing it to apply
          // a code and being charged instead is the sort of surprise that ends
          // in a chargeback.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              c.applyCoupon();
            }
          }}
          placeholder={p.placeholder || "Discount code"}
          aria-label="Discount code"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={open}
          className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-sm uppercase outline-none placeholder:normal-case placeholder:text-muted"
          style={set({ color: p.inputColor })}
        />
        <button
          type="button"
          onClick={c.applyCoupon}
          disabled={c.couponBusy || !c.couponInput.trim()}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
          style={set({ background: p.buttonBg, color: p.buttonColor })}
        >
          {c.couponBusy ? "…" : applied ? "Change" : p.buttonLabel || "Apply"}
        </button>
      </div>

      {/* What it took off, where it worked. The order summary says it too, but
          the confirmation belongs at the control that did it. */}
      {applied && (
        <p className="flex items-center gap-1.5 text-xs text-navy" style={FINE}>
          <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 shrink-0 fill-current">
            <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" />
          </svg>
          {c.coupon!.label} applied
        </p>
      )}
      {c.couponError && (
        <p className="text-xs text-primary" style={FINE}>
          {c.couponError}
        </p>
      )}
      {c.coupon?.clamped && (
        <p className="text-xs text-muted" style={FINE}>
          Discount capped — {money(MIN_CHARGE_CENTS_CLIENT, c.product.currency)} is the smallest
          charge a card can take.
        </p>
      )}
    </div>
  );
}

export function CardFieldsSlot(p: {
  heading?: string;
  headingColor?: string | null;
  headingSize?: number | null;
  /**
   * Let Stripe's own form ask for the billing country, and read it back.
   *
   * The country is not cosmetic here: VAT on a digital sale is charged at the
   * buyer's rate, so createCheckoutIntent refuses to make a PaymentIntent
   * without one. Stripe's Payment Element reports the country it collected on
   * its change event, which is what makes it possible to drop our own select
   * and still calculate tax before the charge.
   *
   * Wallets are the gap, and it is a real one: pay by Google Pay and there is
   * no country in this element until the sheet closes. The form keeps its own
   * fallback for exactly that — see checkout-form.tsx.
   */
  collectCountry?: boolean;
  /** Tabs across the top rather than a stacked accordion. */
  tabs?: boolean;
}) {
  const c = useCheckout();
  // Rebuilt only when the shape actually changes. Stripe re-renders the element
  // on every new options object, and an object literal in the render body is a
  // new one each keystroke — which made the card fields flicker as you typed.
  const options = useMemo<StripePaymentElementOptions>(
    () => ({
      layout: p.tabs
        ? { type: "tabs" }
        : {
            // Open, always. Left to itself the Element renders its methods as a
            // collapsed accordion, so a buyer who has already decided to pay
            // meets one more thing to click before there is anywhere to type a
            // card. On a page whose whole job is taking a card, the card fields
            // are not an option to be chosen — they are the page.
            type: "accordion",
            defaultCollapsed: false,
            // "if_multiple", not "always": a radio beside the only way to pay
            // is a choice with one option, which reads as something missing.
            radios: "if_multiple",
            spacedAccordionItems: false,
          },
      // Google Pay, Apple Pay and Link, where the buyer's browser and this
      // Stripe account both offer them. "auto" is Stripe deciding per visitor,
      // which is the only answer that can be right on a page served worldwide.
      wallets: { applePay: "auto", googlePay: "auto", link: "auto" },
      ...(p.collectCountry
        ? {
            fields: {
              billingDetails: {
                // Country and postcode only. The rest is address Stripe does
                // not need for a digital sale and we have no reason to hold.
                address: {
                  country: "auto",
                  postalCode: "auto",
                  line1: "never",
                  line2: "never",
                  city: "never",
                  state: "never",
                },
              },
            },
          }
        : {}),
    }),
    [p.tabs, p.collectCountry],
  );
  if (!c) return null;
  return (
    <fieldset className="flex flex-col gap-3">
      {p.heading?.trim() && (
        <legend
          className="kicker mb-2 text-muted"
          style={set({ color: p.headingColor, fontSize: p.headingSize ?? undefined })}
        >
          {p.heading}
        </legend>
      )}
      {c.preview ? (
        // Stripe's fields, to scale. What a buyer is actually offered depends
        // on where they are — a card here, UPI in India — so this is a likeness
        // and says so rather than pretending to be the real thing.
        <div className="flex flex-col gap-2" aria-hidden>
          <div className="h-11 rounded-xl border border-border bg-surface-2" />
          <div className="flex gap-2">
            <div className="h-11 flex-1 rounded-xl border border-border bg-surface-2" />
            <div className="h-11 w-24 rounded-xl border border-border bg-surface-2" />
          </div>
          <span className="text-[0.7rem] text-muted">
            Stripe draws these on the live page — card, wallets, and whatever else it offers where
            the buyer is.
          </span>
        </div>
      ) : (
        /* Reported the moment they start filling the card in, not when they
           press pay. The gap between "began entering a card" and "completed a
           purchase" is the most useful signal on the page. */
        <PaymentElement
          onChange={(e) => {
            c.notePaymentInfo();
            // The country Stripe collected, handed straight to the form that
            // needs it for tax. Only ever set from a real two-letter answer:
            // switching to a wallet clears this object, and clearing a country
            // we already have would fail the charge at the last step.
            const picked = e.value?.billingDetails?.address?.country;
            if (p.collectCountry && typeof picked === "string" && picked.length === 2) {
              c.setCountry(picked.toUpperCase());
            }
          }}
          options={options}
        />
      )}
    </fieldset>
  );
}

export function DueTodaySlot(p: {
  label?: string;
  labelColor?: string | null;
  amountColor?: string | null;
  labelSize?: number | null;
  amountSize?: number | null;
  showTerms?: boolean;
  termsColor?: string | null;
  termsSize?: number | null;
}) {
  const c = useCheckout();
  if (!c) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between border-t border-border pt-4">
        <span className="text-muted" style={set({ color: p.labelColor, fontSize: p.labelSize ?? undefined })}>
          {p.label || "Total now"}
        </span>
        <span
          className="font-display text-2xl"
          style={set({ color: p.amountColor, fontSize: p.amountSize ?? undefined })}
        >
          {money(c.totalNow, c.product.currency)}
        </span>
      </div>
      {/* What happens after today. Never hidden on anything recurring: a
          subscription that does not state its terms beside the amount is how a
          first renewal becomes a dispute. */}
      {p.showTerms !== false && c.chosenBump?.termsLabel && (
        <p
          className="text-sm text-muted"
          style={{ ...SMALL, ...set({ color: p.termsColor, fontSize: p.termsSize ?? undefined }) }}
        >
          {/* Also the name: this is a factual statement about billing. */}
          {c.chosenBump.name}: {c.chosenBump.termsLabel}.
        </p>
      )}
    </div>
  );
}

export function PayButtonSlot(p: {
  label?: string;
  trialLabel?: string;
  bg?: string | null;
  color?: string | null;
  radius?: number | null;
  size?: number | null;
  fullWidth?: boolean;
  note?: string;
  noteColor?: string | null;
  noteSize?: number | null;
}) {
  const c = useCheckout();
  if (!c) return null;

  // Nothing to pay today means a trial started, and a button reading "Pay $0"
  // on it is the kind of surprise that becomes a dispute.
  const isTrial = c.totalNow === 0;
  const words = isTrial ? p.trialLabel || "Start free trial" : p.label || "Pay";
  // Held while ANY choice on the page is still open — the add-on or the way to
  // buy. Both change what is about to be charged, and a button that can be
  // pressed before they are answered is a button that charges a guess.
  const held = c.bumpUnanswered || Boolean(c.priceUnanswered);

  return (
    <div className="flex flex-col gap-4">
      {c.error && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary" style={SMALL}>
          {c.error}
        </p>
      )}

      {/* The amount lives in the button so the thing being agreed to is on the
          thing being pressed — and it moves with the bump, so ticking the
          add-on visibly changes what you are about to pay.

          Held, not disabled, while the add-on is unanswered. A disabled button
          cannot be clicked, so it can never say why it is not working — it just
          fails silently and the buyer leaves. This one looks inert, takes the
          click, and answers. */}
      <button
        type="submit"
        disabled={c.busy || !c.canPay}
        aria-disabled={held || undefined}
        style={set({
          background: p.bg,
          color: p.color,
          borderRadius: p.radius ?? undefined,
          fontSize: p.size ?? undefined,
          width: p.fullWidth === false ? "auto" : undefined,
          alignSelf: p.fullWidth === false ? "flex-start" : undefined,
        })}
        className={`group relative flex items-center justify-center gap-2.5 overflow-hidden rounded-full bg-primary px-6 py-4 font-medium text-primary-fg transition-[transform,background-color,box-shadow,opacity,filter] duration-200 hover:bg-primary-hover hover:shadow-[0_14px_30px_-12px_color-mix(in_srgb,var(--primary)_70%,transparent)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100 ${
          p.fullWidth === false ? "" : "w-full"
        } ${held ? "opacity-55 blur-[0.7px] hover:bg-primary hover:shadow-none" : ""}`}
      >
        {c.busy ? (
          <>
            <svg viewBox="0 0 24 24" aria-hidden className="size-4 animate-spin">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
              <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            Processing…
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 fill-current opacity-90">
              <path d="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9h-2ZM9 7a3 3 0 1 1 6 0v2H9V7Z" />
            </svg>
            <span>{isTrial ? words : `${words} ${money(c.totalNow, c.product.currency)}`}</span>
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="size-4 shrink-0 fill-current transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            >
              <path d="M13 5l7 7-7 7-1.4-1.4 4.6-4.6H4v-2h12.2l-4.6-4.6L13 5Z" />
            </svg>
          </>
        )}
      </button>

      {p.note?.trim() && (
        <p
          className="text-center text-xs text-muted"
          style={{ ...FINE, ...set({ color: p.noteColor, fontSize: p.noteSize ?? undefined }) }}
        >
          {p.note}
        </p>
      )}

      <TrustBlock />
    </div>
  );
}

/**
 * Reassurance under the pay button, where hesitation actually happens.
 *
 * Part of the button rather than a block of its own, because the last line is
 * not decoration: naming the terms and the withdrawal right at the point of
 * payment is a disclosure obligation for EU/UK digital sales. A layout that
 * could drop it is a layout that can put this store on the wrong side of a
 * consumer-law complaint, so it travels with the thing that takes the money.
 *
 * Every claim here is one the code actually keeps: Stripe's Payment Element
 * owns the card fields so no card number reaches our server; access is granted
 * by finalizeOrder the moment payment succeeds; the refund window is the one
 * the policy pages state. No borrowed security-vendor badges.
 */
function TrustBlock() {
  const c = useCheckout();
  const items = [
    {
      label: "Stripe secure",
      icon: "M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm0 6a2 2 0 0 1 2 2v1h.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5H10v-1a2 2 0 0 1 2-2Zm0 1a1 1 0 0 0-1 1v1h2v-1a1 1 0 0 0-1-1Z",
    },
    {
      label: "Card never stored",
      icon: "M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4H4V6h16v2Zm0 10H4v-6h16v6Z",
    },
    {
      label: "Instant access",
      icon: "M13 2 3 14h7l-1 8 11-13h-7l1-7Z",
    },
  ];

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      {/* Stripe is on automatic payment methods, so what a buyer is offered
          depends on where they are — UPI in India, iDEAL in the Netherlands.
          Saying so beats listing marks that might be wrong for them. */}
      <p className="text-center text-xs text-muted" style={FINE}>
        Card, or whatever Stripe offers where you are — UPI, wallets, bank transfer.
      </p>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 shrink-0 fill-current text-navy">
              <path d={it.icon} />
            </svg>
            <span className="text-xs text-muted">{it.label}</span>
          </li>
        ))}
      </ul>
      {/* The policies as published, the same two the footer links to.
          These used to point at the in-app pages while the footer pointed at
          greaterinside.com, which is two different sets of terms for one
          purchase — and this is the copy the buyer is agreeing to. Either one
          alone is fine; two is the problem.

          Supplied by the page rather than read here: this is a client
          component and settings are server-side. Unset falls back to the
          built-in pages, so a store that publishes nothing external still has
          working links. */}
      <p className="text-center text-[11px] text-muted" style={{ fontSize: "0.69rem", lineHeight: 1.5 }}>
        By paying you agree to our{" "}
        <a
          href={c?.termsUrl || "/terms"}
          {...(c?.termsUrl ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="underline underline-offset-2 hover:text-fg"
        >
          terms
        </a>{" "}
        and{" "}
        <a href="/refunds" className="underline underline-offset-2 hover:text-fg">
          refund policy
        </a>
        .
      </p>
    </div>
  );
}

/**
 * The checkout as it shipped, for a store that has never edited it.
 *
 * The same seven components in the order somebody decides in: who am I, what
 * else do I want, how do I pay, what does it come to, pay. Kept as an
 * arrangement rather than a copy — there is one implementation of each piece,
 * so this cannot drift away from the edited version.
 */
export function DefaultCheckoutLayout() {
  return (
    <>
      <div className="flex flex-col gap-6">
        <BuyerDetailsSlot title="Your details" />
        {/* Before the bump, and well before the card: how you are buying the
            thing decides what the add-on beside it costs, and a decision that
            changes the total has to come before the total. */}
        <PriceChoiceSlot title="How you want to pay" />
        <OrderBumpSlot title="One more thing" />
      </div>

      {/* Summary, then card, then total and button.
          What am I buying, what does it cost, how do I pay — the order the
          questions actually arrive in. The card fields used to sit above the
          summary, which asked somebody to commit before the page had finished
          saying what to; and with a bump on the page the figure they had just
          changed was below the fold while they typed a number in. */}
      <div className="flex flex-col gap-5 rounded-3xl border border-border bg-surface p-6">
        <OrderSummarySlot title="Order summary" />
        <CouponSlot />
        <CardFieldsSlot heading="Payment" />
        <DueTodaySlot />
        <PayButtonSlot />
      </div>
    </>
  );
}

/**
 * A checkout that is not real, for the builder's canvas.
 *
 * Every figure is obviously a sample rather than a plausible one — a page being
 * designed against numbers that look live is a page somebody checks the maths
 * on and then trusts.
 */
export function previewCheckoutSlots(): CheckoutSlotValue {
  const noop = () => {};
  return {
    product: {
      slug: "sample",
      title: "Your product",
      tagline: null,
      priceCents: 4900,
      currency: "usd",
      coverUrl: null,
    },
    signedInEmail: null,
    fullName: "",
    setFullName: noop,
    email: "",
    setEmail: noop,
    emailHint: null,
    acceptEmailHint: noop,
    country: "",
    setCountry: noop,
    captureEmail: noop,
    bump: null,
    bumpAlt: null,
    bumpOptions: [],
    prices: [],
    pricePick: 0,
    setPricePick: noop,
    bumpChoice: "none",
    setBumpChoice: noop,
    bumpRef: { current: null },
    chosenBump: null,
    bumpUnanswered: false,
    priceUnanswered: false,
    coupon: null,
    couponInput: "",
    setCouponInput: noop,
    couponBusy: false,
    couponError: null,
    applyCoupon: noop,
    totalNow: 4900,
    busy: false,
    error: null,
    canPay: true,
    notePaymentInfo: noop,
    preview: true,
  };
}
