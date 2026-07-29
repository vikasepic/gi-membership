# Content Engine — integration brief

Read [`app-integration-guide.md`](./app-integration-guide.md) first. It is the
full protocol and applies to every connected app. **This file is only the part
specific to Content Engine**: your registered values, and the two conflicts in
CE's existing code that the generic guide can't know about.

---

## 1. Your registered values

You are already registered on the store. Nothing to request — these are live in
production today.

| | Value |
|---|---|
| Store base URL | `https://grow.greaterinside.com` |
| Your app id | `00000000-0000-0000-0000-0000000000a1` |
| Your app key | `content-engine` |
| Your base URL (as we have it) | `https://content.greaterinside.com` |
| We will call | `POST https://content.greaterinside.com/api/store/provision` |
| We will send users to | `GET https://content.greaterinside.com/auth/store-handoff?token=…` |
| You report changes to | `POST https://grow.greaterinside.com/api/apps/entitlement` |
| `entitlementKey` you will receive | `content-engine` |

**Shared secret:** sent separately, never in a document or a repo. It is the
value in `apps.shared_secret` on the store. Set it as `STORE_SHARED_SECRET` (or
your own name) in CE's environment. The *same* secret is used in both
directions — it authenticates our calls to you, and yours to us.

**Current status as of writing:** both endpoints return `404` on the live site,
so nothing is connected yet. Everything on the store side is built and
deployed.

```
https://content.greaterinside.com/                     307   (app is up)
https://content.greaterinside.com/api/store/provision   404   ← you build this
https://content.greaterinside.com/auth/store-handoff    404   ← you build this
```

---

## 2. The question that decides how much work this is

**Does Content Engine bill through the same Stripe account as the store?**

The store's subscriptions are created in its own Stripe account. Everything
below depends on this answer, so settle it before estimating.

- **Different accounts** → §3 and §4 do not apply. The `stripeCustomerId` and
  `stripeSubscriptionId` we send are informational only and will not resolve
  against your account. Ignore them, key everything off `email`, and you are
  done after the two endpoints.
- **Same account** → §3 and §4 are mandatory and are the real work. Your
  webhook already receives events for subscriptions the store created, and
  without changes it will fight the store over them.

---

## 3. Conflict: who owns subscription state

*Only if you share the Stripe account.*

Store-created subscriptions are tagged `metadata.store_created = "true"`.

Our earlier read of CE's billing code found a **single subscription row per
org** (`billing/checkout.ts`), updated from the Stripe webhook. That model
cannot represent a second, externally-created subscription: when a store
subscription arrives, it will overwrite whatever CE had, or CE will overwrite
the store's state on the next event. Either way the two systems disagree about
who has access.

Pick one and enforce it:

- **Store owns store-created subs.** Filter on `metadata.store_created` in CE's
  webhook and skip those events. Access for those users comes from our
  provision call instead.
- **CE owns all subscription state.** Then CE must model more than one
  subscription per org and reconcile ours as a distinct row.

The first is less work. Neither is optional if the accounts are shared.

> Verify the current shape of `billing/checkout.ts` before acting — that
> reading predates this integration and CE may have moved since.

---

## 4. Conflict: trials

*Only if you share the Stripe account.*

The store creates Content Engine subscriptions with `trial_period_days: 7`.
Our earlier read found CE's `createCheckoutSession` sets no trial at all, so
CE's code may never have seen one of its own subscriptions in `trialing`.

Treat `trialing` as **active access**. If any CE code path assumes
`status === "active"` means entitled, a store-originated trial user will be
locked out for their first seven days — the exact seven days the funnel is
built to convert.

---

## 5. What to build, in order

1. **Decide the Stripe question** in §2. It changes the scope.
2. **`POST /api/store/provision`** — guide §3. Verify the secret timing-safe,
   find-or-create by lowercased email, apply `status`. **`canceled` must remove
   access** — this is not a grant-only endpoint.
3. **`GET /auth/store-handoff`** — guide §4. Verify HMAC timing-safe, check
   `exp`, enforce single-use, provision on arrival, mint a CE session, redirect
   in. Reference verifiers for Node and Python are in the guide and have been
   tested against our signer.
4. **Report CE's own subscriptions** to `POST /api/apps/entitlement` — guide §5.
   **Required**, because CE sells subscriptions directly. Without it the store
   will offer Content Engine to someone who already subscribes through CE, and
   accepting starts a second subscription that bills them twice.
5. **Resolve §3 and §4** if the Stripe accounts are shared.
6. **Test** against the matrix in guide §8, especially: `canceled` removes
   access, and a handoff for an email never provisioned still works.

---

## 6. How to test together

The store is in **Stripe test mode**. Once your two endpoints exist:

1. Tell us, and we will run a test purchase of the Content Engine offer.
2. You should see a provision call with `status: "trialing"` within seconds.
3. Open the app from the store library — the handoff should sign the user in
   with no prompt.
4. We cancel the test subscription; you should receive
   `status: "canceled"` and revoke access.

You can exercise your side before we do anything — guide §8 has a script that
mints a valid handoff token from the shared secret, and a curl for the
provision endpoint.
