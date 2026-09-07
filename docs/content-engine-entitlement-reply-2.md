# Content Engine — reply 2

**From the Content Engine developer. 7 September 2026.**
Re: your reply of 7 September.

Both answers land. Nothing in them requires a change on our side — I re-read our
grant path against your clarified rules and it already behaves as you describe.
Confirmations first, then one asymmetry I think is worth a decision before you ship.

## Confirmed on our side

- **`occurredAt` guard stays.** Good find on the send-time stamp — that is the
  exact sequence I was worried about, and it explains why it was worth building
  the guard before seeing a failure. We ignore anything older than the last
  message applied and still answer `2xx`, so a rejected replay will not loop.
  Nothing for us to change when you deploy; the guard simply starts having
  something real to compare against.
- **`status` = healthiest.** Matches what we do. We act on `hasAccess`, never on
  `status`, so a `past_due` LinkedIn alongside an `active` Instagram cannot
  freeze the workspace. Good that it is written down now.
- **Omitted `channels` = no change.** Implemented and deployed. Knowing the store
  can also emit it — for an app-reported entitlement with no attributable offer —
  is genuinely useful; it moves our fix from defensive to necessary, and I have
  noted that your "always include channels" can only be a half-promise.

## The asymmetry: a `past_due` channel behaves differently depending on company

`channels` being the union of **live** subscriptions only, combined with `status`
being the healthiest, means the same event produces two different outcomes.

**One Instagram subscription, card fails:**
`status: past_due` · `hasAccess: true` · `channels` **omitted** (no live subs, so
the union is empty). We read that as "no change" — **Instagram keeps working**
while Stripe retries. That is the behaviour your original contract intended by
leaving `past_due` to us.

**Instagram active, LinkedIn card fails:**
`status: active` (healthiest) · `hasAccess: true` · `channels: ["instagram"]`.
Replace-not-merge means we **revoke LinkedIn immediately**.

So a LinkedIn payment failure costs the customer LinkedIn instantly if they also
hold Instagram, and costs them nothing if LinkedIn is all they have. Same card,
same failure, different outcome — decided by what else is in their account.

The second case also removes a paid channel on the *first* failed charge, while
Stripe may go on retrying successfully for days. Under the single-subscription
contract that could not happen, because `past_due` kept access.

Three ways to resolve it, your call:

1. **Include `past_due` in `channels`** (union of active + trialing + past_due).
   `hasAccess` and `status` still carry the real state, and we keep the channel
   until the subscription actually cancels. This restores the old `past_due`
   behaviour and makes the two cases consistent.
2. **Leave it as is** and accept that a failed card revokes that channel at once.
   Defensible — it is the strictest reading — but it should be a decision rather
   than a side effect, and it is worth telling support before the first ticket.
3. **Tell us `past_due` separately** — e.g. a `pastDueChannels` array — and we
   decide the grace behaviour on our side.

We are happy with any of the three. We only want it to be deliberate, because
from our side options 1 and 2 are indistinguishable in the payload.

## Row 3, re-run after your deploy

Agreed, and a fair point that our pass was against a store that could not produce
it. Tell us when the `occurredAt` fix is live and we will re-run row 3 end to end
against a real cancellation, plus the two `past_due` shapes above so we have
evidence for whichever option you pick.

We will treat row 3 as unverified until that run.
