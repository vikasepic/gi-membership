# Journeys report and a read-only login (18 Nov 2026)

Two things, built together because the second exists to show the first:

1. **Journeys**: an admin page that shows, per buyer, what they bought first, what they bought later, and what they have spent.
2. **A read-only login** for the ads team, which opens Journeys, Transactions, Members, Traffic and Attribution and can change nothing.

## Why

On 17 Nov the ads team (Nanjunda) asked for the spend of customers "acquired from evergreen sales campaigns": people who bought an evergreen product first (Digital Product Validator, Micro-Product Builder, Book Writer) and later bought a programme (Foundations Weekend, 90 Day AI Team Build). They tried ActiveCampaign tags. A tag says a person has a product, not when they got it or whether they paid, so the order of purchases cannot be read from tags. They also suspect some people hold an evergreen product only because it came free with a programme.

Grow has the answer for everything it sold: every order with its date, amount, lines and ad source, and every access record with whether it was bought or given. What it lacks is a screen that lays this out per person, and a way to let the ads team look without making them full admins. Today a login is either a member or an admin who can refund, grant access and change settings.

The owner decided (18 Nov): Grow's own data only, no Stripe pull. Grow's orders start on 12 Aug 2026 and Book Writer is sold outside Grow (3 orders here), so Book Writer buyers from elsewhere will not appear. The page says so.

## What exists today

- `lib/money-data.ts` `loadMoneyData()` reads users, orders, order lines, subscriptions and access once, paged past PostgREST's 1000-row cap. Transactions, Members, the person page and both CSV exports are pure derivations over it (`lib/member-money.ts`, `lib/ledger.ts`). Journeys is one more derivation over the same rows.
- The loader's access rows do not carry `source`, `granted_by` or `created_at`. Journeys needs `granted_by` and the date to show "given" access.
- An order line's `kind` is `product`, `bump`, `oto` (any offer, on its own sales page or as an upsell) or `renewal`. A bump and an accepted upsell are both extra lines on the same order (`lib/checkout.ts`, the upsell insert near line 2177), so one order is one checkout. `lib/ledger.ts` already tells an order's purchase line from its upsell and add-on lines.
- `orders.total_cents` is not updated when an upsell is accepted, so an order's value is the sum of its lines. On 18 Nov two live orders differ, by $246 together. Members' "Total paid" sums `total_cents` and so runs low for those two people; that is an existing fault, outside this work, reported to the owner.
- 145 of the 434 paid live orders are $0: trial starts and 100% coupons. 86 of 311 people with a paid order have only $0 orders. Members already ignores $0 orders when counting payments.
- `orders.host_offer_id` is the offer the order was opened for (null on a product order). `orders.livemode` marks test orders. `loadMoneyData()` already drops app-billed orders (`isAppBilledOrder`). Refunds are whole-order only.
- An access row that is later bought keeps its first `created_at` and has `source` overwritten, so "given, then bought" reads as bought.
- `sourceOf(utm, referrer)` in `lib/member-money.ts` turns an order's labels into "meta / campaign", a referrer host or "direct".
- Admin access (`lib/admin-guard.ts`): an email in `ADMIN_EMAILS`, or `users.is_admin`. `proxy.ts` gates every `/admin` path with one lookup; `requireAdmin()` repeats the check in every server action and admin API route and is the security boundary. `getAdminUser()` and `userIsAdmin()` are the same check for View as, draft previews and course previews.
- Only the service role can write `public.users` (no policies, no grants to `anon` or `authenticated`, checked on production 18 Nov), so a member cannot flag themselves.
- The person page (`app/admin/members/[id]/page.tsx`) carries most of the buttons that change something: refund, extend trial, cancel subscription, revoke access, grant more, admin switch, hide from recent buyers, View as, change email, delete. Transactions has the refund button; Members has Add member.

## Approaches considered

For the read-only login:

- **A. A switch on a member plus a short list of pages (picked by the owner).** `users.is_viewer`, set by an admin on the person page. The proxy lets a viewer into a fixed list of admin pages and nothing else. Everything that changes data keeps `requireAdmin()`, which a viewer never passes. Closed by default: a new admin page is shut to viewers until it is added to the list. One migration.
- **B. A list of read-only emails in the environment, like `ADMIN_EMAILS`.** No migration, but adding or removing a person means editing server settings and redeploying.
- **C. A separate reports area outside the admin with its own copies of the pages.** Strongest separation; two copies of Transactions and Members to keep in step.

For the report, the owner picked a page inside the admin over a spreadsheet export, so the ads team can come back to it.

## Journeys: what it shows

Address `/admin/journeys`, in the sidebar's Customers group, labelled "Journeys".

**Who counts.** A buyer is a person with at least one purchase, as defined below. Orders considered are paid and live (`livemode` not false); app-billed ones are already gone from the loader. A refunded order is not a purchase. Admins and read-only people are left out, as team accounts. *(My call.)*

**One order is one purchase.** Its bump and any upsell taken with it are lines on the same order and count as "bought with it", in that order's value. Two orders are two purchases even minutes apart (19 orders on 18 Nov follow the person's previous one within the hour); the list shows each date and time, so a same-day second purchase is plain to see. An order's value is the sum of its lines, never `total_cents`.

**A free start is not a purchase until it pays.** *(My call, the one the owner should check.)* A $0 order (a trial start or a 100% coupon) is shown on the person's row as "started free". If its subscription later takes money, it becomes a purchase of that product, dated the day it started, and its renewals count in total spent. Until then it is not a purchase, and a person with nothing but free starts is not a buyer. Renewals are never a purchase of their own.

**What a purchase is called.** The product or offer as it was sold, named as Transactions names it. Two offers that open the same thing (Foundations Weekend and Foundations Weekend Mindvalley) stay two rows, because they are two funnels. *(My call.)*

**First purchase.** The purchase line of a person's first purchase, never a bump or an upsell.

**Later purchases.** The purchase line of each later one, in date order.

**Given access.** Access an admin gave by hand (an `ownership` row with `granted_by` set), and courses added by hand, are shown on the person's row marked "given", with the date where one is recorded. *(Corrected during the build, 18 Nov: `source = 'grant'` alone is not "given". The offer checkout writes it for every offer it sells: 309 rows in production against 25 hand grants.)* They are never counted as purchases or in spend. This is the answer to the bundle question.

**The summary table.** One row per first purchase:

- buyers
- average value of the first checkout (the true order value of that funnel, bumps and upsells included)
- how many bought something again later, as a count and a share
- for each product bought later by at least one of them: how many of this row's buyers went on to buy it, as a count and a share (so "bought the Validator first, then Foundations Weekend" is a cell)
- average total spent per buyer, refunds taken off, renewals included

**The people list.** One row per buyer: email, first purchase with its date and ad source, what was bought with it, each later purchase with its date, anything started free or given, and total spent. A row opens the person page. The ad source is first-touch (`sourceOf` on the first order's `utmFirst`), as Members shows it.

**Filters.** A date range on the first purchase: all time (the default), last 90 days, last 30 days. Traffic's presets stop at 90 days and would hide most of a history that starts 98 days ago. Values come off the URL as a whitelist; an unknown value picks the default.

**Download.** A CSV with one row per line: person, purchase number, date and time, product, how it was got (first, bought with, later, renewal, started free, given), amount, first-touch and last-touch ad source. Long format, so it pivots in a spreadsheet.

**The note on the page.** One line saying what is covered: sales made on Grow since 12 Aug 2026, and that Book Writer and anything sold elsewhere is not included.

## The read-only login: what it does

- An admin opens a member's page and switches on "Read-only access". The switch sits by the admin switch, is itself admin-only, and is not offered on an admin (an admin already sees everything).
- A read-only person signs in on the normal login. In the admin they can open **Journeys, Transactions, Members (list and person page), Traffic and Attribution**, with every sub-page and CSV download under those. *(Attribution is my addition to the owner's list; it holds ad sources and visits.)*
- Any other `/admin` address sends them to Journeys. `/admin` itself (Products) does too.
- Their sidebar lists only those five. No badges, nudges or links to anything else.
- On those pages, every control that changes something is not rendered for them: refund, add member, extend trial, cancel subscription, revoke access, grant more, the admin and read-only switches, hide from recent buyers, View as, change email, delete member.
- They keep their normal member side (library, account) like anyone else.

## Must not happen (guard rails)

- **A read-only person changes nothing, whatever they send.** `requireAdmin()`, `getAdminUser()` and `userIsAdmin()` never pass for a viewer. Every server action and write route keeps them. A hidden button is tidiness; this is the boundary. Tests call the real actions as a viewer and see each refused with nothing written and no Stripe call.
- **Closed by default.** The pages a viewer may open are one fixed list in one module, read by the proxy, the sidebar and the tests. A path not on it is refused. Matching is on whole path segments, so `/admin/membership-anything` does not ride on `/admin/members`.
- **The viewer pages check for themselves.** Each page and export route on the list calls a guard that passes for an admin or a viewer, so the boundary is not the proxy alone. Traffic and Attribution call no guard today and get this one; the two existing exports move from `requireAdmin()` to it.
- **No View as, no previews.** A viewer cannot view the store as a member, open draft pages, or play a course they do not own.
- **A lookup failure denies.** As with the admin gate today.
- **The proxy stays one lookup.** `is_admin` and `is_viewer` come from the same query.
- **The owner cannot be locked out or demoted.** `ADMIN_EMAILS` still wins over both columns.
- **The migration goes first.** `0100`, applied to production by hand with `notify pgrst, 'reload schema';` before the push, since the proxy reads the column on every `/admin` request.

## Changed after the first release (18 Nov 2026)

Decided by the owner or found in the final review, all on the day it shipped:

- **Coupon codes are hidden from read-only people** (owner): on Transactions, Members, the person page and both older downloads.
- **Making or removing an admin clears read-only access**, so the two flags never sit together unseen.
- **Every admin page outside the five asks for an admin itself**, first. The proxy is no longer the only thing in front of them. `app/admin/viewer-refused.test.ts` opens each page and calls each action as a read-only person.
- **Given** also leaves out a grant that was taken back and one the person has since bought.
- **A free start counts once its subscription holds a payment**: a single payment that was refunded puts it back to a free start. An order counts when any of its lines' subscriptions has paid.
- **A purchase is named for what was paid for.** A paid bump or upsell beside an unpaid trial or a 100% coupon is a purchase of the paid line; the free thing is "bought with" it.
- **A path segment is decoded before it is judged**, so a name that only needed encoding opens and an encoded `..` or `/` does not.
- **All three downloads** make a cell that starts like a formula plain text.

## Non-goals

- Pulling Stripe or ActiveCampaign into the report.
- A filter by ad source or campaign on the page. The source is on every row and in the CSV; a filter can follow if they ask.
- A list of which products are "evergreen" and which are "programmes". The table groups by first purchase and needs no such list.
- Per-page permissions, more roles, or an audit log of what a viewer opened.
- Hiding customer emails or amounts from viewers. The owner accepted that they see them.
- Opening Subscriptions, Checkout, Errors, Settings or any editor to viewers.

## Constraints

- One migration: `users.is_viewer boolean not null default false`. Read the migration list again before numbering.
- Journeys reads through `loadMoneyData()`; the two extra access columns are added there, not in a second loader.
- Anything that grows is read with `allRows`.
- Copy follows the house style: plain words, no em dashes.
- Local test fixtures are prefixed `zz-` with a timestamp and cleaned up in FK order.

## Left to the builder

- How a checkout is detected in code, within the rule above.
- The layout of the summary table when many products appear as "bought later".
- Where a read-only person lands after signing in, and how the layout learns the role without a second lookup per page.
- Whether any client component on the five pages calls an admin-only API route for reading, and moving just those reads to the admin-or-viewer guard. One is known: the layout's deploy notice bar reads `/api/deploy-notice`. A viewer should still see the bar; sending a notice stays admin-only.
- Currency: follow whatever Members does when orders are not all in one currency.
