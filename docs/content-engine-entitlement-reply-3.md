# Content Engine — reply 3

**From the Greater Inside store. 7 September 2026.**
Re: your reply 2.

## The `past_due` asymmetry: you are right, and we have taken option 1

You found a real defect, and the way you framed it is what made it obvious —
the same card failure producing two different outcomes depending on what else
is in the account. Nobody chose that. It was a side effect of one filter:

```ts
const live = rows.filter((r) => r.status === "active" || r.status === "trialing");
```

`past_due` fell outside it, so its channel dropped out of the union. With one
subscription that made the union empty, which is omitted, which you read as
"no change" — so access continued. With two, the union still had the other
channel, so the message looked like a deliberate revoke. Two behaviours, one
event.

**`past_due` now counts towards `channels`.** The union is every subscription
that is not cancelled.

We picked your option 1 for three reasons:

- **Stripe collects for days and usually succeeds.** Revoking on the first
  failed charge takes away something already paid for while it is still being
  collected.
- **`canceled` is the revoke signal.** `past_due` is a warning. Blurring them
  meant one filter quietly decided a billing policy.
- **It removes the ambiguous payload**, rather than relying on your reading of
  it. A past-due-only subscriber used to produce an omitted `channels` with
  `hasAccess: true`; they now get an explicit list. The omitted case still
  exists for app-reported entitlements, but it no longer carries this.

`status` and `hasAccess` are unchanged and still carry the real state, so any
grace behaviour you want to add on top is yours to choose — you will see
`past_due` and can act on it. We are not asking you to.

Not taking options 2 or 3: option 2 makes a billing decision inside a data
filter, and option 3 adds a field so that a policy the store should own gets
decided twice.

## What is live now

**The `occurredAt` fix deployed at 15:10 UTC today.** Timestamps are now taken
when the entitlement changes and carried through the retry queue, so your guard
has something real to compare against. Please go ahead with row 3 whenever
suits.

The `past_due` change is committed and goes out on the next deploy — I will
tell you when. Worth including in the same run as row 3, since two of the
shapes you offered to test are exactly this.

## The three offers

All three exist, as drafts, and will stay drafts until the sales copy is
rewritten for each channel:

| Offer | `entitlementKey` | `channels` |
|---|---|---|
| `content-engine-instagram` | `content-engine` | `["instagram"]` |
| `content-engine-linkedin` | `content-engine` | `["linkedin"]` |
| `content-engine` | `content-engine` | `["instagram","linkedin"]` |

## Thank you

Three real defects on our side have come out of this exchange — the union that
never unioned, the send-time timestamp, and now this — and all three were found
by you reading the contract rather than by anything failing. Two of them would
have taken a paid channel away from a customer silently, and the third would
have done it on a retry nobody could have traced.

That is a better outcome than the tests we wrote for the same code.
