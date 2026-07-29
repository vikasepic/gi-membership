# Connecting your app to the Greater Inside store

**Audience:** an engineer integrating a product with the Greater Inside store
(`grow.greaterinside.com`). This document assumes **no prior knowledge** of the
store's codebase. Everything you need to implement is here.

**Effort:** two HTTP endpoints. No SDK, no library, no dependency on our code.
Any language or framework works.

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

You implement two endpoints:

| # | Endpoint | Called by | When |
|---|---|---|---|
| 1 | `POST /api/store/provision` | Store server | The instant access is granted |
| 2 | `GET /auth/store-handoff` | The user's browser | Every time they click "Open the app" |

Both paths are configurable per app — tell us yours if you prefer different
ones. The defaults above are assumed throughout this document.

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

## 3. Endpoint 1 — Provision

```
POST https://your-app.example.com/api/store/provision
Content-Type: application/json
x-store-secret: <the shared secret we give you>

{
  "email": "buyer@example.com",
  "entitlementKey": "content-engine",
  "stripeCustomerId": "cus_ABC123",
  "stripeSubscriptionId": "sub_XYZ789"
}
```

### Fields

| Field | Type | Notes |
|---|---|---|
| `email` | string | **Already lowercased.** The shared identifier. |
| `entitlementKey` | string \| null | Which access level to grant. Agreed with us up front. **May be null** if the offer grants generic access — decide your default and document it. |
| `stripeCustomerId` | string \| null | The Stripe customer **in the store's Stripe account**. See §6 before assuming you can use it. |
| `stripeSubscriptionId` | string \| null | The store-created subscription. Null for one-off, non-subscription grants. |

### You must

- **Verify `x-store-secret`.** Compare against your configured secret using a
  timing-safe comparison. Mismatch → `401`, do nothing else.
- **Be idempotent by email.** We retry, and the handoff re-drives provisioning.
  The same call twice must not create two users, two entitlements, or two
  subscriptions. Find-or-create; never blind-insert.
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

## 5. Lifecycle — read this before you ship

**The store tells you when access STARTS. It does not tell you when access
ENDS.**

`provision` fires once, at the moment of granting. Cancellations, refunds,
failed payments, and expiries update the store's records and **send you
nothing.** There is no deprovision callback, no status webhook, and no endpoint
on the store you can poll.

That is a real limitation, not an oversight you should design around silently.
Pick one:

- **Share the Stripe account.** If your app already handles Stripe webhooks on
  the *same* Stripe account the store bills through, you will receive
  `customer.subscription.*` events for store-created subscriptions directly.
  Read §6 first — this has a serious catch.
- **Expire optimistically.** Grant access in windows (e.g. 35 days) refreshed
  on each successful provision or handoff. Access lapses on its own if the
  customer stops coming back through the store. Crude, but it fails closed.
- **Ask us for a deprovision callback.** It does not exist yet. It is a small
  change on our side — request it and we will add it to the contract rather
  than leaving you to guess.

Do not assume a cancelled customer loses access automatically. Today they do
not.

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
| Handoff with valid token | Session created, redirected in, no login prompt |
| Handoff with the same token twice | Second attempt rejected |
| Handoff with `exp` in the past | Rejected |
| Handoff with one character of the signature changed | Rejected |
| Handoff for an email never provisioned | User created and entitled on the spot |

That last one is the self-healing path. Test it deliberately — it is what
covers you when provision fails.

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

**Provision request body**

| Field | Type | Nullable |
|---|---|---|
| `email` | string (lowercased) | no |
| `entitlementKey` | string | yes |
| `stripeCustomerId` | string | yes |
| `stripeSubscriptionId` | string | yes |

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
| `x-store-secret` | provision | Shared secret, verified timing-safe |
| `content-type: application/json` | provision | Body encoding |

---

## Questions

The store-side implementation lives in `lib/apps.ts` of the store repo; the
canonical signer is `signHandoffToken`. If your signature verification
disagrees with ours, that function is the source of truth — the most likely
cause is signing the decoded JSON instead of the base64url string (§4).
