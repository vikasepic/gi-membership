/**
 * The Open Graph product tags, as `property=` attributes.
 *
 * Next's metadata `other` writes `<meta name=…>`, and Facebook and LinkedIn
 * read `property=` for these, so a card built through metadata was a product
 * to nobody. React hoists a `<meta>` rendered here into the head.
 */
export function SaleTags({ priceCents, currency }: { priceCents: number; currency: string }) {
  return (
    <>
      <meta property="og:type" content="product" />
      <meta property="product:price:amount" content={(Math.round(priceCents) / 100).toFixed(2)} />
      <meta property="product:price:currency" content={currency.toUpperCase()} />
    </>
  );
}
