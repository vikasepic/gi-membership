<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# How this repo is worked

This file is loaded into every Claude Code session in this repo, on every
machine, after every pull. It is the shared memory. Keep it short: rules that
cost a round when forgotten, and pointers to the docs that hold the depth.
When a review costs you a round, add the lesson to `docs/lessons.md` in the
same PR — that is how the next person's Claude avoids your mistake.

## Shipping

- **Announce before every push to `main`.** A push deploys production through
  Coolify. Send the 60-second notice (`POST /api/deploy-notice`, bearer
  `CRON_SECRET`), wait the full 60 seconds, then push. The only bypass is the
  exact phrase `push system override` from the owner.
- **Migrations do not run on deploy.** There is no migrate step in the
  Dockerfile. Apply the migration to production by hand *before* the image
  that reads the column serves traffic, then `notify pgrst, 'reload schema';`
  so PostgREST sees it. Order matters: a column written after a card is
  charged, on a schema the API does not know, charges the buyer and fails the
  order. Check `ls supabase/migrations | tail -1` *and* any open spec before
  numbering a new one.
- **Local green is not CI green.** `.env.local` supplies the service key, so
  every test that reaches the database passes here and fails on CI. After
  every push: `gh run list --branch main --limit 1`. To reproduce CI: move
  `.env.local` aside and run the file.
- **Stripe is LIVE in production.** Local is test mode. The Stripe account is
  shared with five other apps — their charges dominate the payments list;
  filter on `metadata["store_created"]:"true"`.
- **Never print a secret.** Credentials live outside this repo; reference
  them by name, read them into a shell variable, never echo them.
- A worktree needs a real `npm ci`. A symlinked `node_modules` breaks
  Turbopack; the fix is the install, never a `turbopack.root` in the
  production config.

## Code that bites

- **`new Map(array)` is last-wins.** Concatenating "products then offers" and
  expecting the product to win a key collision gives you the offer. Build
  first-wins explicitly and say why.
- **CHECK constraints are invisible to tsc, vitest and `next build`.** A
  feature can be green everywhere and unable to save. Read the migration.
- **PostgREST truncates at 1000 rows silently**, and your `ORDER BY` decides
  which rows vanish. Use `allRows` (lib/traffic.ts) for anything that grows.
- **Integration suites share one local store and run in parallel.** Any
  unordered pick can grab another suite's fixture. Order every query that
  picks one row; prefix fixtures `zz-` with a timestamp; clean up in
  `afterAll` in FK order. A test that sits outside its
  `describe.skipIf(!canRun)` block runs on CI with no database.
- **Every value read off a URL is a whitelist, never a parse.** It selects a
  view or a comparator; an unrecognised value picks the default.
- **Counting is fire-and-forget** (`void recordPageHit(...)`) and everything in
  `lib/traffic.ts` swallows its own errors — it runs on pages that take money.
- **A test must be able to fail.** `textContent` never contains markup, so
  `not.toContain(">4<")` passes forever; a comment naming an assertion's
  target does not test it; a source-text assertion is not a behaviour test.
- **A grant records its target at that moment.** Fix an offer's grant before
  granting anyone; a wrong one means revoke, then re-grant.
- **After any deploy, a tab left open breaks on its next navigation** (404 or
  a dead link). Hard-refresh before debugging. `deploymentId` in
  `next.config.ts` is what makes that a reload instead of a 404 — keep it.

## Where the depth is

| Read this when | File |
|---|---|
| Adding or changing a built-in app (runs in this codebase) | `docs/builtin-apps.md` |
| Connecting an external app over the bridge | `docs/connecting-a-new-app.md`, `docs/app-bridge-contract.md` |
| Products, offers, bumps, upsells, prices | `docs/products-and-offers.md`, `docs/upsell-pages.md` |
| Schema and every migration's why | `docs/DATABASE.md` |
| Deploying, secrets, going live | `docs/going-live.md` |
| Errors, retries, the queue | `docs/errors-and-retries.md` |
| Before touching payments, migrations or tests | `docs/lessons.md` |
| Design decisions behind a feature | `docs/superpowers/specs/` |
