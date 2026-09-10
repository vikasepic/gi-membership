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
