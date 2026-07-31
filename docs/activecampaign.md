# ActiveCampaign

Buyers are pushed to ActiveCampaign directly from the store — no Zapier in the
middle. Everything below was captured from real requests, not written from
intent.

## What happens on a purchase

Two API calls, in order:

| | Call | Effect |
|---|---|---|
| 1 | `POST /api/3/contact/sync` | Creates the contact, or **updates** it if that email already exists |
| 2 | `POST /api/3/contactTags` | Applies the tag configured on the product |

`contact/sync` is an upsert keyed on email, which is why nothing searches for
the contact first: an existing buyer is updated rather than duplicated, and
their name is refreshed each time they buy.

Real captured request bodies:

```json
POST /api/3/contact/sync
{ "contact": { "email": "buyer@example.com", "firstName": "Jane", "lastName": "Cooper" } }

POST /api/3/contactTags
{ "contactTag": { "contact": "987", "tag": "4242" } }
```

Authentication is the `Api-Token` header on every request.

### Why v3 and not `contact_add`

The older `/admin/api.php?api_action=contact_add` endpoint is the legacy API: it
requires a list id on every call and answers in XML or PHP-serialised bodies.
v3 is JSON, keyed on the same email upsert, and is what ActiveCampaign
documents today.

## Setup

**1. Get the API URL and key** — ActiveCampaign → Settings → Developer. The URL
looks like `https://youraccount.api-us1.com` (no trailing path).

**2. Add both to Coolify → gi-membership → Environment:**

```
ACTIVECAMPAIGN_API_URL=https://youraccount.api-us1.com
ACTIVECAMPAIGN_API_TOKEN=<your key>
```

Redeploy. With either unset the integration is silently disabled — nothing is
sent and nothing errors, which is what keeps local development and the test
suite from touching a real account.

**3. Set a tag id per product** — Admin → Products → *ActiveCampaign* → Tag ID.

The **numeric id**, not the tag name: Contacts → Manage Tags, edit a tag, and
read the id from the URL. Names are editable in AC and would silently stop
matching after a rename. The form rejects anything that isn't digits, so a
pasted tag name fails while you are looking at it rather than at purchase time.

Leave it empty for no tag — the buyer is still synced as a contact.

## Failure behaviour

Every call is best-effort with an 8s timeout and **never throws**. These happen
after the card is charged, so a marketing outage must not fail a paid order.
Failures are logged to the container console prefixed `[activecampaign]` and
nothing else — there is no `error_events` table yet, so nothing alerts and
nothing replays.

A tag the contact already has comes back `422`, which is treated as success: a
repeat buyer is normal, and the contact ends up tagged either way.

## Tags are removed too

| Event | Effect |
|---|---|
| Refund (Admin → Orders, or a Stripe refund) | Removes the product and offer tags that order applied |
| Subscription cancelled | Removes that offer's tag |
| Subscription `past_due` | **Nothing removed** — Stripe is still retrying and they still have access |

Removal needs the *association* id (the row linking one contact to one tag),
not the tag id, so the contact's tags are listed first to find it:

```
GET    /api/3/contacts/{contactId}/contactTags
DELETE /api/3/contactTags/{associationId}
```

A tag that isn't applied is treated as success — refunding twice, or refunding
a product that carried no tag, is a normal thing to do.

## Abandoned cart

Set **Admin → Products → ActiveCampaign → Abandoned-cart tag ID**, per product.

**When the timer starts**

| Buyer | Trigger |
|---|---|
| Not signed in | The **email field loses focus** with a valid address in it |
| Signed in | **Opening the checkout page** — they never type an email, so arriving is the equivalent moment |
| Either | Pressing Pay, as a backstop, if neither of the above fired |

Deliberately not on every keystroke: mid-typing, `jane@gm` is a different and
invalid address, and tagging it would put junk contacts in ActiveCampaign.

No account is created to do this. Tagging by email rather than by user id
matters — creating an account for someone who merely typed an address would let
anyone squat on another person's email and claim any entitlement parked against
it.
- Removed the moment that product is paid for, in the same pass that applies
  the purchase tag — so there is no window where someone is both a customer and
  an abandoner.

**Build the ActiveCampaign automation as: tag added → wait 1 hour → if the
contact still has the tag, send.** The tag is the timer. That is why there is no
scheduled job here hunting for stale carts — nothing to run, monitor, or notice
has silently stopped.

Someone who completes checkout in two minutes is tagged and untagged within
those two minutes and never enters the sequence.

Per product rather than one store-wide tag, so the email can name what was
abandoned. It also means the tags are independent: abandoning product A and
later buying product B leaves A's abandoned tag in place, and A's sequence still
reaches them — which is usually what you want, and is the whole reason for
tagging per product.

## Not covered

- **The buyer's name comes from checkout.** A member who bought before the name
  field existed syncs with an email only.
- **Nothing retries.** A failed call is logged and forgotten.

## Migrating off the Zapier feed

`lib/crm.ts` still posts to `CRM_WEBHOOK_URL` if that variable is set. Once the
Zapier hook is deleted, **remove `CRM_WEBHOOK_URL` from Coolify** — otherwise
every purchase makes a doomed request to a dead endpoint and logs an error.
