import "server-only";
import { stripe } from "@/lib/stripe";

// Stripe Tax for digital goods. The store sells to EU/UK consumers, where VAT
// is owed at the BUYER's country rate — so checkout must collect a country and
// the charged amount must include the calculated tax.
//
// The $27 front-end product is a raw PaymentIntent, which Stripe Tax does not
// calculate automatically (unlike Checkout Sessions or Subscriptions). We use
// the Tax Calculation API: calculate -> charge price+tax -> record a Tax
// Transaction after payment so the sale appears in Stripe's tax reporting.

export const TAX_ENABLED = process.env.STRIPE_TAX_ENABLED === "true";

export function normalizeCountry(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

// Stripe cannot compute VAT without a buyer location, so when tax is on we must
// have a country before creating the PaymentIntent.
export function needsTaxLocation(taxEnabled: boolean, country: string | null): boolean {
  return taxEnabled && !country;
}

// The one message, defined where the browser can also read it.
export { COUNTRY_REQUIRED } from "@/components/checkout/checkout-types";

// Prices are entered tax-EXCLUSIVE in admin, so tax is added on top.
export function orderTotalCents(priceCents: number, taxCents: number): number {
  return priceCents + Math.max(0, taxCents);
}

export type TaxResult = {
  taxCents: number;
  totalCents: number;
  calculationId: string | null;
};

// Returns zero tax (and no calculation) when tax is disabled or no country is
// known, so the money path keeps working exactly as before until tax is on.
export async function calculateTax(args: {
  priceCents: number;
  currency: string;
  country: string | null;
  reference: string;
}): Promise<TaxResult> {
  const { priceCents, currency, country, reference } = args;
  if (!TAX_ENABLED || !country) {
    return { taxCents: 0, totalCents: priceCents, calculationId: null };
  }

  const calc = await stripe().tax.calculations.create({
    currency,
    customer_details: {
      address: { country },
      address_source: "billing",
    },
    line_items: [
      {
        amount: priceCents,
        reference,
        // Digital services: the EU/UK VAT place-of-supply is the buyer's country.
        tax_code: "txcd_10000000",
      },
    ],
  });

  const taxCents = calc.tax_amount_exclusive ?? 0;
  return {
    taxCents,
    totalCents: orderTotalCents(priceCents, taxCents),
    calculationId: calc.id ?? null,
  };
}

// Records the sale against the calculation so it lands in Stripe's tax reports.
// Never throws into the purchase flow — a reporting failure must not undo a
// completed payment; it is logged for reconciliation instead.
export async function recordTaxTransaction(
  calculationId: string,
  reference: string,
): Promise<void> {
  try {
    await stripe().tax.transactions.createFromCalculation({
      calculation: calculationId,
      reference,
    });
  } catch (e) {
    console.error("[tax] failed to record transaction for", reference, e);
  }
}
