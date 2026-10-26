# Recent buyers popup

Design, 26 Oct 2026. Approved mockup: `.superpowers/brainstorm/71362-1793004164/content/card-style-v2.html`, row 2 (product picture).

## What it is and why

A small card that rises in the bottom corner of Grow's public pages and names one real recent buyer:

> [product picture with a green check] **Priya** [flag]
> enrolled in **Book to Bestseller**
> 2 hours ago · ✓ Verified

The owner wants the social proof other sales pages have: proof that real people are buying this right now. Every card must be a real purchase. A made-up or misleading card would be worse than no card, because the "Verified" label is a claim about a fact.

## Where it shows

| Page | Route | Whose purchases |
|---|---|---|
| Offer sales page | `/o/[key]` | that offer's |
| Product sales page | `/p/[slug]` | that product's |
| Upsell page | `/checkout/oto` | the upsell offer's |
| Home page | `/` | every offer and product whose own switch is on, mixed |

Never on: checkout pages (`/checkout`, `/checkout/offer`), thank-you, library, account, login, legal pages, admin, or the builder canvas.

`?preview=1` (admin preview) shows it, with real data, so the owner can see it before publishing. Builder's call.

## What a card says (owner's rules)

- **Real purchases only.** Never generated, never padded.
- **First name only**, plus the buyer's **country flag**.
- **The last 15 to 20 purchases, never older than 14 days.** Builder takes 20 as the cap.
- **Real age** in the time line: "12 minutes ago", "4 days ago". Never rounded down to look fresher.
- **Trials count as purchases** and read the same as paid ones.
- **Each page shows its own product's buyers; the home page mixes all of them.**
- **A product page counts everyone who now has that product**, whether they bought it on `/p/...` or through an offer that grants it (`offers.grant_product_id`), so both pages show the same buyers (owner, 26 Oct). An offer page counts that offer's own buyers.
- **The product's picture** is the card's image on every page (approved mockup row 2), with a green check on its corner.
- With few purchases, show the few; the list loops.

Verb: "enrolled in" for courses and programmes, "joined" for apps and subscriptions. Builder's call on the exact mapping; it must never say "bought" for a trial, because no money moved.

## Settings (owner's rules)

Store settings, a new group "Recent buyers":
- **Gap between cards** (seconds).
- **How long each card stays up** (seconds).
- **Home page on/off.**

On every offer and product edit form: **Show recent buyers** (on/off). One switch decides everywhere that item's buyers appear: its own page and the home page mix (owner, 26 Oct).

**Default on, for existing and new items** (owner, 26 Oct). Cards appear on every sales page the moment this deploys, including Foundations Weekend and the 90-Day AI page, whose bars are page custom JS. Row 15 must therefore be verified on those live pages before the push, not after.

On the member's admin page: **Hide from recent buyers** (owner, 26 Oct). Hides that person everywhere, past and future purchases. A column on `users`, in the same migration.

## What counts as a purchase

Source: `orders` joined to `order_items`, one card per order item that names an offer or product.

Included:
- `orders.status = 'paid'`, `livemode = true`.
- First purchases and trial starts (a $0 trial order is a purchase, per owner).
- Bumps and upsells, as purchases of their own offer: a bump bought with Book to Bestseller is a buyer on the bump offer's page, not on Book to Bestseller's.

Excluded, and why:
- **Renewals** (`stripe_invoice_id is not null`). A renewal is the same buyer paying again, not a new buyer. Note from AGENTS.md: a renewal has no PaymentIntent; key on the invoice id, not on the intent being null.
- **Refunded, pending, disputed** orders. A refund removes the card on the next page load.
- **Test-mode orders** (`livemode = false`). Two exist in production (memory: test orders live in production).
- **Admins** (`users.is_admin`). The owner's own test purchases must never appear as a customer.
- **Hidden buyers** (the new `users` column above).
- **Grants and app-billed access** (ownership rows with no order). No money or trial went through Grow, so "Verified purchase" would be wrong.

## Where the name and flag come from

- **Name:** `users.username` holds the full name (36 of 41 recent buyers have a space in it). Reuse `firstNameOf` from `lib/post-purchase-email.ts`, which already drops an email typed into the name field.
- **Country:** `orders.buyer_country`, else `users.country`. Both store the ISO code from the card.

## How it is built (decided)

- **Loaded after the page, never during it.** The pages are `force-dynamic` and take money. The cards come from a small public API read after the page has rendered, cached about a minute, and every failure is silent: no cards, nothing else changes. Same rule as `lib/traffic.ts` (AGENTS.md: counting is fire-and-forget on pages that take money).
- **The API returns only what the card shows:** first name, country code, product name, picture URL, purchase time. Never email, user id, order id, amount, or city.
- **Time is computed in the browser** from the purchase timestamp at the moment the card appears, so a tab left open for an hour does not show "2 minutes ago".
- **Flags are images, not emoji.** Windows does not draw flag emoji; it shows the letters "IN". Flags must render on Windows, macOS, iOS and Android.
- **Per-visit memory** in `sessionStorage`: closing a card stops cards for the rest of the visit, across pages. Wrapped in try/catch; private windows can throw.
- **Settings** live in the existing settings JSONB blob (`lib/settings-schema.ts`, a new group in `SETTINGS_GROUPS`). The per-item switch is a column on `offers` and on `products`, so a migration. Next free number: check `ls supabase/migrations | tail -1` (0095 at time of writing) and any open spec. Apply it to production by hand before the deploy (AGENTS.md).

## What can go wrong, and the fix for each

**Data**

| # | What happens | Fix |
|---|---|---|
| 1 | A page has no purchases in 14 days | No cards at all. Never an empty card or a placeholder. |
| 2 | A page has 1 or 2 buyers, and a visitor stays 10 minutes | The same two names cycle 30 times and look fake. Show the list twice through, then stop for that page view. (Builder's call; owner said "loop", this caps it.) |
| 3 | One person buys the main offer, the bump and the upsell in one go | Home page: one card per order (the main item). Other pages: one card per person per page, so a buyer who reached a product two ways appears once. |
| 4 | The same person buys twice in a week | Show their most recent purchase once per page. |
| 5 | A renewal is mistaken for a buyer | Excluded by `stripe_invoice_id`. Test: a renewal order never appears. |
| 6 | Refunded or disputed after the card was shown | Gone on the next load (cache is about a minute). |
| 7 | Test purchase or the owner's own purchase appears | Excluded by `livemode` and `is_admin`. Test both. |
| 8 | Name is empty, an email, one letter, or "test" | Skip that purchase. Never "Someone". |
| 9 | Name typed in capitals or lowercase ("PRIYA", "priya") | Capitalise the first letter of Latin names. Leave non-Latin scripts as typed. |
| 10 | No country stored | Card without a flag. Never a guessed flag. |
| 11 | Product has no picture | Fall back to the initial in a navy circle (mockup row 1). |
| 12 | Item's switch turned off, or no longer for sale | Its buyers drop out of its page and the home page mix. |
| 13 | The visitor is signed in and is one of the buyers | Skip their own purchase. |
| 14 | The newest card is older than the second | Order is always newest first. |

**Page and layout**

| # | What happens | Fix |
|---|---|---|
| 15 | A sticky bar sits at the bottom (upsell sticky bar `components/oto/sticky-bar.tsx`; Foundations Weekend's seat bar is page custom JS, so not known to the code) | Before showing, measure fixed elements touching the bottom of the viewport and sit above the tallest. Must work for bars the code does not know about. |
| 16 | On a phone the card covers the buy button | Full-width card above any bar, short duration, never shown in the first few seconds, closable with a large enough × (44px tap target). |
| 17 | A chat widget sits bottom-right | Card stays bottom-left on desktop. |
| 18 | Page custom CSS restyles generic classes | Card styles are scoped (own class prefix) and survive page CSS. |
| 19 | The card shifts the page | It is fixed-position; no layout shift (CLS). |
| 20 | Builder canvas or iframe preview | Never in the editor canvas. |

**Settings**

| # | What happens | Fix |
|---|---|---|
| 21 | Gap set to 0 or 1 second | Clamp gap to 5 to 120 s and duration to 3 to 15 s, in the schema, with the form saying the limits. |
| 22 | Duration longer than the gap | Validation rejects it; the next card would arrive while one is up. |
| 23 | Default on means cards go live everywhere on deploy day | Owner chose on. Before the push, open every live sales page with a fixed bottom bar (Foundations Weekend, 90-Day AI, any upsell) at phone width on a branch preview or locally with production-shaped rows, and check the card clears the bar. |

**Privacy and honesty**

| # | What happens | Fix |
|---|---|---|
| 24 | A buyer is recognisable from first name plus country in a small market | First name and flag only, never city. The privacy policy names this use. The admin can hide a buyer from the member page. |
| 25 | Someone scrapes the API for a buyer list | It only ever returns the 20 cards the page would show anyway, with no email or ids. |
| 26 | Screen readers announce every card | No live-region announcements; the card is decorative to assistive tech except its close button. |
| 27 | Reduced motion | No rise animation; the card simply appears. |

## Non-goals

- Clicking a card does nothing (no link to the product).
- No prices or amounts on cards.
- No made-up, seeded or "example" buyers, ever.
- No city, no last-name initial, no photo of the buyer.
- No analytics events for card views in this version.

## Left to the builder

- Exact card spacing, within the approved mockup.
- Verb mapping per product type ("enrolled in" vs "joined").
- First-card delay (a few seconds).
- Flag source (an image set; must render on Windows).
- API route name and cache method.
- Whether `?preview=1` shows real cards (recommended yes).
