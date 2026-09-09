# Built-in apps

An app the store sells that runs **inside this codebase**, on this domain,
against this database. Two exist: **Micro-Product Builder** at
`/apps/micro-product-builder` and the **Viral Hook Generator** at
`/apps/hook-generator`. This is the counterpart to
[`connecting-a-new-app.md`](./connecting-a-new-app.md), which is for an app
that runs elsewhere and is reached through the HTTP bridge.

## The model

The `apps` table holds both kinds, told apart by `apps.kind`
(`internal` | `external`, migration 0074). Everything the store already does
for an app applies to both:

| | External (Content Engine, Funnel App) | Internal |
|---|---|---|
| Row in `apps` | base URL, endpoints, shared secret, mapping | key and name only. Opens at `/apps/<key>` |
| Sold as | an offer that grants the app | an offer that grants the app, usually at a one-time price |
| Ownership | `ownership.app_id` per purchase | same row, same statuses |
| Telling the app | `notifyAppEntitlement` over HTTP, retried from the error queue | nothing. `notifyAppEntitlement` returns at once; the app reads the ownership row itself |
| Opening it | library mints a signed handoff token | library links to the route; the session cookie is already there |
| Refund, chargeback, manual revoke | ownership `canceled`, then a push | ownership `canceled`. The app refuses on the next request |
| Inbound `/api/apps/entitlement` | authenticated by the app's secret | never. `appForSecret` reads external rows only |

**Access is the ownership row.** `lib/builtin-apps/access.ts` answers every
page and route of an internal app with the same live-ownership check the
library uses for "Open" (`subscribedToApp`): signed out goes to `/login` and
comes back, no live ownership goes to the offer page `/o/<key>`, an
unregistered key is a 404. There is no flag on the member and nothing to sync.

`lib/builtin-apps/registry.ts` is the list of keys this build has code for.
A row in `apps` says an internal app exists and can be sold; the registry says
the store can open it. Admin → Apps shows a warning when a row has no
implementation, which is the one way the two can drift.

## Where the code lives

```
app/(apps)/layout.tsx                          frame and styles for every built-in app
app/(apps)/builtin-apps.css                    chat, document and print styles, on store variables
app/(apps)/apps/<key>/                         the app's pages, behind requireInternalApp
app/api/product-builder/{sessions,coach,build} the Product Builder's routes
app/api/hook-generator/generate                the Hook Generator's route
lib/anthropic.ts                               one model client per app, each on its own key
lib/builtin-apps/access.ts                     who may use an internal app
lib/builtin-apps/registry.ts                   which keys this build implements
lib/builtin-apps/product-builder/              prompts, stages, coach turn, build, sessions
lib/builtin-apps/hook-generator/               prompt, generation, history
components/apps/app-header.tsx                 the slim top bar
components/apps/<key>/                         the app's client components
supabase/migrations/0074_app_kind.sql          apps.kind and the two rows
supabase/migrations/0075_builtin_app_tables.sql pb_sessions, pb_messages, pb_documents, hook_generations
```

Two rules, both because the store runs in the same process:

- **A route never throws past its handler.** Model calls are wrapped, and a
  streaming route reports failure as an event on the stream (`sse.ts`), never
  as an exception.
- **The browser never touches a table.** Pages load data on the server with
  the service client and hand it to client components; mutations go through a
  route or a server action that checks ownership again.

## Environment

Each app bills to its own Anthropic account, so each has its own key. There
is no shared fallback on purpose: a missing key fails that app's requests with
a message naming the variable, rather than quietly charging the other app's
account. `lib/anthropic.ts` is the only place the names are read.

| Variable | Where | Note |
|---|---|---|
| `ANTHROPIC_API_KEY_PRODUCT_BUILDER` | Coolify runtime environment | Every model call in Micro-Product Builder: coach, shape extraction, build. |
| `ANTHROPIC_API_KEY_HOOK_GENERATOR` | Coolify runtime environment | Every model call in the Viral Hook Generator. |
| `ANTHROPIC_WORKSPACE_ID_PRODUCT_BUILDER`, `ANTHROPIC_WORKSPACE_ID_HOOK_GENERATOR` | optional | Only for identity-linked keys. |
| `COACH_MODEL`, `BUILD_MODEL`, `HOOK_MODEL` | optional | Default `claude-sonnet-5`. |

Nothing public, nothing at build time.

## Going live: the runbook

1. **Apply 0074 and 0075** to production by hand, like every migration. 0074
   inserts the two internal rows, active, for every store.
2. **Set both keys** (`ANTHROPIC_API_KEY_PRODUCT_BUILDER`, `ANTHROPIC_API_KEY_HOOK_GENERATOR`) in Coolify and redeploy.
3. **Prove a full build survives the proxy.** A guide build streams for 4 to 6
   minutes. Node has no limit; the reverse proxy in front of the container has
   a response timeout that is not visible from this repo. Grant yourself the
   Product Builder from Admin → Members, run a quick session to the gate, press
   Build, and watch it finish. If the proxy cuts the stream, the fallback is a
   server-side build the page polls; say so before selling.
4. **Create the offers**, last, in Admin → Offers: grant an app, pick the
   internal app, one price, one time, $19, no trial. Write the page at
   `/o/<key>` in the page editor. Attach as a bump or upsell if wanted. The
   home page's memberships section lists recurring offers only, so link to
   `/o/<key>` from a page block or an ad; wherever the membership card does
   draw a one-time offer it reads "One-time payment".
5. **Test purchase** in Stripe test mode: buy, open from the library, refund
   from Admin → Orders, confirm the app refuses.
6. Retire the standalone deployments and their Supabase projects. Neither has
   paying customers to bring across.

## What must pass before calling it done

| Case | Expected |
|---|---|
| Grant an internal app (purchase, manual grant, refund) | Ownership row written or canceled, no HTTP call, nothing in Admin → Errors |
| Grant Content Engine after 0074 | Provision call and handoff exactly as before |
| Signed out, open an app route | Redirect to login, then back to the app |
| Signed in, no live ownership | Redirect to the offer page |
| Open another member's session id | 404 |
| Quick session from intake | READY within about seven answers, stage marker on every reply |
| Skip a step | Coach fills it with labelled guesses, panel shows the badge |
| Full build on the deployed store | Streams to the end, document saved, no em or en dash |
| Hook generation | Six hooks, history row written, visible on reload |
| Refund, then reload the app | Refused, sent to the offer page |
| Admin → Apps | Internal rows show kind and route, no secret, no resend |

The unit tests beside the code cover the parts a model quirk can break: the
stage-marker parser, the pace note, the input parsing, the dash scrubber, the
internal-app guards on `notifyAppEntitlement` and `appForSecret`, and the
membership card's one-time wording.

## Adding a third built-in app

1. Add the key to `lib/builtin-apps/registry.ts`.
2. Insert the row: `insert into apps (store_id, key, name, kind) values (..., 'internal')`.
3. Tables in a new migration, in the conventions above.
4. Pages under `app/(apps)/apps/<key>/`, each starting with
   `await requireInternalApp("<key>")`; routes under `app/api/<key>/`, each
   starting with `internalAppAccess("<key>")`.
5. An offer that grants it, last.
