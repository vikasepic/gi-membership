# A Stripe invoice for every purchase (13 Nov 2026)

Buyers get a receipt after paying, and some have asked for a proper invoice for their accounting. The owner shared the invoice Circle sends (Invoice BAX66ALG-0003, "Greater Inside, 103 Ajuga Court, Lakeway, Texas 78734", bill to "WINR GmbH") and wants the same from Grow.

## What the owner decided

- Every transaction on the member's account page (`/account`, "Your purchases") offers **both** documents: **Receipt** and **Invoice**. Either can be downloaded.
- **Everything comes from Stripe.** Grow keeps no copy, adds no table and no column. The invoice is Stripe's own invoice, so it matches Circle's exactly: same Stripe account, same business name and address, same orange (#c8653d), Stripe's own numbering.
- **Bill to** shows the name, email and address on the buyer's Stripe customer. No tax/VAT ID field.

## Why it looks like Circle's for free

Circle bills through the same Stripe account as Grow. That account's public details are already "Greater Inside, 103 Ajuga Court, Lakeway, TX 78734, US" with branding #c8653d, and Grow's subscription invoices already render from that template. The gap is one-off purchases: Stripe makes no invoice for a PaymentIntent, and 337 of the 426 paid live orders are one-off.

## Approaches considered

- **A. Stripe makes the invoice, on demand (picked).** The first click on Invoice asks Stripe to make one for the payment already taken, marked paid and dated the purchase day. Identical to Circle's, works for past orders. Costs Stripe's invoicing fee per paid invoice (about 0.4 to 0.5%; confirm the rate on the account). On demand means only invoices someone wants are paid for.
- **B. Grow draws a lookalike page.** No fee, but its own numbering, business details kept in two places, and it is not the same document. Rejected: the owner wants Stripe's.
- Stripe Checkout's built-in invoice option was ruled out: Grow takes payment with its own PaymentIntents, not Stripe Checkout.

## How it behaves

- **One-off order, first click on Invoice:** Grow creates a Stripe invoice for the order's Stripe customer, with one line per order line (bump included; a coupon shows so the total equals what was charged), dated the purchase day, paid by the order's existing payment. Stripe never collects again. Then the member is sent to the invoice (hosted page or PDF).
- **Later clicks** open the same invoice. The invoice id is remembered **in Stripe**, on the PaymentIntent's metadata, so Grow stores nothing. Two quick clicks must not make two invoices (an idempotency key on the create).
- **Before the invoice is made**, if the Stripe customer has no name, Grow copies in the member's name from Grow (every buyer has one). It never overwrites a name the buyer set.
- **A line above the buttons:** to put a company name or address on the invoice, update it under Manage billing first; an invoice can't be changed once it's made. Manage billing is Stripe's existing portal, which already allows name, email, address and phone.
- **Receipt** stays as today: the charge's Stripe receipt.
- **Subscription first payments and renewals** already have a Stripe invoice; they show its Invoice next to the Receipt of the charge that paid it. Nothing is created for them.
- **No button** where Stripe has nothing to show: a $0 order, an order with no Stripe customer (2 today), an app-billed order (already hidden), an order from the other Stripe mode.
- **Refunds** don't change the invoice; the refund shows on the receipt and on the purchase row, as today.

## Must not happen

- A new paid invoice must not be read by Grow's own Stripe webhook as a renewal or a new order. Check every `invoice.*` handler; mark the invoice with `metadata.store_created = "true"` and the order id so it is recognisable.
- No change to account-wide Stripe settings (default portal configuration, invoice settings, branding). Five other apps share this account.
- No invoice email from Stripe to the buyer; the account page is the only way in.
- A member can only make or open an invoice for their own order.

## Found while writing the scenarios

- The 140 orders that started a subscription with a paid first charge (no PaymentIntent on the order, no invoice id on it) show "No receipt" today, though Stripe holds a `subscription_create` invoice and its charge for each. They get both documents from that invoice.
- `subscriptionInvoicesForUser` lists every invoice on the customer, so a new one-off invoice would also appear under "Subscription invoices". It must list subscription invoices only.
- Safe already: `recordRenewal` and the nightly reconcile ignore an invoice with no subscription and a `manual` billing reason.

## The five scenarios (owner, 13 Nov: written and tested before any feature code)

Each is drawn from a real shape in the live orders and becomes a test in Stripe test mode before the feature is written. Passing means every point holds.

1. **One offer, one payment** (Foundations Weekend: one line, one PaymentIntent; 109 live orders of this shape). First click makes one invoice: Greater Inside's address, bill-to name and email, one line at the charged amount, paid, dated the purchase day. A second click, and two clicks at once, open that same invoice. No new order, no receipt email, no Meta, GA4 or affiliate event, nothing under "Subscription invoices", no reconcile mismatch.
2. **Product, bump and coupon in one payment** (22 orders; 2 whose lines don't add up to the total). One invoice, one line per item, the discount shown, the total equal to the charge to the cent. If the stored lines can't explain the charge, the invoice is one line at the charged amount: never an invoice that disagrees with the money.
3. **One-off and a subscription in the same checkout** (product + bump + a trial; 21 orders). The invoice covers the one-off payment only. The subscription's own invoices stay its own, and nothing is counted twice.
4. **Subscriptions: first payment, renewals, payment plans** (140 first payments up to a $1,667 instalment, 89 renewals). Nothing is created. Each row shows Stripe's existing invoice and the receipt of the charge that paid it. A $0 trial start shows neither.
5. **Refunds** (full, partial, and a refund after the invoice was made; 15 refunded orders). Grow's refund handling is unchanged: access revoked and the sale reversed in Meta and the affiliate tracker once. The invoice stays as made, the refund shows on the receipt and the row. A fully refunded one-off still offers its invoice *(my call: the buyer paid, and an accountant wants the invoice next to the refund)*.

After deploy, one live check on a team-owned order, with the owner's go-ahead (it costs Stripe's fee on that one invoice).

## Not included

- A tax/VAT ID field.
- Credit notes for refunded one-off orders.
- Emailing the invoice, or a link in the receipt email.
- Any admin screen for invoices.

## Left to the builder

- Paying the invoice with the existing PaymentIntent (Stripe's attach-payment call, available on the SDK in use, v22) versus marking it paid out of band. Prefer attach, so the invoice shows the real card payment; fall back only if Stripe refuses it for older payments.
- Hosted invoice page or direct PDF as the Invoice link.
- The exact wording of the hint line.
