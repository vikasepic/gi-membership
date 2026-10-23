# Lessons

Append-only. One entry per mistake that cost a review round or a production
incident, with the rule it produced. Newest at the bottom. Add yours in the
same PR as the fix — a lesson that arrives a week later teaches nobody.

Format: **date — what happened — the rule.** Keep each under ten lines. Link
the commit or migration when there is one.

---

**2026-09-07 — a test read a fixture another suite had just created.**
`getStandingOffer` had no `ORDER BY`; two suites ran in parallel against one
local store and the wrong offer came back one run in three. Rule: every query
that picks one row orders on a total key (`created_at`, then `id`); fixtures
are prefixed `zz-` with a timestamp; cleanup runs in FK order in `afterAll`.

**2026-09-08 — a feature was green everywhere and could not save.**
tsc, vitest and `next build` all passed; a CHECK constraint on the table
refused the row. Rule: constraints are invisible to the type system. Read the
migration for the table you write to, and put a source assertion on any
CHECK a feature depends on.

**2026-09-09 — main's CI was red for two days and nobody looked.**
Twelve pushes, all verified "3,650 green" locally and deployed. `.env.local`
supplied the service key here; CI had none, so seven tests that reached the
database failed every run. Rule: `gh run list --branch main --limit 1` after
every push. Reproduce CI by moving `.env.local` aside. A unit test of a server
action mocks every `@/lib/*` module that opens a service client. A test pasted
after its `describe.skipIf(!canRun)` closes registers at top level and runs on
CI with no database.

**2026-09-09 — `deploymentId` had never been set in production.**
`process.env.SOURCE_COMMIT || undefined`; Coolify sets that on the container
but passes only `COOLIFY_BUILD_SECRETS_HASH` into `docker build`, so it was
undefined at build time and no asset was ever stamped. Every deploy broke the
open tabs — a dead back button in the morning, a "404" on the app link after
the Next 16 deploy (`E10 router state header could not be parsed`, twelve
times in the log). Rule: `deploymentId` is minted at build in
`next.config.ts` and must never be undefined. When somebody reports "clicking
X gives 404" right after a deploy, check for `dpl=` on `/` and that log line
before debugging the page. (`dd04487`)

**2026-09-09 — both built-in app offers granted the wrong thing.**
`the-micro-product-builder` granted the Book Writer app; `the-viral-hook-
generator` granted a product called "test". Nobody could ever own either app.
And the non-owner redirect guessed `/o/<app key>`, a URL no offer has, so
every signed-in visitor hit the 404 page. Rule: an offer that sells a built-in
app grants *that app* — read it back after saving. The redirect looks the
offer up by `grant_app_id` (`offerSellingApp`) and falls back to `/library`.
A grant made while the offer was wrong stays wrong: revoke, then grant again.
(`ffc3e82`)

**2026-09-09 — a PR could not build for production and its CI was red for a different reason.**
`package-lock.json` was out of step with `package.json` (three packages
missing), and the Dockerfile runs `npm ci`. Rule: `npm ci` from a clean
checkout is part of "done". And read *why* CI is red before assuming it is
the PR: here the seven failures were main's, pre-existing.

**2026-09-09 — a production config carried a workaround for one machine.**
A worktree's symlinked `node_modules` made Turbopack refuse the build; the
fix offered was `turbopack.root: join(__dirname, "..")` — which resolves to
`/` inside the Docker image. Rule: a worktree gets a real `npm ci`. Build
config never carries a fix for a scratch checkout.

**2026-09-09 — `new Map(owners)` made the offer win a collision the comment said the product would win.**
A `Map` built from an array keeps the *last* entry for a duplicate key. The
mis-resolved owner then chose the wrong checkout path and the product's real
hits vanished into "other pages". Rule: when order decides a collision,
build first-wins explicitly with a loop that skips a present key, and test the
collision. (`0a3f95d`)

**2026-09-09 — three assertions could not fail.**
`expect(text()).not.toContain(">4<")` — `textContent` never contains markup.
A source-text match on `host_offer_id` that another function also contained.
A test whose expected order contradicted the sort it was testing. Rule: before
trusting a green test, ask what change would make it red. Cell-level DOM
reads over `textContent`; behaviour tests over source scans where a fixture
is possible; hand-check an expected ordering against the fixture's numbers.

**2026-09-09 — a filter said "showing views from meta" and showed all-source numbers.**
It kept rows whose *busiest* source matched and recomputed nothing. Then, with
orders forced to zero under the filter, every trafficked funnel reported
"100% at the sale" and won the leak sort. Rule: filter the raw rows *before*
shaping, and compute derived figures only over the steps that are actually
known under that filter. The page must not assert a number it has just
declared it does not have. (`3e380e5`, `33e754a`)

**2026-09-09 — a column was added after the card is charged.**
`orders.host_offer_id` is written in `completeOfferCheckout`, which runs after
the PaymentIntent succeeds. Deploying the image before the migration would
charge the buyer and then fail the order. Rule: migration on production, then
`notify pgrst, 'reload schema'`, *then* the deploy — and verify the API can
see the column before pushing. (`0077`)

**2026-09-10 — a builder canvas was blank while the preview beside it rendered.**
`BlockCanvasField` declared `store` in its props type, never destructured it,
never passed it on. Type-checks fine, silently drops the payload. The mirror
image had been fixed once before on the preview side. Rule: three render
paths draw the storefront blocks; a test pins all three, because each is
wired separately and one can be fixed while another stays broken. (`7905965`)

**2026-09-10 — "not mobile responsive" was six layout defects and zero overflows.**
An overflow probe over every page at 375px found one real blowout (a pasted
URL in a lesson body) and nothing else; the app screens looked fine to it.
The screenshots told a different story: the app header truncated the app's
own name, both composers clipped their placeholder, the coach's reply box
sat 43px below the fold, a progress line was crushed beside a two-line
button, a heading collided with its kicker. Rule: a probe proves the page is
not wider than the phone; only a rendered screenshot at 375px proves it
works. Take the screenshot before saying a page is responsive. Rules that
came out of it: a chat composer on a phone is `sticky bottom-0` with
safe-area padding and the page scrolls — never a fixed-height pane taller
than the viewport; Enter sends only where `(pointer: fine)`; anything a
client can paste (`body_html`) gets `[overflow-wrap:anywhere]` plus
`max-w-full` on img/iframe/video and `overflow-x-auto` on pre/table; a
`flex justify-between` row with text on both sides needs `flex-wrap` or
`sm:flex-row` before it ships. (`components/mobile-layout.test.tsx`)

**2026-09-10 — a red test was pushed because `&&` checked `grep`, not vitest.**
`npx vitest run | grep -E "×|Tests"` && commit && push: grep found lines, so
it exited 0, and the chain carried on past a failing suite. Main went red
twice in ten minutes. Rule: `set -o pipefail` at the top of any chain that
pipes a test runner, or run the suite bare and gate on its own exit status.
And run the FULL suite before every push — a targeted run cannot see the
test in another file that guards the thing you changed (`offer-image.test.ts`
guarded the library card treatment from `lib/`, not from `app/`).

**2026-09-10 — the welcome email only knew one way for a checkout to end.**
`sendPostPurchaseIfDue` had two callers: `confirmCheckout`, which only the
PRODUCT funnel's `/checkout/thank-you` calls, and the 30-minute abandonment
sweep. An offer purchase ends on `/library` — with or without an upsell — so
it never reached the first, and the sweep was its only route. A built-in app
bought at 07:20 was welcomed at 07:55, every time, and a buyer refunded
inside that half hour was never welcomed at all. Rule: when a funnel grows a
new terminal path, the things that fire "at the end" have to grow with it —
grep the old terminal page's calls and ask which of them the new path needs.
The guards (already sent, upsell in flight, disabled) belong in the sender,
so adding a caller stays safe. (`lib/purchase-email-reaches-every-end.test.ts`)

**2026-09-10 — a forward-only column reads as "the data is wrong".**
`orders.host_offer_id` (0077) is what the traffic screen counts offer sales
by, and it is written forward only. Book Writer showed 1 sale against two
real charges in Stripe, and the owner's reasonable read was that the screen
was broken. It was arithmetically right about everything it could see; the
missing sale predated the column by nine hours. The check that mattered came
first: every Stripe charge in the window was matched against `orders`, and
none was missing — no money went unrecorded, only unattributed. Rule: when a
new column decides a number somebody reads, ship the backfill with it, or say
in the UI which date the number starts from. And when a report looks wrong,
reconcile against the payment processor before touching the reporting code —
"is money missing" and "is attribution missing" are very different bugs, and
only one of them is an emergency. Backfill rules stay conservative: two
lines of the same `kind` mean the host is a guess, and a guessed number on a
screen people spend against is worse than a low one.

**2026-09-10 — a step that does not exist is not a step everybody left.**
Every offer on the traffic screen read "100% at the upsell". Not one of the
nine active offers had an upsell configured, and no offer buyer is ever sent
to `/checkout/oto` — so the third step was a structural absence, counted as a
measured zero, and a fall to zero is the mathematical ceiling, so it won the
"biggest drop" sort over every real problem on the page. Book Writer read
354 → 7 → 0 → 2: nobody saw the upsell, yet two people bought. Rule: a funnel
step that an owner never shows is `null`, not `0`, and anything derived from
it — a drop, a sort, a label — measures across the gap to the last step that
exists rather than into it. Same rule as the source filter a day earlier: a
screen must not assert a number it has just declared it does not have.
`biggestDrop` now reports `to`, the step a fall LANDED on, because the old
`from` + 1 at every call site is unreadable once a step in between can be
missing. (`lib/traffic-owners.test.ts`)

**2026-09-10 — the upsell's accept button did nothing, for ten buyers.**
0 of 10 upsells accepted looked like a conversion problem. It was a dead
control. `OtoStickyBar` renders a button that SCROLLS to the price choice
instead of accepting whenever the offer shows more than one way to pay
(`optionCount > 1`). `buyAnchor()` finds that choice by looking for a Ways to
pay block (`data-ways-to-pay`) or a Button set to buy (`data-buy`). The Funnel
App's upsell page has two live prices and neither block — eight headings,
eight rows, five card grids, three texts, an FAQ, an image — so
`scrollIntoView` ran on null, nothing moved, and no other accept control
existed anywhere on the page. Rule: a control whose behaviour depends on
another element existing must check that it exists, and fall back to the
thing that works. Never ship a branch that can only no-op. And when a funnel
step reads zero, open the page before concluding anything about the audience
— the data said "nobody wanted it" and the truth was "nobody could".
(`components/oto/dead-accept-button.test.ts`)

**2026-09-10 — that last entry is wrong, and the way it got wrong is the
lesson.** The census behind it ran
`jsonb_array_elements(content->'blocks')`, which reads TOP-LEVEL blocks only.
Every block nested inside a `row`'s `columns` was invisible to it — which is
where most blocks on a built page live. A recursive census of the same page
found two `prices` blocks, in the `guarantee` and `cta` sections, both naming
the Funnel App offer. So `hasBuyAnchorBlock` was already true, the sticky bar
already scrolled to a real chooser, and `318dff0` changed nothing on the page
it was written for. Rule: `walkBlocks` descends into `columns` and your SQL
does not. Any query that counts, finds or audits blocks must recurse, or it
is measuring the page's outline and calling it the page. And a diagnosis that
rests on one query gets a second, differently-shaped query before it becomes
a deploy.

**2026-09-10 — the real reason nobody accepted: the button was born
disabled.** `PriceChoice` starts with no option ticked whenever there is more
than one (`useState(chosen ?? (prices.length === 1 ? 0 : null))`), and its
button is `disabled={waiting}` with the label "Choose one above" until one is.
On a sales page that is right — choosing is the point and the button is a
link. On an upsell it is the whole flow: the sticky bar's "Start 7-day free
trial" scrolls the buyer to a greyed-out control, and nothing on the page asks
them to tick a radio. Now preselected whenever `otoToken` is set. Rule: a
default that is correct on one surface is a dead end on another — check every
surface a shared component renders on, especially the one that takes money.
And note what made this expensive to find: `acceptOto` releases the token back
to `pending` on failure and logs nothing, so a failed accept and a buyer who
never clicked are the same row. A money path that can fail silently should
write an `error_events` row on the way out. (`lib/oto-one-click.test.ts`)

**2026-09-11 — attribution was gated on consent, and 8 of 13 sales read as organic.**
The visitor row holds click ids, IP and user agent, so it is rightly
consent-gated. The campaign labels were stored on the same row, so they were
gated too — and most buyers never accept the banner. The labels describe the
ad, not the person; they now ride a first-party cookie from the proxy and are
snapshotted onto the order for everyone. Rule: decide what needs consent per
FIELD, not per table. And the offer checkout's order is created in a function
the webhook also calls — anything that must reach that insert goes through
the intent's metadata, never a cookie. (`lib/attribution.test.ts`,
`lib/offer-checkout-complete.integration.test.ts`)

**2026-09-11 — two functions bucketing "the same thing" drifted, because
each read its own inputs.** `sourceOf` buckets a page VIEW from a query
string; `sourceOfOrder` buckets the ORDER it produces from `utm_last`. Both
claimed to rank a UTM campaign over a UTM source over a click id over a
referrer, and each carried its own copy of that ranking. A link with
`utm_source` and no `utm_campaign` exposed the gap: `sourceOf` had never read
`utm_source` at all, so the view bucketed as `direct` while the order, via
`sourceOfOrder`, bucketed under the source name — one campaign, two rows on
a page whose entire point is that a campaign's views and its sales share a
row. The review that caught it also caught why the existing test hadn't:
the one cross-check `traffic-source.test.ts` ran did compare `sourceOf`
against `sourceOfOrder` — but only on the one input shape where a campaign
was present on both sides, which the old, independent rankings already
agreed on. The assertion passed on every run while the divergence sat one
input shape away. Rule: when two functions must
bucket the same thing from different inputs, one of them cannot just agree
with the other by construction — extract the shared decision into one
function they both call (`bucketOf` in `lib/traffic-source.ts`), and write
the equivalence test on the cases where the inputs actually differ, not the
case where every field is present and any reasonable ranking gives the same
answer. (`lib/traffic-source.ts`, `lib/traffic-source.test.ts`)

**2026-09-11 — the tracking was real and the owner still could not see it.**
The previous branch put campaign labels into orders, into Stripe, and onto
Meta and GA4 events — every one of those worked. The owner opened the admin
anyway and got `direct`, for three separate reasons: only five paths ever
called `recordPageHit`, so the home page left no trace at all; what *was*
recorded was an aggregate (`page_counts`), with no row anywhere saying "this
visitor arrived from this link"; and the one place a landing URL survived,
`visitors.landing_url`, sat behind the consent banner and behind no screen
that ever displayed it. Rule: a tracking feature is not shipped when the
data is correct, it is shipped when somebody can find the answer without
being told where to look. Ship the screen in the same push as the capture,
and say on the screen which day the data starts.
(`docs/superpowers/specs/2026-09-11-visit-attribution-design.md`)

**2026-09-11 — a green suite compiled to nothing, three tasks in a row.**
`components/admin/visit-row.tsx` is `"use client"` and imported `outcomeOf`
and `labelPairs` from `lib/visit-reports.ts`, which starts `import
"server-only"` and pulls in the service-role Supabase client through
`lib/store.ts`. `npx next build` refused to bundle that chain for the
browser and failed outright — and nothing else on this repo's gate could see
it coming: `vitest.config.ts` aliases `server-only` to a stub, so even this
component's own jsdom test ran straight through the guard; `tsc` does not
model the client/server boundary; ESLint had no rule for it. The import
landed in the task that built the client component and rode two more green
tasks before anyone ran `next build`. Rule: this repo's "local green is not
CI green" has a sibling — a green suite is not a build that compiles, and
the build is what deploys. `next build` is its own gate, run every task, not
a thing checked once at the end. (`lib/visit-view.ts`,
`.superpowers/sdd/2026-09-11-visit-attribution/build-fix-report.md`)

**2026-09-11 — three briefs in a row asserted a `.00` that `money()` will
never print.** `money()` deliberately drops a whole-dollar `.00`
(`lib/money.ts`) — house convention, not a bug. Three separate task briefs
on this branch specified a whole-dollar expected value anyway (`"$343.00"`,
`"$49.00"`, `"$196.00"`), each written independently by a different
implementer, and each time the RED test failed against a correctly-behaving
`money()`. All three implementers caught it and fixed the fixture rather
than the code. Rule: a money fixture whose expected value lands on a whole
dollar cannot distinguish a correct formatter from a naive one that always
prints two decimals — give the fixture cents. (`e22246d`, `112b625`,
`b0731cb`)

**2026-09-11 — a privacy posture written down in the spec drifted the
moment code had a locally reasonable excuse not to follow it.** The design's
own answer was explicit: click ids stay behind the consent banner.
`sanitizeQuery`, written one task later, kept `fbclid` and its siblings in
`visits.landing_query` for everyone anyway — its own doc comment reasoned
"this column exists to answer 'what exactly did they click', and a landing
URL with fbclid removed answers half of it," which is a sensible argument
about the column and not about consent. Nothing failed: the task's own tests
asserted the kept value. It took a reviewer checking the implementation
against the spec's actual words — "click ids kept only when consent is
granted" — two tasks later to catch it. Rule: a posture decided once in
prose has to be re-checked against the code that claims to follow it, not
against whatever tests that code brought with it — a locally sound reason in
a comment is not evidence a global rule was kept. (`7a75e2b`)

**2026-09-11 — `??` could not tell an explicit `null` from an argument
nobody passed.** `recordVisitStep(step, { visitId, ... })` read
`opts.visitId ?? await currentVisitId()`, so a caller that deliberately
passed `visitId: null` — the thank-you-page path, for an order whose visit
genuinely cannot be found — fell through to the cookie's *currently active*
visit instead, exactly the cookie-based re-attachment this feature's own
"never from a cookie" rule exists to forbid. Nothing in the checkout suite
could fail if the wiring were deleted outright: every new field was optional
or nullable, so `tsc` passed either way and only a review that asked "what
test would break" found it. Rule: when an argument's absence and its
explicit falsy value must be handled differently, check with `"visitId" in
opts`, never `??` — and a nullable field threaded through a money path earns
a test that fails if the wiring is removed, not just one that exercises the
populated case. (`aa226e1`)

## A consent gate that fails closed fails silently (11 Sep 2026)

`mayTrack` read `state === "granted"`, so an ignored banner was stored as the
same `false` as a refusal. In production that was 5 of 14 live paid orders
reporting NO conversion at all — not mis-attributed, absent — and the only
visible symptom was an ads team saying campaigns had no conversions. Nothing
errored, nothing was logged, and `error_events` held not one row from source
`tracking` in the whole period.

Two things that would have surfaced it years earlier: a count of orders whose
conversion was skipped, and the knowledge that `META_TEST_EVENT_CODE` left set
does the same thing for a different reason. If a send can be skipped, count the
skips.

When the gate came out, two edge cases only existed *because* it had been there:

- `AttributionTracker` relied on the consent event to run a second time. Meta's
  pixel writes `_fbp`/`_fbc` only after `fbevents.js` loads, which is after the
  component's first run — so removing the banner without replacing that second
  trigger would have dropped the strongest match signal on every first visit.
  The pixel-ready event is NOT a substitute: it marks the inline stub, not the
  loaded script.
- The done-flag was set on any successful store, which would have made that
  second run impossible. A retry flag must record what was actually captured,
  not that a request succeeded.

Removing a gate means auditing what the gate was incidentally driving.

## Save is a draft (14 Sep 2026)

Since 0084, `saveSection` and `savePageSettings` write `draft` and nothing a
visitor can see. Live content moves only through `publish_page_drafts()`
(`publishPage` in lib/pages.ts). Three things this changes for anyone writing
code or tests here:

- A test that saves and then reads what a visitor sees must publish in
  between, or read with `{ draft: true }` and say which it means.
- A row with `published_at is null` is invisible to `getPageSections` and
  `hasPageSections` by default. `includeDrafts: true` is for the admin only.
- `revalidatePath` for public routes belongs on publish, never on save.

## Stripe refuses to cancel a subscription a schedule manages (15 Sep 2026)

Cancel the schedule and the subscription goes with it; release the schedule
if you only want to set `cancel_at_period_end`. `endSubscription` and
`releaseSchedule` in `lib/payment-plans-stripe.ts` know which is which. A
paid-off plan is decided by counting paid invoices with `amount_paid > 0`,
because the end-of-schedule event looks the same as Stripe giving up.

Two things the test-mode run taught that the types did not: a schedule
phase takes a `duration`, not `iterations` (the SDK still compiled the
old name), and the first phase must carry the `start_date` the schedule
built `from_subscription` reports. And `refundOrder` returns early for an
order with no payment intent, which is every subscription order, so
anything a refund must always do has to run on that branch too.

## Page code publishes with "Publish page", and the canvas answers media queries itself (16 Sep 2026)

"The custom CSS is not working" was three things. The CSS was a draft:
page settings save as a draft like every section, and a section's own
Publish leaves them where they are — only "Publish page" sends page code
live, so the settings row now wears a Draft tag. In the canvas, a
`@media (max-width: 640px)` block can never fire: the canvas is a 390px
column in a wide window and the query asks the window, so `cssAtDevice`
resolves page CSS for the device being drawn, the way every per-device value
the builder owns is inlined. And a band's per-device background is written
`!important` on `#section-…`, the same weight people reach for to override
it, so the page's CSS is now emitted after every section's rules — later
wins at equal weight. Block-level Custom CSS goes through the same resolver.

Also: keying inspector controls by kind alone reused one mounted rich text
editor across two text blocks, which showed the previous block's words and
wrote them into the new one on the next keystroke. Key by the block's id.

## Money screens derive from one loader (21 Sep 2026)

Members, Transactions, Trials and the person page all read `loadMoneyData()`
once and derive from it in pure functions (`lib/member-money.ts`,
`lib/ledger.ts`, `lib/trials-view.ts`), so a total on one page cannot
disagree with another and the arithmetic is tested on one fixture without a
database. Subscription dates and paid counts live in `subscriptions` (0086),
written by the webhook and reconciled by `POST /api/cron/sync-subscriptions`;
`ownership` stays the access record. A "renewal" is an order with a Stripe
invoice id; a "trial" is a $0 line with a subscription id; "purchase" versus
"upsell" on an offer line is decided by whether the line's offer is the order's
`host_offer_id`. Test-mode rows count nowhere.

## An invoice's subscription id moved under `parent` (21 Sep 2026)

`invoice.subscription` is gone on the API version this repo pins; the id is
`invoice.parent.subscription_details.subscription`, and on a line it is
`line.parent.subscription_item_details.subscription`. Every renewal since the
version bump read as "no subscription": no renewal orders, no dunning email on
a failed charge, and a member with two paid months showed Total paid $0. The
webhook was green the whole time because "skipped" is a success. Read the id
through `subscriptionIdOf` in `lib/renewals.ts`, never off the invoice
directly, and treat a skip counter that only ever grows as a failure signal.

## A scheduled cancellation is not always `cancel_at_period_end` (21 Sep 2026)

Stripe ends a subscription two ways. The dashboard button sets
`cancel_at_period_end`; an API cancellation with a date sets `cancel_at` and
leaves that flag false. Reading only the flag showed a member whose
subscription stops on 12 Oct as "paying", with "renews in 22 days" pointing at
the very date it ends. `subView` now treats either as cancelling. Read both
whenever you ask whether a subscription has a future.

Related: a user row is created the first time this store sees someone, which
for a subscription a connected app started is the day the sync ran. "Joined"
is now the oldest of the row, their first order and their first subscription.

## A lesson's video URL was framed without being parsed (21 Sep 2026)

`lesson-view.tsx` put `item.videoEmbedUrl` straight into an iframe `src`,
while every other video in the codebase went through `videoEmbed()` with its
host allowlist. So the paid area framed whatever an admin pasted, and the
lesson form advertised Loom, which the embed builder had never supported.
Lesson video now goes through `lessonVideo()` and an unrecognised link renders
a message instead of a frame. If you add a provider, add it there: the player
needs to know which provider it is talking to anyway, because the resume
offset is a query parameter on YouTube and a fragment on Vimeo.

Related, same day: `progress.position_seconds` had existed since 0001 with two
helpers to read and write it and no callers at all. A column nobody writes and
a helper nobody calls look identical to a working feature from the outside.

## The CRM only heard about one kind of checkout (22 Sep 2026)

ActiveCampaign lifecycle tags were applied in `finalizeOrder`, which runs on
the product checkout. An offer bought on its own page grants access through
`completeOfferCheckout`, which never reaches it, so 57 Content Engine
trialists carried no trial tag and no trial nurture sequence had ever started
for any of them. It looked like a broken integration and was not: buyer tags
were landing correctly, because those come from the Stripe webhook when
ownership flips to active, which is independent of how the person bought.

The tell was one member. `mamenprofesional@gmail.com` took Content Engine as a
bump on a product order, went through `finalizeOrder`, and had the tag. Every
other real trialist bought through the offer page and had nothing. When one
row behaves and fifty do not, compare their paths, not their data.

Lifecycle tagging now lives in `grantOfferOwnership`, the single function all
four grant paths pass through: a bump, the offer checkout, an accepted OTO and
a manual grant. Anything that grants access and does not go through it will
be invisible to the CRM again. Backfill: `POST /api/cron/backfill-ac-tags`,
`?dry=1` to count first.

## Stripe's trial warning is three days and cannot be moved (22 Sep 2026)

`customer.subscription.trial_will_end` fires exactly three days before
`trial_end`. Measured across twenty live events on this account: every one at
3.00 days, to the minute. There is no setting. A reminder at any other
interval has to be swept for and sent by us, which is what
`app/api/cron/trial-reminders` does, hourly, at one day out.

Two things that sweep gets right and a naive one would not. It claims the row
(`trial_reminder_sent_at`) BEFORE sending, so a crash costs one missed email
rather than mailing everyone again every hour until it stops crashing. And it
skips anyone who has already cancelled: their card will not be charged, and an
email saying it will is worse than no email.

## PostgREST's 1000-row cap bit again, in the money loader (23 Sep 2026)

`loadMoneyData` read users, orders and ownership with no paging. On a local
store of 1062 users a real member 404ed on their own admin page, because the
users select returned the first thousand and theirs was not among them. No
error anywhere; the row simply was not in the answer.

Production was at 99 users and 100 orders when this was found, so it had not
bitten yet — which is exactly why it is worth fixing before it does. All three
now page through `allRows`, which is exported from `lib/traffic.ts` for this
purpose, and each one carries an explicit `ORDER BY` so the paging is stable.

The rule is in AGENTS.md and was still missed when the loader was written.
Before any new `.select()` without a `.limit()`, ask whether that table grows
with the store. Users, orders, order_items, ownership, subscriptions,
progress and visits all do.

## The offer checkout was losing buyers who had already decided (25 Sep 2026)

Micro-Product Builder, 1 to 25 Sep, from our own visit data: 1,053 landed
from ads, 67 clicked buy, 4 paid. The product checkout beside it converts the
same step at 29%. Nothing failed: Stripe saw only five payment attempts all
month, so 62 people left the form before pressing Pay, and nothing on the
server records a form that is simply abandoned.

Three things distinguished the offer checkout from the product one, found by
walking both pages live rather than reading code:

- **Its title was the offer's `headline` field**, which also serves as the
  sales page's fallback `<title>`, so SEO copy ("… | Greater Inside") sat at
  the top of the payment form. It now uses `offer.name`, as the product
  checkout has always used the product's title.
- **A one-time offer never said so.** The product checkout says "One-time
  purchase" and "one-time · instant access"; the offer checkout said nothing,
  while the bump beneath read "$0 then $29/month" and Stripe's mandate line
  promised future charges. Same words now, on `oneTime`.
- **Stripe's element was born in setup mode and switched to payment later**,
  so a one-off opened as a save-a-card element. Created in payment mode with
  the amount when that is knowable at first render, as the product form does.

And one thing that was NOT wrong, though it cost a deploy and a revert to
learn it: the checkouts are not slow. Measured through the desktop app's
Browser pane, the card fields appeared to take 3.3 s on desktop and 6.2 s on
a phone, so a preconnect plus a `<link rel="preload" as="script">` of
`https://js.stripe.com/v3/` went out on both checkout pages. Measured the
same way after the deploy: one navigation mounted at 0.93 s, the next three
had not mounted after 30 s. The warm-up was pulled on that. Both readings
were the pane, not the site. When the Browser pane is hidden the page never
hydrates (`document.visibilityState` is `hidden`), so `loadStripe` never
runs and there is no `js.stripe.com` script tag at all; the one run that
"mounted" was the navigation that opened the pane. Headless Chrome over CDP
from Bash, sixteen fresh navigations across both checkouts and both
viewports with the cache cleared each time, mounted the payment element in
0.33–1.88 s, without any warm-up. The warm-up stays out because nothing
needs it, not because it broke anything. Any timing taken through the pane
is worthless unless `tabs_context` says the pane is displayed; the CDP
script pattern is in the machine-private memory under
`visual-verification-loop`.

When one page converts and its twin does not, diff the two pages in a
browser before diffing the code. Every finding here was visible on screen.

## An event that is wired in one checkout is not wired in its twin (26 Sep 2026)

The product checkout sent InitiateCheckout, CheckoutEmailEntered,
AddPaymentInfo and the bump events. The offer checkout, which every offer
funnel runs through, sent none of them: its slot context passed
`notePaymentInfo: () => {}` and a `captureEmail` that only set the typo hint.
So for the Micro-Product Builder and every Content Engine page, Meta and GA4
saw AddToCart, then nothing, then a handful of purchases. The ads team's
"55 add to carts, 4 sales" had no middle because we never sent one. The
same audit found that a buy button inside a Ways to pay block was a plain
`<a>` with no AddToCart at all.

Both checkouts publish one slot context now, and the offer one fills it.
`components/checkout/checkout-tracking.test.tsx` watches `track()` for each
event and fails if one goes quiet. When two components do the same job,
grep both for every `track(` call before trusting either; a no-op in a
context object reads as wiring until somebody counts the calls.

## Leaving a page looks like reading all of it (26 Sep 2026)

The scroll tracker measured on every scroll and resize until it unmounted.
Pressing a buy button swaps the sales page for the checkout while those
listeners are still attached: the old sections are detached, so each
`getBoundingClientRect()` reads 0 and every section counts as "reached",
and the document is suddenly short, so depth reads 100%. Every buyer was
recorded as having read the whole page, and it was reported to the owner
as "most buyers read to the bottom before clicking" before a probe that
scrolled to a button with and without clicking it showed the difference
(75% vs 100%). The tracker now freezes on a buy click and whenever a
section it holds is no longer in the document. The 12 visit_scroll rows
from checkout-bound visits between 25 Sep 22:07 and this fix may overstate
depth; they were left in place.

Probing it: a headless run with `Fetch.enable` blocking facebook.com/tr,
/g/collect and /api/track* records every event a live page sends and lets
none of them land, so production can be tested without polluting Meta,
GA4 or the store's tables. GA4 batches: wait ten seconds after an action
or the event looks missing.

## A "sent" stamp must say what it was sent about (28 Sep 2026)

`trial_reminder_sent_at` was treated as "this subscription has been
reminded", full stop. A Content Engine trial reminded on 27 Sep was then
extended a week in Stripe; the webhook synced the new trial_end, but the
stamp stayed, so the sweep would never have warned her before the 5 Oct
charge. A stamp now only counts if it is within REMINDER_VALID_HOURS (48)
of the current trial end, the sweep selects by window rather than by
`sent_at is null`, and the claim is compare-and-set on the stamp it read.
Any extension, from the admin's Extend trial or straight in Stripe,
re-arms the reminder with no second write to remember. Admins extend
trials from the member page (`extendTrial` in lib/members.ts), which
changes Stripe and re-syncs our row in one step.

## "Once per person" has to be asked on every path that grants it (29 Sep 2026)

trial_history existed, and the product checkout, the bump and the upsell
all asked it. The offer checkout, which sells every Content Engine and
Funnel App trial, did not: its page stripped the OFFER's trial but each
PRICE carries its own and offerAtPrice copies it back, and neither the
start nor the completion step checked at all. A returning trialist got a
second 7 days, and a coupon with trial_days would have given one to anyone.
Proved in Stripe test mode before fixing (lib/repeat-trial.integration.test.ts).

Now: withoutTrial strips the prices too; hasHadTrial asks whenever the offer
grants something, not only when the offer itself has trial days; the start
refuses (code trial_used) a buyer shown a trial they have had, and refuses
a trial code for them, before any card is saved; completion never grants
one, coupon or not. A rule like this lives in one function, but it is only
enforced where a caller asks it. When adding "once per person", grep every
path that can create the thing, not the one you were looking at.

The Funnel App's own signup (Stripe metadata app: gi-funnel) is a separate
door this store cannot close: a customer who cancelled our Funnel App trial
started two more there twelve minutes later.

## A shared Stripe account sends you everyone's events (29 Sep 2026)

customer.subscription.* arrives for every subscription on the account, and
syncSubscription upserted each one. The account also bills Circle's
community memberships, the Funnel App's own signup and another app, so the
store's subscriptions table held 40 rows that were nobody's here: Circle's
$300 membership showed on Transactions as a nameless "Cancelled
Subscription", and a Funnel App signup was sent the store's trial reminder.

belongsToStore decides now: store_created in Stripe's metadata, or linked
to an access row or order line here. Anything else is not written, and the
existing rows are filtered out of listSubscriptions rather than deleted.
The trial reminder additionally needs a store offer or product and
store_created on the live subscription, because the email speaks for the
store. (Superseded the next day: a connected app's own billing stays out
even when it is on a member's access row. See below.)

Any handler for an account-wide event starts by asking whose it is.

## "Active, never paid" is a 100% coupon, not a failed card (30 Sep 2026)

The Trials page read eleven people as "ended unpaid, the card was not
charged", which is what a run of failed payments looks like. Stripe had
every one active, invoicing $0 under a repeating 100% coupon, and none of
them was Grow's: all sixteen member-linked subscriptions with no Grow offer
or product were the Funnel App's own signup (metadata app: gi-funnel). The
money screens called them "Subscription", counted $29 a month each as
"paying", and promised a next charge.

Stripe only keeps a subscription active past its trial when the invoice was
paid, so active with no paid invoice means it was invoiced $0. That is now
"free access" in one rule (trialOutcomeOf, subView): no monthly figure, no
next charge, neither converted nor lost. subscriptionNamer names a
subscription with no Grow offer or product "<App> (own signup)", and the
Trials page counts only Grow-sold trials. Before calling a status a
failure, read the subscription in Stripe: status, invoices and discounts.

## Access is shared; money is not (30 Sep 2026, owner's decision)

A member reaches the Funnel App from their Grow library, and the Funnel App
reports its own signups on the member's access row. The store treated that
row as proof the subscription was Grow's: it synced it, showed its status,
counted it in the monthly figure and trials, and the renewal recorder booked
its charges as Grow orders (two $29 renewals for one member). The owner's
rule: what a member paid a connected app, and that subscription's status,
live only in that app. Grow shows what Grow sold.

In code: belongsToStore needs store_created or a Grow offer/product;
listSubscriptions reads only rows with an offer or product; the renewal
recorder skips an access row with neither; isAppBilledOrder (lib/app-billed)
keeps the two orders already written out of the money screens, the
dashboard total and the member's purchase list. The rows themselves were
not deleted.

## Post-purchase sequences: the editor and the renderer share one schema (30 Sep 2026)

Every node and mark `lib/email-editor-extensions.ts` can put in a document
has a branch in `lib/post-purchase-render.ts`, and
`lib/email-editor-extensions.test.ts` round-trips through both. Add a
toolbar feature and it must be added in both files, or the owner sees it in
the editor and the buyer never gets it. Sequences are queued by
`sendPostPurchaseIfDue` at checkout-over whatever the welcome's own switch
says, and sent by the retry cron; a follow-up is queued only when the one
before it is sent, so edits reach buyers mid-sequence.

## Post-purchase flows are per buyer, not per purchase (30 Sep 2026)

A flow is one buyer (order email, trimmed and lower-cased) on one sequence.
"Stop these emails" pauses all of that buyer's flows; their next purchase
resumes them, but only a purchase placed after the stop does. The
"processed" stamp lives on each purchase line (`order_items.post_purchase_flows_at`),
not on the order: an order can be paid before its lines are written (the
webhook race in completeOfferCheckout), and a bump or upsell line can arrive
after the host line. A per-order stamp written before the lines existed lost
those buyers' flows silently. The store-series integration tests skip
themselves when a local store series exists, rather than overwrite a developer's work.

## A renewal is an order nobody else expected (1 Oct 2026)

Renewal orders (`stripe_invoice_id` set, one `renewal` line) were added in
0062 and then flowed through readers written before they existed. The
welcome sweep sent "You're in. Welcome" to 26 of 28 renewals. The Refund
button read "no PaymentIntent" as "the $0 trial order": it ended the
subscription, revoked access and marked the order refunded, and gave back
nothing (a $398 renewal, 30 Sep; found a day later from the member's
account page). The refund webhook could not find a renewal at all.

When a new kind of row starts landing in an existing table, grep every
reader of that table (sweeps, crons, emails, refunds, CRM, tracking, the
account page) and decide for each. A null-branch ("no X, so it must be Y")
has to check that Y is the only way to have no X; for anything that moves
money, branch on what the row positively is and refuse a shape you don't
recognise, rather than run the destructive default.

## Stripe is the record of money; our status is a claim about it (1 Oct 2026)

The order above said "refunded" for a day while Stripe said $0 refunded,
and every screen believed the order. A refund is real when Stripe has a
succeeded refund object for it; mark ours refunded from that, never instead
of it. Stripe shows a refund on an invoice only through a credit note: a
refund made on the charge leaves the invoice "paid" in full. Renewals are
refunded through `creditNotes.create({ refund_amount })`, and the
`charge.refunded` webhook links any other refund (`lib/credit-notes.ts`).
Both use `email_type: none`; telling the member is the owner's call.

## Nothing in the library charges; one tap is for upsells (1 Oct 2026)

The library's "Still available" card charged the saved card on one tap
(`acceptStandingOffer`). Nine buyers started a second subscription that way,
five within a minute of checkout; two cancelled before paying and one wrote
to support after being charged. Nothing recorded the tap, so the only
evidence was the code. The card now links to the offer's page and normal
checkout (`/library/offer/[id]`), the click is logged, and so is every page a
signed-in member opens (0092, Activity on the member's admin page). The
owner's rule: no charge and no trial from any library button without the
sales page. Any new button that can charge a saved card outside the upsell
flow needs the owner's yes first, and must leave an audit row.

## Behind the proxy, req.url is the container (1 Oct 2026)

`Response.redirect(new URL(path, req.url))` in a route handler sent
visitors to `https://0.0.0.0:3000/login`: behind Coolify's proxy the
request URL is the container's bind address. Use a relative `Location`
(as `checkout/offer/complete` does) or `NEXT_PUBLIC_SITE_URL`. Found by
curling the new route anonymously after the deploy, which is worth doing
for every new route.

## A partner can only show what we send it (1 Oct 2026)

The app bridge told Content Engine and the Funnel App only whether a
member had access: no trial end, no payment dates, and a cancellation
scheduled for month end looked like a paying member. Every push with a
subscription behind it now carries a `billing` block, and a paid renewal
pushes too. Additive, read at send time, documented in
`docs/app-integration-guide.md`. Both partners confirmed first that their
endpoint ignores unknown fields; Content Engine's repo is checked out
locally and its provision route could be read directly. A backfill written
for one field ("send names") skipped members without one; once the payload
grew, that filter was wrong, so the re-send is now "everyone".

## A failure only in the console is a failure nobody sees (1 Oct 2026)

The CRM's Zapier hook answers 404 (its Zap is off or gone). `sendCrmEvent`
logs that with `console.error` and nothing else, and the container's logs
reset on every deploy, so the CRM may have been missing events for days.
Outbound calls the business depends on should write to `error_events`, as
the app bridge does, so they show on /admin/errors.

## What now catches these (1 Oct 2026)

Built the same day from the lessons above:
- `reconcile-money` runs nightly at 04:10 and puts any disagreement between
  our orders and Stripe on /admin/errors, once per mismatch
  (`lib/money-reconcile.ts`).
- The Refund button acts only on a refund Stripe says succeeded or is
  pending, and tells the admin the amount and Stripe's refund id.
- CRM and email failures are written to `error_events`; a failed CRM event
  is queued for the retry sweep, whose runner now throws while it fails.
- `lib/saved-card-charges.test.ts` lists every function that can charge a
  card. A new one fails the suite until it is added to that list, which is
  where the owner's yes is written down.

## The store's heading settings outrank a page's own classes (5 Oct 2026)

Settings → Typography writes `:root h1{font-size:60px}` and the like into
every store page, unlayered and at 0-1-1, so a utility such as `text-xl`
on an `h2` loses (utilities sit in a layer, and lose to any unlayered rule).
The redesigned library looked right locally, where those settings are
empty, and came out with 45px section headings and wrapping app names on
production. App screens that must keep their own type mark their heading
sizes with `!` (`text-2xl!`), and a screenshot is only proof once the
store's real heading rules are on the page.

## A cleanup that lists first, then deletes, leaks (5 Oct 2026)

`product-recurring` cleaned up by selecting the store's orders and deleting
each one's line for the fixture product. The select stopped at PostgREST's
1000 rows, so once the shared local store held more orders the line was
usually missed, it kept the fixture's price, and the product delete failed on
`order_items_product_price_id_fkey`. Nothing checked the error, and 354
`it-rec-` products piled up. The checkout suite leaked 173 more because a
describe's `afterAll` (deleting the product) runs before the file's (deleting
the orders that point at it). Delete fixtures by their own key
(`order_items.product_id = id`), in FK order, and log the error of the last
delete so a leak is visible on the next run.

A test that borrows "the oldest offer in the store" is borrowing whatever
another suite inserted with an old `created_at` a moment ago. Make the
fixture you need.

## A container three deep is dropped without a word (8 Oct 2026)

A row may hold one more row (`MAX_DEPTH = 2`). The 90-Day AI timeline put
its pill grids inside a rail row inside the section's row, and normalize
dropped the third level on save: the page rendered with the pills and cards
simply missing, no error anywhere. Keep a module to two levels: draw a rail,
a card edge or a connecting line with the block's own custom CSS rather than
another container (see `lib/templates/ai-week-timeline.ts`). Three more that
look like bugs and are not:

- A new text block arrives as a centred 680px measure. A template that wants
  the column states `width: "auto"` and `blockAlign: "left"`.
- A row's `widths` must add up to 100. `[50, 50, 50, 50]` for a two-by-two
  wrap renders the first column at `calc(-50%)`; switch that width to
  `containerType: "grid"` with `gridColumns: "2"` instead.
- Two buttons in a row are grouped into a flex line, so `fullWidth` alone
  leaves each at its label's width; give the block `flex:0 0 100%`.

A rendering change that keys off settings live pages already have changes
those pages on deploy. Making "full width, no top air" drop the band's 28px
gap would have moved eight live bands on three sales pages; the gap is now
dropped only for a band that sets `layout.flush`.

The store's Settings → Typography writes `:root p{margin-bottom:1rem}` into
every page. A text block that does not reset its own paragraphs gets that space
under its last line: the 90-Day AI "Bonus:" tab rendered 46px tall instead
of 26 on production and looked right locally, where those settings were empty.
Render with production's typography copied into the local store before
calling a design matched.

To match a PSD, read it rather than the JPG: `psd-tools` gives every text
layer's exact size, line height and frame width, and the JPG export can be
older than the PSD (here the hero photo had changed).

## An order written already paid reports nothing (9 Oct 2026)

The offer checkout inserts its order with `status: "paid"`. `finalizeOrder`
returns at `if (order.status !== "pending")`, so a comment saying "a paid
offer is reported by finalizeOrder" was false from 9 Sep, and the offer
checkout reported only trials. Twelve paid offer sales (ten Micro-Product
Builder, two Book Writer) never reached Meta. AddToCart still fired, so the
campaigns showed carts and no purchases, and the ads team found it before we
did. When code says "the other path reports this", follow the other path to
its first `return`. Meta accepts a server event up to 7 days old, so the
window for resending a missed sale is a week.

A visitor's stored click ids were first touch only. A returning buyer who
clicked a second ad was matched to the first click, outside Meta's 7-day
window. `mergeClickIds` now lets a newer fbclid replace the stored one.

A bump paid inside the order's own charge also reports itself as a Purchase,
so the order's Purchase (server and browser) has to leave it out
(`prepaidBumpCents`). Before 9 Oct a $29 sale with an $11 bump reached Meta as
$40 plus $11. Every server event for one sale is keyed on the order id, the
id the browser's copy uses, or a page that adds the browser copy later turns
one sale into two.

## Editor JSON is not plain data (12 Oct 2026)

ProseMirror builds every node's and mark's `attrs` with a null prototype, and
TipTap's `getJSON()` passes them through. React sends a null-prototype object
to a server action as a `$T` placeholder, not data, and the server's first
read of it throws "Cannot access href on the server ... temporary client
reference". Every paragraph carries `attrs.textAlign`, so any edited
post-purchase email failed to save with a 500, which the page reported as
"Could not reach the server". Tests passed because they built documents by
hand. `docOf` in `components/admin/email-editor.tsx` round-trips through JSON;
anything else that sends editor JSON to a server action needs the same.

## A stale Meta test code sends LIVE events (20 Oct 2026)

`test_event_code` only makes an event a test while that exact code has an OPEN
Test Events session in Events Manager. The code is per-session, not per-pixel,
so a value copied from a tab somebody closed days ago is already stale.

Meta does not refuse a stale code. It answers HTTP 200, `events_received: 1`,
and puts the reason in `messages`:

    "test_event_code \"TEST29461\" does not match an active Test Events
     session for this dataset. These events were received and processed
     normally, but will not appear in Test Events."

What "processed normally" covers is narrower than it sounds, and worth stating
exactly, because the first version of this lesson overclaimed. What IS proven:
the dataset counts them. Three $4,500 "test" purchases went into the live
CoachAjit pixel this way and `ads_get_dataset_stats` shows all three in their
hour. Pixel events cannot be deleted, so assume they are real and tell whoever
reads the numbers.

What is NOT proven is that they reach reporting or optimisation. Do not infer
it from a custom conversion either way — see the next lesson, where six events
with no test code at all failed to move one.

`scripts/send-test-purchase.ts` now reads `messages`, says so loudly and stops
the run. Open the Test Events tab, copy the code it shows *now*, and keep the
tab open for the whole run.

Also, on that script: this package has no `"type": "module"`, so tsx compiles
it as CJS, where a top-level `await` is a transform error before any line
runs. Any script under `scripts/` that awaits must wrap it in a function.

## A renewal chargeback found no order, so it revoked nothing (22 Oct 2026)

The store's first chargeback was on a renewal, and the handler logged
`Access revoked (0)`.

`handleDispute` looked the order up by `stripe_payment_intent_id`, and the
intent-keyed fallback inside `revokeOwnershipForPaymentIntent` did the same.
A renewal order has NO payment intent — it is keyed on `stripe_invoice_id` —
so both missed and the whole handler ran with `order = null`. Three things
hang off that one null: the buyer kept access, their follow-up emails were
never paused, and Meta was never told the money came back. All three sit
inside `if (order)`. The alert itself named a PaymentIntent rather than the
customer, on a dispute with a two-week evidence deadline.

A Stripe Dispute carries a charge and an intent, never an invoice. The charge
holds it, so `invoiceIdForDispute` asks Stripe for the charge and reads
`charge.invoice`, and the order is looked up a second time by that. The
intent-keyed path stays for an orphan charge — an upsell billed on its own
intent and recorded on the order ITEM, where there genuinely is no order.

This is the entry above it in AGENTS.md — "a renewal order has no
PaymentIntent; new kinds of order reach every old reader of `orders`, grep
them" — written down and still walked into. When a new kind of row lands in a
table, grep for every `.eq("<the column the old kind had>")`, not just the
readers you remember.

## A new custom conversion is not proof that an event arrived (21 Oct 2026)

The ads team created "90 Day AI Team Build Sale" on 20 Oct — rule
`event = Purchase AND content_name contains "90 Day AI Team Build"` — and it
read Inactive. Chasing that number cost most of a day and sent nine events
into a live pixel for nothing.

What the rule could never do was show the SEVEN real sales of 18 Oct. Meta
custom conversions are not retroactive; a rule created two days later starts
from zero whatever is already in the dataset. Those sales were visible the
whole time under the custom EVENT `90 Day AI Team Build Sale`, with their real
dates, because `trackOfferSale` sends the funnel's named event beside
Purchase. Point an ads team at the custom event for history; a custom
conversion only ever answers "from now on".

Then the conversion stayed Inactive through events that should have matched:
three Purchases with a stale test code (20 Oct), and six more with no test
code at all (21 Oct) — three `Purchase` carrying
`custom_data.content_name: "90 Day AI Team Build"` plus three of the named
custom event. All six returned `events_received: 1` with an empty `messages`,
and `ads_get_dataset_stats` lists them in their hour. The payload was dumped
through `buildMetaEvent` and compared field by field against
`Micro-Product Sale V2`, whose rule has the identical shape and fires
normally. Our side is correct; `last_fired_time` stayed null regardless.

Rules, both learned the expensive way:

- An event's arrival is proven by `ads_get_dataset_stats` for its hour, never
  by a custom conversion's `last_fired_time`. The dataset is the receipt; the
  conversion is a view over it that can lag, or not populate for a rule that
  has never matched.
- Never send a second round of events to test the same hypothesis. The first
  round already proved delivery. Everything after that is phantom conversions
  on a dataset the campaigns optimise against, and none of it can be undone.

## A rail scrolled nothing because it asked for the wrong tag (21 Oct 2026)

`SlideRail` found the strip it scrolls with `querySelector("ul")`. That is
what the quote slider passes it. A cards shelf passes a `div`, so `scroller()`
came back null on every shelf: `go()` returned early, no arrow moved anything,
and `measure()` bailed the same way, which left Previous disabled at both ends
of the rail. It shipped looking finished — the arrows drew, labelled and
disabled themselves correctly — and the sessions gallery on the Foundations
Weekend page sat broken in production until somebody pressed one.

A shared component reached by two callers has to be tested through both. The
shelf's tests asserted the arrows *rendered*; none pressed one. Rule: when a
control's whole job is to cause an effect, assert the effect, not the markup.
`scroller()` now asks for the `overflow-x-auto` class both callers carry.

Dragging was never there at all. The strip was swipeable, and a swipe is a
touch gesture — on a desktop the arrows were the only way to move something
that looks exactly like you grab it. Pointer drag is mouse and pen only; touch
keeps the browser's native momentum and snapping, which no handler here would
match.

## An `entry` animation range is as long as the element (21 Oct 2026)

Every reveal on the Foundations Weekend page used
`animation-timeline: view(); animation-range: entry 8% entry 60%`, and the
page read as having no animation at all. The ranges were correct CSS and
measurably useless: an `entry` range spans only the ELEMENT's own height, so a
46px heading revealed over 24px of scroll and a 34px line over 4px. Across 109
animated elements the median was 52px — less than one wheel notch, so every
reveal finished before it could be seen.

`cover` spans the viewport PLUS the element, which buys a real distance that
barely changes with the element's height: at `cover 8% cover 45%` a 46px
heading takes 354px and a 600px block 559px. The same page then measured a
median of 365px.

Rule: `entry` is for something that must finish the moment the element is
fully on screen. Anything meant to be *watched* uses `cover`. And a reveal is
not verified by reading the CSS — sample the computed opacity at several
scroll positions and confirm it actually passes through the middle.

Note what this is not: scroll-driven CSS ties progress to the scrollbar, so
motion stops when scrolling stops. The design it came from used an
IntersectionObserver and a 0.9s transition on a clock. Matching that needs
JavaScript that hides elements and depends on itself to bring them back, which
on a streamed page that takes money is a worse failure than imperfect motion.

## `!important` beats an animation, so an animated property never paints (21 Oct 2026)

The Book to Bestseller tracker fills twelve bar segments and lights a rail on
each week as the curriculum scrolls past. Both were written the obvious way —
a base colour on the element, keyframes changing that colour — and both stayed
the base colour forever. The keyframes were right, the timelines resolved, the
ranges resolved to pixels.

Author `!important` outranks a CSS animation. Every rule here clears a
module's own styling with `!important`, so `background:#E7E7E7!important` and
`border-left:2px solid #E0E0E0!important` each beat the thing meant to change
them.

Worse, dropping the `!important` is not always available: a block skin writes
`border` as an INLINE style, and an inline declaration beats a plain rule, so
the border genuinely needs `!important` to clear — which means an animated
`border-left-color` can never win. The rail moved to `box-shadow`, which the
skin does not set, so a plain rule holds the base and the animation beats it.

Rule: an animated property cannot carry `!important` on its base. If the
module writes that property inline, animate a DIFFERENT property the module
leaves alone rather than fighting the cascade.

## An observer band fires at its far edge, not its middle (21 Oct 2026)

The same tracker had to match a design driven by an IntersectionObserver with
`rootMargin: '-45% 0px -50% 0px'` — a 46px band just above the middle of the
viewport. Reproducing it in CSS against the band's midpoint (47.5vh) put every
reading one week behind over most of the list.

A row becomes current when it *starts* intersecting the band, and the rows are
far taller than the band is. Scrolling down, a row first touches the band at
the band's BOTTOM edge — so the trigger is the row's top crossing 50% of the
viewport, the far edge, and the band's height never enters it. Only when rows
are shorter than the band does the midpoint come into it, and then several
rows intersect at once and the observer's answer depends on firing order.

Rule: convert an observer's `rootMargin` by asking which edge the element
reaches first, then verify against the real thing — run the design's own
observer beside the CSS over a sweep of scroll positions and diff the two,
landing exactly on each boundary and a pixel either side.

Two traps while measuring that: `scrollTo` under `scroll-behavior:smooth` only
STARTS a scroll, so anything read on the next frame is mid-flight and every
reading is wrong together, which looks like a broken animation rather than a
broken probe. Pass `behavior:'instant'`. And a backgrounded browser tab stops
laying out — every rect comes back 0 and a grid's computed
`grid-template-columns` reads back as the literal `repeat(12, 1fr)` instead of
pixels. Front the tab before measuring.

## A block of only absolute children is 0 wide (21 Oct 2026)

The tracker's numeral is twelve stacked spans, all `position:absolute` so they
swap places in one numeral's room. The block holding them had no `width`, so
it shrank to fit its in-flow content — nothing — came out 0 wide, centred
itself in the column, and took its `border-top` with it. The tracker's rule
simply was not drawn, and the numeral sat 220px right of where it belonged.

Nothing in the computed CSS looked wrong; the span's own font, colour and
offsets were all correct. It showed up by measuring the block's box against
the design's and getting 0 against 440.

Rule: a block whose children are all absolutely positioned needs an explicit
`width:100%`. And a block pulled out of flow to sit beside another (here the
bar, under the numeral's centre) should be `position:absolute` rather than
pulled up with a negative margin: a negative margin drags the column's end up
with it, so the sibling overflows its own panel and the panel measures short.

## A height diff cannot see decoration (21 Oct 2026)

Book to Bestseller measured within 4px of the designer's page at 1440, 900 and
390, every band, and was still visibly missing seven things: the 760px circle
hung off the hero's top right, the 30px rounding and drop shadow on the hero
photograph, the same rounding on the guide photograph, the 3px orange rule
beside the pull-quote, the sheen down each book cover's spine, the button's
hover gradient and press, and the slow push-in every `.ch-photo` has on hover.

Every one of them is decoration: a pseudo-element, a `border-radius`, a
`box-shadow`, a `:hover`. None of them occupies a single pixel of layout, so
matching heights column by column proved nothing about them, and reading the
band's own CSS did not either — four of the seven live in rules selected on a
class the port had replaced with a module.

Rule: porting a design is two passes, not one. Match the geometry, then walk
the source stylesheet for every `::before`, `::after`, `:hover`, `transition`,
`border-radius` and `box-shadow` and tick each one off against the build. Grep
the stylesheet for those six strings and work the list — it is short, and it
is the whole set.

Worth knowing while doing it: a `:hover` that depends on an ancestor needs a
hook, because the renderer puts a wrapper between a column and each block, so
`:nth-child` counts wrappers rather than blocks. Give the block a `cssClass`
and select on that. And the pane's screenshot coordinates are scaled from CSS
pixels, so a hover aimed with a number read out of `getBoundingClientRect`
lands somewhere else entirely and the rule looks broken when it is fine.

## A sprite `<use>` reaches the page empty (21 Oct 2026)

Three of Book to Bestseller's four bonuses showed no icon. The copy carried
them as `<svg><use href="#i-map"/></svg>`, which is how the handoff's HTML
writes them, and two separate things make that nothing here: there is no
sprite on the page to point at, and `use` is not on `sanitizeIcon`'s
allowlist either (`lib/sanitize-html.ts`) — so what lands is a bare `<svg>`
with no content and the right size.

The test did not catch it because it counted `<svg` tags, and three empty
`<svg>`s count exactly like three full ones. It asserts the path DATA now,
compared against the JSON (where quotes are escaped, so match on the `d`
value rather than the markup).

Rule: a handoff's sprite references have to be inlined from the symbols at
build time. Assert on the glyph's own path data, never on the tag.

## Carry a designer's component whole (21 Oct 2026)

The foil card on the same page is a 3D card that tilts toward the pointer. It
arrived as a real component: `foil-card.css`, `gi-foil.css` for the brand
finish, and `foil-card.js`. It was ported as a still approximation — the right
gradients at the right size — and matched almost none of it, because every
size in the component is in `cqw` (so it scales with its column, and a fixed
px copy is right at exactly one width) and because the tilt, the sheen that
tracks the pointer, the foil emblem and the grain are the object.

A page has `custom_css` and `custom_js` of its own (`page_settings`, 20k each
per `lib/settings-schema.ts`, injected by `components/page/sales-page.tsx`).
Both files went in there unchanged and the markup went in as one `html` block.
The card then measured identical to the designer's at every width, and the
next drop of those files re-applies without a rewrite.

Rule: when a design ships as a self-contained component with its own CSS and
JS, carry it rather than reproduce it — a decorative object with no copy in it
is exactly what the page's custom code slots are for. Two things to know: the
block sanitiser allows no `data-*`, so a script that finds its elements by
`data-` hook needs a bootstrap that attaches by class (`FoilCard.attach` was
already exported); and page CSS is injected UNSCOPED, so any `var(--token)`
the component reads must be declared on the component's own root, never
`:root`.

## Heights do not see x, and 1100 is not 1024 (21 Oct 2026)

Book to Bestseller was verified "within 4px at 1440, 900 and 390" and looked
broken at 1100: every body column 60px right of where it belonged, nine
bands at once. Two things were wrong with the verification, not one.

The first: the widths. The design has a breakpoint at 1180 that changes
column WIDTHS (`--ch-left` 400 to 340, `.offer` 440 to 380, `.price` 460 to
400) as well as gaps and type sizes. The gaps and sizes had been ported; the
widths had not, and no sampled width fell between 1024 and 1180 to show it.
Sample INSIDE every breakpoint the design declares, not only at the devices
the builder names.

The second: the measure. "Within 4px" was section HEIGHTS, column by column.
A text block that is centred instead of left-aligned has exactly the same
height. So did 13 of them, in every band, at every width — a `text` block is
`blockAlign: "center"` by default (lib/blocks.ts, the per-type defaults), and
one with a `max-width` is centred in whatever room its column has to spare.
At 1440 that was 6px, at 900 it was 86.

The verification that works is a positional diff: fetch the designer's page
into a same-origin iframe at the SAME width (the server's frame headers block
`src`, so write the fetched HTML into it with a `<base>`), snapshot `x` and
`width` for every heading, paragraph, item, image and link in both, and group
the mismatches by their (dx, dw). Eighty-six diffs collapsed to five causes,
and each cause was one number. Run it at every breakpoint edge and one width
inside each.

## The audit covers the whole handoff, and every link's target (21 Oct 2026)

Asked to check "each section's animation, scroll effect, hover effect", the
sweep that had already caught seven decorative misses in `page.css` still
left four more, and one of them was behaviour: five of the nine SAVE MY SEAT
buttons are anchors to the join section (`href="#join"`) and only the four
priced ones go to checkout. The port sent all nine to checkout. Nothing in
the stylesheet says that; it is in the markup, and in `gi.js`, which rewrites
`[data-checkout]` hrefs and is a different file from the one audited.

The other three were in the shared brand files too: a `.gi-reveal` fade on
exactly two elements (set up in `gi.css`, triggered by `gi.js`), the keyboard
focus rings, and the `.m-footer__bar` rules in `gi-min.css`.

Rule: a handoff is every file it links, not the page's own stylesheet. Grep
`assets/css/*.css` and `assets/js/*.js` with the same six strings, and read
the scripts for what they do to the DOM. Then diff the CTAs as a table
(text, target, order) against the port's buttons; a checkout button and a
scroll-to-section button look identical and measure identical.

## Re-checking a shipped page against a design revision (22 Oct 2026)

Foundations Weekend went live from the designer's 19 Oct export; the owner
then pointed at the 20 Oct "c" revision and asked for the copy and alignment
to match, line by line. Four things are worth carrying to the next one.

Diff the two RENDERED pages, not the sources. Extract every visible text unit
in order (headless Chrome, `innerText`, `text-align`, x, width, font size),
sequence-diff the lists, then look at each difference before acting on it.
Of 14 changed runs, most were markup grouping that draws identically ("Session
1." as its own element in the design, inside the heading here), and three
"misaligned" lists were the design measuring a card and this page measuring
the text inside its padding. Screenshot both before believing a number.

A band's `css_id` and a block's `cssId` share one id namespace. Production's
faq BAND already carried `join`; giving the order card row `join` too made
`getElementById` return the band, so the seat bar hid from "Why $197" onwards
and scrolled to the wrong place. Read the band ids before naming a block.

`position: sticky` holds only inside its containing block. A nav that is the
first block of the hero band unpins when the hero scrolls away, however the
design's own page (where the nav is a child of `<body>`) behaves. Pinning it
for the whole page means `fixed`, plus page CSS giving the band back the
height the nav no longer takes, with `!important`, because the band writes
its own per-device padding on the same `#section-…` id.

Never set attributes on `<html>` or `<body>` from page code. React renders
both, and anything set before hydration is a mismatch. Page code that needs a
page-wide switch toggles a `<style>` element it created itself.

## A catch-all is a claim about every error (23 Oct 2026)

The Errors page listed most live subscriptions as "Stripe missing" while the
nightly sync had read the same ids from Stripe that morning, one by one, with
the same key. `findSubscriptionDrift` asked 20 at a time and its `catch {}`
called every failure "missing", so a refused burst read as "Stripe has never
heard of it". Two identical `*/5` retry crons run the same check, which makes
bursts on an account five other apps share more likely, not less.

- Name the error you mean. Only `code === "resource_missing"` says an object
  does not exist; a 429, a timeout or a bad key says nothing about it.
- An answer you did not get is its own state. Ask once more, slowly, then show
  it apart from the results instead of folding it into one.
- Before believing a mass "missing", look for a second reader of the same
  thing (here the `subscriptions` table, synced at 03:10) and compare.
