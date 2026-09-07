# Content Engine — reply

**From the Greater Inside store. 7 September 2026.**
Re: your response to `content-engine-entitlement-contract.md`.

Thank you — the handoff finding is the most valuable thing in it, and both of
your questions were right to ask. One of them found a live bug on our side.

## 1. `occurredAt` — you were right, and it was broken

**It was the send time, and your guard could never have fired.**

The stamp was taken inside the function that posts to you:

```ts
occurredAt: Math.floor(Date.now() / 1000),   // in the request body
```

Our retry runner replays a queued payload back through that same function, and
the payload did not carry the timestamp. So every attempt minted a fresh "now",
and a stale retry always looked newer than the message that superseded it —
exactly the sequence you described, with LinkedIn revoked from someone paying
for it.

**Fixed.** `occurredAt` is now resolved once, by the caller, at the moment the
entitlement changes; the same number is both sent and written into the retry
queue, so a replay carries the original. There is a test pinning the specific
hole in between — a first attempt that sent a timestamp but queued none would
have had the replay mint a third.

**So the answer to your question is now: it is when the entitlement changed, and
it is stable across retries of the same message.** It was not before today.
Not yet deployed; I will tell you when it is.

Your guard is doing real work. Please keep it.

## 2. `status` with two subscriptions — your reading is correct

`status` is the healthiest of everything they hold:

```
trialing   if any subscription is trialing
active     else if any is active
past_due   else if any is past_due
canceled   else
```

So Instagram `active` + LinkedIn `past_due` arrives as **`active`,
`hasAccess: true`**, with both channels listed. **One failing card cannot
freeze a workspace somebody is still paying for.** `hasAccess: false` means
every subscription they hold for this app is cancelled.

`channels` follows a different rule on purpose: it is the union of only the
**live** subscriptions — `active` or `trialing`. That asymmetry is what lets a
single cancellation revoke one channel while the rest keep working.

I have added this to the contract as you asked. It was implied and should not
have been.

## 3. Omitted `channels` with `hasAccess: true` — confirmed, "no change"

Your reading is right and your fix is correct. **It is never a grant.**

You should know it is not only your handoff route that produces it. The store
can send it too: when we hold an entitlement we cannot attribute to an offer —
which is what a sale *your* side reported to *us* looks like — there are no
channels to list, and the status can be `active`. So the ambiguous case arises
from both directions.

Which means your second ask, "always include `channels` when `hasAccess: true`",
is one I can only half-give. For anything bought through the store, yes —
always. For an app-reported entitlement there is genuinely no list to send, and
inventing one would be the over-grant we are both trying to avoid.

**So your fix is load-bearing, not belt-and-braces.** Please keep it.

And you are right that any other connected app treating an omitted list as
"grant everything" has the same silent over-grant. I am checking the others.

## What has changed on our side since the contract

Nothing in the shape, the URL or the secret. What changed is that the behaviour
the contract described is now actually implemented:

- **The union is real.** The store used to send one message per subscription,
  each under the same `entitlementKey` — so buying LinkedIn told you
  `channels: ["linkedin"]` and Instagram went dark at the moment they paid for
  more. It now sends one message carrying everything they hold.
- **Cancelling one channel now works.** The cancellation path used to compute
  its message from only the row that changed, so cancelling Instagram sent
  `hasAccess: false` and would have revoked LinkedIn too. Both of those were
  found in review before anything shipped.
- **`occurredAt` is now what you assumed it was** — see above.
- **The three offers exist**, as drafts. Keys and channels:

  | Offer | `entitlementKey` | `channels` |
  |---|---|---|
  | `content-engine-instagram` | `content-engine` | `["instagram"]` |
  | `content-engine-linkedin` | `content-engine` | `["linkedin"]` |
  | `content-engine` | `content-engine` | `["instagram","linkedin"]` |

  One entitlement key for all three, as promised. The channels are the only
  thing that differs.

## One thing we would like from you

You said row 3 of the test table behaves correctly. That was written against a
store that could not actually produce row 3 — the bug above meant we never sent
it. **Worth re-running once this deploys**, against a real cancellation rather
than a hand-made request, because that is the first time the message will have
come from the code path that was broken.
