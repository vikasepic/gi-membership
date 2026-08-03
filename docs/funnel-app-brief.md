# Funnel App — integration brief

**Read [`app-integration-guide.md`](./app-integration-guide.md) first.** That is
the full protocol and applies to every connected app: the login model, the
payload shapes, the signature scheme, verified reference implementations, and
the test matrix. It is vendor-neutral and self-contained.

**This file is only the part specific to the Funnel App:** your registered
values, and everything that changes because you run on **Vercel + Supabase
Cloud** rather than the store's own box. The generic guide cannot know that
`crypto.timingSafeEqual` does not exist on Vercel's Edge runtime, and that one
detail will cost you an afternoon if you meet it by surprise.

The store side is built, deployed, and proven — Content Engine has been running
this exact protocol in production, including a backfill of 13 existing
subscribers. Nothing here is speculative.

---

## 1. Your registered values

You are already registered. The row exists on the store today.

| | Value |
|---|---|
| Store base URL | `https://grow.greaterinside.com` |
| Your app id | `8ee0321c-c78b-4638-a4a6-81a70d1e37bb` |
| Your app key | `funnel` |
| Your base URL | **⚠ not set yet** — currently a placeholder |
| We will call | `POST {your base URL}/api/store/provision` |
| We will send users to | `GET {your base URL}/auth/store-handoff?token=…` |
| You report changes to | `POST https://grow.greaterinside.com/api/apps/entitlement` |
| `entitlementKey` you will receive | `funnel` |
| Status | **`active = false`** until your endpoints exist |

**Two things are outstanding on the store side**, both one-line changes we make
once you tell us:

1. **Your real base URL.** Registered as `https://REPLACE-ME.vercel.app`.
2. **Flipping `active` to true.** While it is false the store will not call you,
   which is deliberate: an offer pointing at endpoints that return 404 fails
   silently on every purchase.

The row exists now, rather than after you are finished, so the shared secret is
live and you can set it in Vercel today.

**Shared secret:** in the credentials file, sent separately. Never in this repo,
never in a client bundle, never in a `NEXT_PUBLIC_*` variable. The *same* secret
works both directions — it authenticates our calls to you and yours to us.

---

## 2. The question that decides how much work this is

**Does the Funnel App bill through the same Stripe account as the store?**

Settle this before estimating; it is the difference between "two endpoints" and
"two endpoints plus a billing refactor".

- **Different Stripe accounts** → §7 of the guide does not apply. The
  `stripeCustomerId` and `stripeSubscriptionId` we send are informational only
  and will not resolve against your account. Ignore them, key everything off
  `email`, and you are done after the two endpoints.
- **Same Stripe account** → your webhook already receives events for
  subscriptions the store created. Store-created subscriptions carry
  `metadata.store_created = "true"`. Filter on it and skip those events, or
  model more than one subscription per account. If your code assumes it created
  every subscription it sees — the common "one subscription row per account,
  overwritten on each webhook" shape — the two systems will fight over who has
  access. This is what we had to resolve with Content Engine.

Also: **treat `trialing` as active access.** The store creates subscriptions
with a trial. If any code path assumes `status === "active"` means entitled, a
store-originated trial user is locked out for exactly the days the funnel exists
to convert.

---

## 3. Vercel: four things that will bite you

### 3.1 Use the Node runtime, not Edge

`crypto.timingSafeEqual` and `crypto.createHmac` are Node APIs. Vercel's Edge
runtime has WebCrypto only, and your handler will throw at request time rather
than at build time — so this passes CI and fails in production.

Put this at the top of **both** route files:

```ts
export const runtime = "nodejs";
```

If you would rather run on Edge, use WebCrypto and compare in constant time
yourself. The Node runtime is less code and the cold start difference does not
matter for two endpoints called a few times a day.

### 3.2 The store aborts after 5 seconds — mind the cold start

We `AbortSignal.timeout(5000)` the provision call. A cold Vercel function plus a
Supabase connection plus your own work can approach that.

- Do the entitlement write and **return**. Push welcome emails, workspace
  seeding, and analytics to a queue or a `waitUntil`.
- Do not `await` anything you do not need to have finished before answering.

Missing the deadline is not fatal — see §3.4 — but it is the difference between
provisioning at purchase and provisioning at first login.

### 3.3 Preview deployments are not your app

We call **one fixed base URL**. Every Vercel preview deploy gets its own
hostname, and none of them are it.

- Register your **production** domain (custom domain, or the stable
  `*.vercel.app` production alias — not a per-commit preview URL).
- If Vercel's **Deployment Protection** is on for production, our
  server-to-server call gets an auth wall instead of your handler. Either turn
  it off for production or add a
  [protection bypass](https://vercel.com/docs/deployment-protection) — and tell
  us, because we would then need to send the bypass header.

This one is worth checking explicitly: a 401 from Vercel's auth wall looks
exactly like a wrong shared secret from our side.

### 3.4 There is no retry queue — build the safety net

The store's provision call is **best-effort and never blocks the purchase**. If
you return 500, time out, or are mid-deploy, the customer is still charged and
still owns the product. We log it and move on.

- A missed **grant** self-heals — but only if your handoff endpoint also
  provisions on arrival. **Implement provisioning in both endpoints.** This is
  the single most important line in this document.
- A missed **revoke** does not self-heal. Nothing brings the user back to
  trigger a correction. If revocation matters to your margins, grant access in
  windows — say 35 days, refreshed on every `active` or `trialing` message — so
  access lapses on its own if our messages stop arriving.

---

## 4. Supabase: five things that will bite you

### 4.1 The provision endpoint must use the service role key

It runs with no user session, so RLS will reject everything under the anon key.

```ts
import { createClient } from "@supabase/supabase-js";

// Server-only. If this key ever reaches the browser, anyone can read and write
// every row in your database — it bypasses RLS by design.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,     // never NEXT_PUBLIC_
  { auth: { persistSession: false, autoRefreshToken: false } },
);
```

### 4.2 Creating a user with no password

The store's customer has never visited you and has no password. That is normal
and permanent — many will never set one.

```ts
const { data, error } = await admin.auth.admin.createUser({
  email,                    // already lowercased by us
  email_confirm: true,      // they proved identity to the store; do not re-verify
});
```

`createUser` **fails if the email already exists**, and that will happen — we
retry, and the handoff re-drives provisioning. Handle it as find-or-create:

```ts
async function findOrCreateUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (data?.user) return data.user;

  // Already there. listUsers is paginated — the default page is 50, so a naive
  // first-page scan silently stops finding people once you pass 50 users.
  for (let page = 1; page <= 20; page++) {
    const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const hit = list?.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (!list?.users.length) break;
  }
  throw new Error(`could not create or find ${email}: ${error?.message}`);
}
```

That pagination detail is a real bug we hit on the store side. It stays quiet
until you have enough users to matter, then starts creating duplicates.

### 4.3 Signing the user in during handoff

You have verified the token, so the person is authenticated. You now need a
Supabase session for them without a password.

```ts
// Mint a one-time link server-side and consume it immediately. The user never
// sees it and it never travels by email.
const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
});
if (error || !data.properties?.hashed_token) throw new Error("could not mint session");

// verifyOtp on a route-handler client sets the auth cookies on the response.
const supabase = createRouteHandlerClient();          // your normal SSR client
await supabase.auth.verifyOtp({
  token_hash: data.properties.hashed_token,
  type: "magiclink",
});
```

**Do not** try to hand-craft a JWT with the Supabase JWT secret. It works right
up until refresh-token rotation, then breaks in a way that is very hard to
diagnose. The store uses exactly the pattern above.

**Server Components cannot set cookies.** The handoff must be a **route
handler** (`app/auth/store-handoff/route.ts`), not a page. This is a Next.js
rule people rediscover painfully.

### 4.4 Single-use tokens need a table

Vercel functions share no memory, so an in-process `Set` of consumed tokens does
nothing — the next request may land on a different instance. Enforcing single
use requires storage.

```sql
create table store_handoff_tokens (
  token_hash text primary key,          -- sha256 of the token, never the token
  expires_at timestamptz not null
);
-- Rejecting a replay is the whole point: a leaked URL in browser history or a
-- referrer header must not stay a working back door.
create index on store_handoff_tokens (expires_at);
```

Insert on use; let the primary key reject the replay. Sweep expired rows on a
cron — they are worthless after `exp`.

### 4.5 Normalise email everywhere

Store and app reconcile on **lowercased email**. Lowercase before every lookup
and every insert. Supabase Auth is case-insensitive on email but your own tables
are not, and one `Buyer@Example.com` row is enough to split a customer in two.

---

## 5. What to build, in order

1. **Answer the Stripe question** in §2. It changes the scope.
2. **`POST /api/store/provision`** — guide §3. Verify the secret timing-safe,
   find-or-create by lowercased email, apply `status`.
   **`canceled` must remove access.** This is not a grant-only endpoint; wiring
   it that way means you keep serving refunded customers, and nothing will tell
   you.
3. **`GET /auth/store-handoff`** — guide §4. Verify the HMAC timing-safe,
   check `exp`, enforce single use, **provision on arrival**, mint a session,
   redirect in. Reference verifiers for Node and Python are in the guide and
   have been tested against our signer.
   - The HMAC is computed over the **base64url string**, not the decoded JSON.
     This is the single most common integration bug.
4. **Report your own sales** to `POST /api/apps/entitlement` — guide §5.
   **Required if the Funnel App can sell access on its own.** Without it the
   store will offer your subscription to someone who already pays you, and
   accepting starts a second subscription that bills them twice. `linked: false`
   in the response means we parked it because that email has no store account
   yet — that is success, not an error. Do not retry.
5. **Tell us your production base URL** so we can point the row at it and flip
   `active` to true.
6. **Test** against the matrix in guide §8.

---

## 6. Testing before we are involved

Everything below runs against your own deployment with just the shared secret.
You do not need us until step 5 above.

**Mint a valid handoff token** (Node — your real app id is filled in):

```js
import crypto from "node:crypto";

const secret = process.env.STORE_SHARED_SECRET;
const payload = {
  email: "test@example.com",
  userId: "00000000-0000-0000-0000-000000000001",
  appId: "8ee0321c-c78b-4638-a4a6-81a70d1e37bb",
  exp: Math.floor(Date.now() / 1000) + 300,
};
const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
console.log(`${body}.${sig}`);
```

**Call your own provision endpoint:**

```bash
curl -i -X POST https://your-app.vercel.app/api/store/provision \
  -H "content-type: application/json" \
  -H "x-store-secret: $STORE_SHARED_SECRET" \
  -d '{"email":"test@example.com","entitlementKey":"funnel","status":"trialing","hasAccess":true,"stripeCustomerId":null,"stripeSubscriptionId":null,"occurredAt":1785300000}'
```

**Report a sale to the store.** This is the call you will make in production —
but note that **it returns `401` until we set your app active** (§1). The store
refuses inbound calls from an inactive app, by design: deactivating an app has
to stop it granting access, or the flag is not a kill switch.

```bash
curl -i -X POST https://grow.greaterinside.com/api/apps/entitlement \
  -H "content-type: application/json" \
  -H "x-store-secret: $STORE_SHARED_SECRET" \
  -d '{"email":"test@example.com","entitlementKey":"funnel","status":"active","stripeSubscriptionId":null}'
```

**Do not read a `401` here as a wrong secret.** While your app is inactive the
two are indistinguishable, and that is a genuinely expensive hour. Your secret
has already been checked against the store's record — it is correct as given.
Once we activate you, expect `{"ok":true,"linked":false}` for an email with no
store account. `linked:false` is success, not an error.

**The cases people skip and regret:**

| Case | Expected |
|---|---|
| Handoff for an email never provisioned | User created and entitled on the spot |
| `status: "canceled"` | Access **removed** |
| `status: "past_due"` | Access **kept** — Stripe is still retrying the card |
| Same handoff token twice | Second attempt rejected |
| One character of the signature changed | Rejected |
| Provision called twice, same email | One user, one entitlement |
| Provision with a wrong secret | `401`, nothing created |

The first two are the ones that go wrong quietly. A handoff that cannot
provision means a failed grant is permanent; a grant-only provision endpoint
means refunded customers keep their access and nothing ever reports it.

---

## 7. Going live together

1. You deploy both endpoints to production.
2. You send us the production base URL.
3. We point the row at it and set `active = true`.
4. We run a test purchase in **Stripe test mode**. You should see a provision
   call with `status: "trialing"` within seconds.
5. You open the app from the store library — the handoff signs the user in with
   no prompt.
6. We cancel the test subscription; you receive `status: "canceled"` and revoke.

If you have existing subscribers who should already have store access, tell us —
Content Engine backfilled 13 of them through the `/api/apps/entitlement`
endpoint in one pass, and the same approach works here.
