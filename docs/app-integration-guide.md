# Connecting your app to the Greater Inside store

**Audience:** an engineer integrating a product with the Greater Inside store
(`grow.greaterinside.com`). This document assumes **no prior knowledge** of the
store's codebase. Everything you need to implement is here.

**Effort:** two HTTP endpoints you host, plus one you call if your app sells
access on its own. No SDK, no library, no dependency on our code. Any language
or framework works.

---

## 1. The model

The **store** sells access. Your **app** delivers it.

The store owns checkout, payment, subscriptions, and the customer account. When
someone buys access to your app, the store tells you about it and later sends
the user to you already signed in.

The two systems keep **separate user tables**, reconciled on **lowercased
email**. Email is the only shared identifier. The store never sends you a
password, and you never authenticate against the store.

```
                    buys access
   customer ──────────────────────────▶  STORE  (grow.greaterinside.com)
                                           │
                        1. provision       │  server-to-server, at purchase
                                           ▼
                                        YOUR APP
                                           ▲
                        2. handoff         │  browser redirect, signed token
   customer ───────────────────────────────┘  "Open the app"
```

You implement two endpoints, and optionally call a third:

| # | Endpoint | Direction | When |
|---|---|---|---|
| 1 | `POST /api/store/provision` | Store → you | Access granted, **and every later change** |
| 2 | `GET /auth/store-handoff` | Store → you (browser) | Every time they click "Open the app" |
| 3 | `POST /api/apps/entitlement` | **You → store** | Someone subscribes/cancels *inside your app* |

The first two paths are configurable per app — tell us yours if you prefer
different ones. The defaults above are assumed throughout this document. The
third lives on the store and is fixed.

**Endpoint 3 is not optional if your app can sell access on its own.** See §5.

---

## 2. How login works

This is the part most integrations get wrong, so read it carefully.

**Your app does not implement "log in with Greater Inside".** There is no OAuth
flow, no token exchange, no callback. The store hands you a signed assertion
that says *"this email belongs to a signed-in customer, right now"*, and you
trust it because it is signed with a secret only the two of us know.

The full journey:

1. Customer buys on the store. The store creates their account **on the store**.
2. The store calls your **provision** endpoint (server-to-server). You create
   your own user record for that email and grant them the entitlement. **No
   password.** The user has never visited your app at this point.
3. Later the customer clicks **"Open the app"** in their store library. The
   store mints a short-lived signed token and redirects their browser to your
   **handoff** endpoint.
4. You verify the signature, look up the user by email, create **your own
   session** (your normal cookie / JWT / whatever you already use), and redirect
   them into your app. They are now logged in, having typed nothing.

**Consequences to design for:**

- A user can exist in your database with **no password**, created by a
  server-to-server call, before they have ever visited you. Your signup flow
  must tolerate that (find-or-create, don't error on "already exists").
- Users arriving via handoff should **not** be asked to log in or verify email.
  They already proved identity to the store.
- If you also have your own direct signup, a customer may end up with two
  identities unless you match on lowercased email. **Always normalise email to
  lowercase** before lookup or insert.
- You may keep your own password login for people who did not come from the
  store. The two can coexist; they just have to converge on the same user row
  when the email matches.

---

## 3. Endpoint 1 — Entitlement state (grant *and* revoke)

Despite the name, this is not only called at purchase. **It is called on every
state change**: trial converting to paid, a failed renewal, cancellation, and
refund. Apply whatever `status` says and this one endpoint covers provisioning
and deprovisioning.

```
POST https://your-app.example.com/api/store/provision
Content-Type: application/json
x-store-secret: <the shared secret we give you>

{
  "email": "buyer@example.com",
  "entitlementKey": "content-engine",
  "status": "active",
  "hasAccess": true,
  "stripeCustomerId": "cus_ABC123",
  "stripeSubscriptionId": "sub_XYZ789",
  "occurredAt": 1785300000
}
```

### Fields

| Field | Type | Notes |
|---|---|---|
| `email` | string | **Already lowercased.** The shared identifier. |
| `entitlementKey` | string \| null | Which access level to grant. Agreed with us up front. **May be null** if the offer grants generic access — decide your default and document it. |
| `status` | string | `active` \| `trialing` \| `past_due` \| `canceled`. The current state. Apply it as given. |
| `hasAccess` | boolean | Whether this status should permit access. Provided so you don't have to encode our semantics — see the note below. |
| `stripeCustomerId` | string \| null | The Stripe customer **in the store's Stripe account**. See §7 before assuming you can use it. |
| `stripeSubscriptionId` | string \| null | The store-created subscription. Null for one-off, non-subscription grants. |
| `occurredAt` | number | Unix seconds. Use it to discard a stale message that arrives out of order. |

**`past_due` keeps access** (`hasAccess: true`). Stripe retries a failed renewal
for days, and cutting someone off over a card that is about to succeed is worse
than a few days of grace. Only `canceled` removes access. If you just honour
`hasAccess` you get this right without thinking about it.

### You must

- **Verify `x-store-secret`.** Compare against your configured secret using a
  timing-safe comparison. Mismatch → `401`, do nothing else.
- **Be idempotent by email.** We retry, and the handoff re-drives provisioning.
  The same call twice must not create two users, two entitlements, or two
  subscriptions. Find-or-create; never blind-insert. Re-sending the same status
  must be a no-op.
- **Honour `status`, including revocation.** A call with `status: "canceled"`
  means take access away. Treating this endpoint as grant-only leaves you
  serving cancelled customers.
- **Respond within 5 seconds.** We abort the request after that. Do slow work
  (welcome emails, workspace seeding) asynchronously.
- **Respond `200`** with any JSON body (`{"ok":true}` is fine). We only check
  the status code.

### Failure behaviour, and why it matters

This call is **best-effort and never blocks the purchase.** If you return `500`,
time out, or are down for deploy, the customer is still charged and still owns
the product. We log it and move on.

**There is no retry queue today.** Recovery relies entirely on the handoff
(§4) re-driving provisioning when the user first opens your app. That only
works if your handoff endpoint provisions on arrival too. **Implement
provisioning in both endpoints** — treat §4 as the safety net for §3.

### Minimal implementation (Node/Express)

```js
import crypto from "node:crypto";

const STORE_SECRET = process.env.STORE_SHARED_SECRET;

function safeEqual(a, b) {
  const ab = Buffer.from(a ?? "", "utf8");
  const bb = Buffer.from(b ?? "", "utf8");
  // timingSafeEqual throws on length mismatch, so guard first.
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

app.post("/api/store/provision", async (req, res) => {
  if (!safeEqual(req.get("x-store-secret"), STORE_SECRET)) {
    return res.status(401).json({ error: "bad secret" });
  }

  const { email, entitlementKey, stripeCustomerId, stripeSubscriptionId } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });

  await grantAccess({
    email: email.trim().toLowerCase(),
    entitlementKey: entitlementKey ?? "default",
    stripeCustomerId,
    stripeSubscriptionId,
  }); // find-or-create; safe to call repeatedly

  res.json({ ok: true });
});
```

---

## 4. Endpoint 2 — Handoff

The user's browser arrives at:

```
GET https://your-app.example.com/auth/store-handoff?token=<token>
```

### Token format

```
token   = base64url(payloadJson) + "." + base64url(signature)
payload = {"email":"...","userId":"<store user id>","appId":"<your app id>","exp":<unix seconds>}
signature = HMAC_SHA256(message = base64url(payloadJson), key = sharedSecret)
```

**Critical detail:** the HMAC is computed over the **base64url string**, not
over the raw JSON bytes. Sign the encoded text exactly as it appears before the
dot. Getting this wrong is the single most common integration bug.

Encoding is **base64url** throughout: `+`→`-`, `/`→`_`, and **no `=` padding**.

Tokens live **5 minutes**.

### You must

- **Recompute the signature and compare timing-safe.** Mismatch → reject.
  Never parse the payload before the signature verifies.
- **Reject if `exp` is in the past.**
- **Enforce single use.** Store consumed tokens (or their hash) until `exp`
  passes and reject repeats. A replayed token must fail. This is what stops a
  leaked URL in a browser history or referrer header becoming a permanent
  backdoor.
- **Provision on arrival.** Find-or-create the user by lowercased email and
  grant the entitlement, exactly as in §3. This is what makes a failed
  provision call self-heal.
- **Then** mint your own session and redirect into your app.

Reject with a plain error page, not a redirect back to the store — a redirect
loop between two systems is very hard to debug.

### Reference verification (Node)

```js
import crypto from "node:crypto";

function verifyHandoffToken(token, secret) {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig) return null;

  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload; // { email, userId, appId, exp }
}
```

### Reference verification (Python)

```python
import base64, hmac, hashlib, json, time

def b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

def verify_handoff_token(token: str, secret: str):
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        return None

    expected = base64.urlsafe_b64encode(
        hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    ).rstrip(b"=").decode()

    if not hmac.compare_digest(sig, expected):
        return None

    payload = json.loads(b64url_decode(body))
    if not isinstance(payload.get("exp"), int) or payload["exp"] < int(time.time()):
        return None

    return payload
```

### Handler sketch

```js
app.get("/auth/store-handoff", async (req, res) => {
  const payload = verifyHandoffToken(req.query.token, STORE_SECRET);
  if (!payload) return res.status(401).send("Invalid or expired link.");

  if (await tokenAlreadyUsed(req.query.token)) {
    return res.status(401).send("This link has already been used.");
  }
  await markTokenUsed(req.query.token, payload.exp);

  const user = await findOrCreateUserByEmail(payload.email.toLowerCase());
  await grantAccess({ email: user.email });   // safety net for a failed provision

  await startSession(res, user);
  res.redirect("/dashboard");
});
```

---

## 5. Two-way sync — when access starts, changes, and ends

### The store tells you (endpoint 1)

`POST /api/store/provision` fires on **every** transition, not just purchase:

| What happened | `status` sent |
|---|---|
| Bought / trial started | `trialing` |
| Trial converted, renewal paid | `active` |
| Renewal failed, card declined | `past_due` (access continues) |
| Cancelled, expired | `canceled` (**take access away**) |
| Order refunded | `canceled` (**take access away**) |

Apply the status you are given. That is the whole contract.

**One honest caveat.** These calls are best-effort and there is no retry queue.
A missed *grant* self-heals — the handoff re-provisions when the user next opens
your app. A missed *revoke* does not: nothing brings the user back to trigger a
correction. If revocation matters to your margins, add a belt-and-braces
expiry: grant access in windows (say 35 days) refreshed on every `active` or
`trialing` message, so access lapses on its own if our messages stop arriving.
Ask us if you want a stronger guarantee — a retry queue is a change we can make.

### You tell the store (endpoint 3)

**If your app can sell access on its own, you must report it.** Otherwise the
store does not know, and will offer that customer the very subscription they
already pay for. If they accept, they get a *second* subscription and are
billed twice. This is the single most expensive way to get the integration
wrong.

```
POST https://grow.greaterinside.com/api/apps/entitlement
Content-Type: application/json
x-store-secret: <your shared secret — the same one>

{
  "email": "buyer@example.com",
  "entitlementKey": "content-engine",
  "status": "active",
  "stripeSubscriptionId": "sub_YOURS"
}
```

Send this whenever access changes in your app: someone subscribes directly,
cancels, lapses, or is comped. `status` takes the same four values.

**Response**

```json
{ "ok": true, "linked": true }
```

`linked: false` means there is no store account with that email **yet**. That is
success, not an error — do not retry. We park it and apply it automatically the
moment they create a store account, so an app-first subscriber is never offered
what they already have.

| Code | Meaning |
|---|---|
| `200` | Recorded. Check `linked` to see whether it attached to an account now or was parked. |
| `400` | Malformed body — bad email, or a `status` outside the four values. |
| `401` | Secret missing or wrong. |
| `500` | Our problem. Safe to retry; the call is idempotent. |

Idempotent by `(your app, email)`: sending the same state repeatedly converges
on one record.

---

## 6. If you share our Stripe account

Only relevant if your app bills through the same Stripe account as the store.

Store-created subscriptions carry `metadata.store_created = "true"`. Your
webhook will receive events for them alongside your own subscriptions.

**Decide who owns subscription state, and enforce it.** If your app assumes it
created every subscription it sees — for example, one subscription row per
account, overwritten on each webhook — it will clobber the store's subscription
and the two systems will disagree about who has access. Filter on
`metadata.store_created` and skip, or model multiple subscriptions per account.

**Trials.** The store may create subscriptions with a trial period
(`trial_period_days`). If your own checkout never sets trials, your code may not
expect a subscription in `trialing` status. Treat `trialing` as active access.

If you bill through a **different** Stripe account, ignore this section — the
IDs we send are informational only and will not resolve against your account.

---

## 7. Security requirements

Non-negotiable, in rough order of how badly it goes wrong:

- [ ] Shared secret in an environment variable. Never in source, never in a
      client bundle, never logged.
- [ ] `x-store-secret` compared **timing-safe**. Not `===`.
- [ ] Handoff signature compared **timing-safe**, and verified **before**
      parsing the payload.
- [ ] `exp` enforced.
- [ ] Handoff tokens **single-use**.
- [ ] Both endpoints **HTTPS only**. A token over plain HTTP is a session for
      whoever is listening.
- [ ] Never log the full token or the secret. Log a hash if you need to trace.
- [ ] Do not put the token in a redirect target, referrer, or analytics event.

Rotating the secret: tell us, accept both old and new for a short window, then
drop the old one. We update our side and the window closes.

---

## 8. Testing

**Generate a test token** (Node, with your secret):

```js
import crypto from "node:crypto";

const secret = process.env.STORE_SHARED_SECRET;
const payload = {
  email: "test@example.com",
  userId: "00000000-0000-0000-0000-000000000001",
  appId: "00000000-0000-0000-0000-0000000000a1",
  exp: Math.floor(Date.now() / 1000) + 300,
};
const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
console.log(`${body}.${sig}`);
```

**Test provision:**

```bash
curl -i -X POST https://your-app.example.com/api/store/provision \
  -H "content-type: application/json" \
  -H "x-store-secret: $STORE_SHARED_SECRET" \
  -d '{"email":"test@example.com","entitlementKey":"content-engine","stripeCustomerId":null,"stripeSubscriptionId":null}'
```

**Cases that must pass before you call it done:**

| Case | Expected |
|---|---|
| Provision with correct secret | `200`, user created + entitled |
| Provision with wrong/missing secret | `401`, nothing created |
| Provision twice, same email | `200` both times, exactly one user, one entitlement |
| Provision `status: "canceled"` | Access **removed** |
| Provision `status: "past_due"` | Access **kept** (Stripe is still retrying) |
| Handoff with valid token | Session created, redirected in, no login prompt |
| Handoff with the same token twice | Second attempt rejected |
| Handoff with `exp` in the past | Rejected |
| Handoff with one character of the signature changed | Rejected |
| Handoff for an email never provisioned | User created and entitled on the spot |
| You report a direct subscription to the store | `200`; store suppresses its offer for that customer |

Two of these are the ones people skip and regret:

- **Handoff for an email never provisioned** is the self-healing path. It is
  what covers you when a provision call fails.
- **`status: "canceled"` removes access.** If you wired this endpoint as
  grant-only, this case silently does nothing and you keep serving refunded
  customers.

Reporting to the store can be checked with curl:

```bash
curl -i -X POST https://grow.greaterinside.com/api/apps/entitlement \
  -H "content-type: application/json" \
  -H "x-store-secret: $STORE_SHARED_SECRET" \
  -d '{"email":"test@example.com","entitlementKey":"content-engine","status":"active","stripeSubscriptionId":null}'
```

---

## 9. Registering your app with the store

Send us:

| We need | Example |
|---|---|
| App key (stable slug) | `content-engine` |
| Display name | `Content Engine` |
| Base URL | `https://content.greaterinside.com` |
| Provision path | `/api/store/provision` |
| Handoff path | `/auth/store-handoff` |
| Entitlement keys you accept | `content-engine`, `pro`, … |

We generate the shared secret and send it over a secure channel. It goes in
your environment as `STORE_SHARED_SECRET` (or whatever you prefer to call it).

Then: we register the app, attach it to an offer, and a test purchase in Stripe
test mode will call your provision endpoint for real.

---

## 10. Field reference

**Store → you: entitlement state body**

| Field | Type | Nullable |
|---|---|---|
| `email` | string (lowercased) | no |
| `entitlementKey` | string | yes |
| `status` | `active` \| `trialing` \| `past_due` \| `canceled` | no |
| `hasAccess` | boolean | no |
| `stripeCustomerId` | string | yes |
| `stripeSubscriptionId` | string | yes |
| `occurredAt` | number (unix seconds) | no |

**You → store: `POST /api/apps/entitlement` body**

| Field | Type | Nullable |
|---|---|---|
| `email` | string | no |
| `entitlementKey` | string | yes |
| `status` | `active` \| `trialing` \| `past_due` \| `canceled` | no |
| `stripeSubscriptionId` | string | yes |

Response: `{ "ok": true, "linked": boolean }`. `linked: false` = parked until
that email has a store account. Not an error.

**Handoff token payload**

| Field | Type | Meaning |
|---|---|---|
| `email` | string | The customer. Your lookup key. |
| `userId` | string (uuid) | Their store-side id. Store it if you want a stable link that survives an email change; do not use it as your primary lookup. |
| `appId` | string (uuid) | Which app the token was minted for. Reject tokens whose `appId` is not yours if you serve several. |
| `exp` | number | Unix seconds. Hard expiry. |

**Headers**

| Header | Endpoint | Purpose |
|---|---|---|
| `x-store-secret` | both directions | Shared secret, verified timing-safe at both ends |
| `content-type: application/json` | both directions | Body encoding |

The **same** secret authenticates you to us and us to you. Presenting it is how
we identify which app is calling.

---

## Questions

The store-side implementation lives in `lib/apps.ts` of the store repo; the
canonical signer is `signHandoffToken`. If your signature verification
disagrees with ours, that function is the source of truth — the most likely
cause is signing the decoded JSON instead of the base64url string (§4).
