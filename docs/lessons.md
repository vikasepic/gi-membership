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
