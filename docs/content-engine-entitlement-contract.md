# Content Engine — entitlement contract

**For the Content Engine developer. From the Greater Inside store (grow.greaterinside.com).**
Written 7 September 2026, ahead of splitting Content Engine into three offers.

## What is changing

Content Engine is being sold as three separate offers:

| Offer | Public page | Grants |
|---|---|---|
| Instagram only | `/o/content-engine-instagram` | `instagram` |
| LinkedIn only | `/o/content-engine-linkedin` | `linkedin` |
| Both | `/o/content-engine` | `instagram`, `linkedin` |

Each is a separate Stripe subscription with its own price, its own trial and its
own cancellation. **One person can hold more than one at the same time** — buy
Instagram today, add LinkedIn next week, and they have two live subscriptions.

## The one thing you must confirm

The store already sends you a `channels` array. What changes is that a person
can now have several subscriptions feeding it.

**The store sends ONE entitlement per person, carrying the union of every
channel they are currently entitled to.** You will not receive one message per
subscription — the store works out the total and sends that.

So:

> **Replace your stored channel list with whatever arrives. Never merge it.**

If you merge, a cancelled Instagram subscription leaves Instagram unlocked
forever, because nothing will ever arrive that says "remove instagram" — it
simply stops being in the list.

## The request you receive

`POST <your provisionEndpoint>`

```
content-type:    application/json
x-store-secret:  <the shared secret you already have>
```

```json
{
  "email": "buyer@example.com",
  "fullName": "Buyer Name",
  "entitlementKey": "content-engine",
  "channels": ["instagram", "linkedin"],
  "status": "active",
  "hasAccess": true,
  "stripeCustomerId": "cus_…",
  "stripeSubscriptionId": "sub_…",
  "occurredAt": 1757212800
}
```

| Field | Meaning |
|---|---|
| `email` | The identity. This is the join key — not the Stripe ids. |
| `entitlementKey` | Stays `content-engine` for all three offers. Do not key channel access off this. |
| `channels` | **The complete list they should have.** Replace, don't merge. |
| `status` | `active` \| `trialing` \| `canceled` \| `past_due`. **One value across all their subscriptions** — see the ladder below. |
| `hasAccess` | `false` only when `status` is `canceled`, i.e. only when **every** subscription they hold for this app is cancelled. |
| `stripeSubscriptionId` | One of their subscriptions. **Not stable** when a person holds two — do not use it as your primary key. |
| `occurredAt` | Unix seconds. Use it to ignore a message older than one you have already applied. |

### One `status` for several subscriptions

A person can hold more than one subscription to this app, and `status` is a
single value. It is the healthiest of what they hold:

```
trialing   if any subscription is trialing
active     else if any is active
past_due   else if any is past_due
canceled   else
```

So **one failing card cannot freeze a workspace somebody is still paying for.**
Instagram `active` + LinkedIn `past_due` arrives as `active`, `hasAccess: true`,
with both channels listed. `hasAccess: false` means every subscription is gone.

`channels` is the union of every subscription that is **not cancelled** —
`active`, `trialing` **and `past_due`**. A cancelled subscription's channel
stops appearing, which is how a single cancellation revokes one channel and
leaves the rest.

**`past_due` keeps its channel on purpose.** Stripe goes on collecting for
days and often succeeds, so a first failed charge must not take away something
already paid for. `canceled` is the revoke signal; `past_due` is a warning you
can act on however you like — the store keeps sending the real `status`.

**`channels` is omitted entirely when the list is empty** — it is not sent as
`[]`. An omitted `channels` with `hasAccess: false` means revoke everything.
An omitted `channels` with `hasAccess: true` **does** happen and means
**no change** — never a grant, and never a revoke. It arrives when the store
holds an entitlement it cannot attribute to an offer, which is what an
app-reported sale is. Treating it as a whole-app grant is an over-grant; there
is no list to act on, so the right response is to leave what you have alone.

Reply `2xx`. Any other status, or a redirect, is treated as a failure and the
store queues it for retry. **Do not put the endpoint behind auth middleware
that 307s to a login page** — the store follows no redirects precisely because
a login page's `200` would otherwise read as "delivered".

## Cases to test

| What happens | What you receive | What you should end up with |
|---|---|---|
| Buys Instagram only | `channels: ["instagram"]`, `trialing` | Instagram on, LinkedIn off |
| Then buys LinkedIn too | `channels: ["instagram","linkedin"]`, `active` | Both on |
| Cancels LinkedIn, keeps Instagram | `channels: ["instagram"]`, `active` | Instagram on, **LinkedIn off** |
| Cancels the last one | `hasAccess: false`, `canceled`, no `channels` | Both off |
| Buys the bundle outright | `channels: ["instagram","linkedin"]`, `trialing` | Both on |
| Payment fails | `status: "past_due"` | Your call — the store keeps sending the real status |

The third row is the one that catches a merge bug. If LinkedIn is still on
after it, the implementation is wrong.

## What you do NOT need to do

- No new endpoint. Same URL, same secret, same shape.
- No change to `entitlementKey` handling — it stays `content-engine`.
- Nothing about trials, prices or coupons. The store owns all of that; you only
  ever see the resulting channel list and status.
- No de-duplication across subscriptions. The store does that before sending.

## Questions back to the store

If any of these is true, tell the store before it ships:

1. You currently merge channels rather than replacing them.
2. You key access off `stripeSubscriptionId` rather than `email`.
3. You cannot represent "LinkedIn only" — i.e. channels are all-or-nothing today.
