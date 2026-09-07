# Content Engine — response to the entitlement contract

**From the Content Engine developer. 7 September 2026.**
Re: `content-engine-entitlement-contract.md` (7 Sep), ahead of the three-offer split.

## Your three questions

| Question | Answer |
|---|---|
| 1. Do you merge channels rather than replacing them? | **No.** We replace. We grant exactly what arrives and revoke any store-granted channel not in the list. |
| 2. Do you key access off `stripeSubscriptionId`? | **No.** Email is the join key. The subscription id is stored only on the freeze row and never used to look anyone up. |
| 3. Can you represent "LinkedIn only"? | **Yes.** Per-channel since 20 August, not all-or-nothing. |

**Nothing on our side blocks the split.** Your test table behaves as specified —
including row 3 (*cancels LinkedIn, keeps Instagram*), which is the one that catches a
merge bug. LinkedIn goes off.

Also confirmed live in production: `POST /api/store/provision` without a valid secret
returns **401**, not a redirect. The endpoint is outside our auth middleware.

## One case worth tightening: `channels` omitted with `hasAccess: true`

Your doc mentions this only in passing — *"should not happen for Content Engine; treat it
as no change rather than revoke"*. It is worth promoting, because **it happens on every
sign-in through a path you can't see from the store side.**

When a buyer clicks "Open the app", they land on our `/auth/store-handoff` route. That
route self-heals a possibly-missed provision call by granting entitlement on arrival — and
it **cannot know which offers the person bought**, so it sends no `channels`.

Until today that fell through to a whole-app bundle grant. Once the offers split, that
means: **an Instagram-only buyer silently gains LinkedIn every time they open the app from
the store.** We found it auditing against your contract; it is now fixed on our side —
omitted `channels` means *no change*, never a fallback grant.

Two asks:

1. **Confirm "no change" is the intended reading.** We have implemented exactly that.
2. **If you can, always include `channels` whenever `hasAccess: true`** — including on
   retries. Then the ambiguous case never arises for anyone.

If any other connected app treats an omitted list as "grant everything", it has the same
silent over-grant today.

## Two questions back to you

**1. What is `occurredAt` the timestamp *of*?**

We now use it to ignore out-of-order messages — necessary, because replace-not-merge means
a late retry doesn't just repeat work, it *undoes* newer state (buy Instagram → add
LinkedIn → the first message finally lands → LinkedIn revoked).

That guard only works if `occurredAt` is **when the entitlement changed**, and stays fixed
across retries of the same message. If it is refreshed at send time, a retried old message
carries a new timestamp and defeats the guard entirely. Please confirm which it is.

**2. Whose `status` do we get when someone holds two subscriptions?**

`channels` is documented as the union across subscriptions, but `status` is a single value.
If a person holds Instagram (`active`) and LinkedIn (`past_due`), which arrives?

It matters because we act on `hasAccess`, and `hasAccess: false` freezes the whole
workspace. If one failing card can produce `hasAccess: false` while another subscription is
still healthy, we would freeze someone who is still paying you for Instagram.

Our reading is that `hasAccess` is `false` only when *every* subscription is cancelled —
your line *"`false` only when `status` is `canceled`"* implies that. Worth stating
explicitly in the contract, since it is now a multi-subscription world.

## Changes we made

- Omitted `channels` + `hasAccess: true` → **no change** (was: grant the whole-app bundle)
- `occurredAt` → out-of-order guard; older messages ignored, still answered **2xx** so you
  stop retrying
- `fullName` → now used for the buyer's account name (previously derived from the email)

No endpoint change, no secret change, no shape change. Same URL, same everything.
