# Email change: one new endpoint for every connected app

For the developers of Content Engine, Funnel App and Book Writer. It's the same endpoint for all three apps.

## Why

Grow (grow.greaterinside.com) is adding a "Change email" button for admins. Your app matches people to Grow by lowercased email, so when an admin changes someone's email in Grow, your app has to change it too. Otherwise the next provision call or handoff arrives with an email you don't know. Your app then creates a second, empty account, and the person loses their work and access.

The email is **changed in place**. It's the same user, ID, password, content, workspace and access. Nothing is deleted, recreated or merged.

## The call

Grow calls your app server to server, using the same base URL and shared secret as `/api/store/provision`:

```
POST {your base url}/api/store/email-change
x-store-secret: <the shared secret you already have>
content-type: application/json

{
  "oldEmail": "guqinlisa@gmail.com",   // lowercased
  "newEmail": "lisa@renucoaching.ca",  // lowercased
  "check": false,                      // true = say what would happen, change nothing
  "occurredAt": 1793952000             // unix seconds
}
```

## What your app does

1. **Check the secret** with a timing-safe compare. If it's wrong, answer `401` and do nothing else.
2. **Lowercase and trim both emails.** If either one is missing or invalid, or the two are the same, answer `400`.
3. **Find the user by `oldEmail`.**
   - If no user has `oldEmail` but one has `newEmail`, the change already happened. Answer `200 { "result": "already_changed" }`.
   - If neither email is found, answer `200 { "result": "not_found" }`. The person never used your app, and that's fine.
4. **If a different user already has `newEmail`**, change nothing and answer `409 { "result": "email_taken" }`. Don't delete, merge or overwrite that user. A person on our side decides what to do.
5. **If `check` is `true`**, stop here and answer `200 { "result": "would_change" }`.
6. **Change the email on that same user everywhere your app stores it:**
   - the login: for Supabase, `auth.admin.updateUserById(id, { email: newEmail, email_confirm: true })`
   - your own users or profile table
   - any other column you use to match calls from the store
   Keep the user's ID, password and sessions as they are.
7. Answer `200 { "result": "changed" }`.

## Rules

- **Safe to repeat.** We retry when a call fails. A second call after a success has to answer `already_changed`, and a retry after a half-done change has to finish it, not fail.
- **Send the person no email.** Grow emails both the old and the new address about the change. Use `email_confirm: true` (or your provider's version of it) so your login provider doesn't send a confirmation link either.
- **Leave Stripe alone for store customers.** Grow updates the email on the Stripe customers it created. If your app also bills this person through its own Stripe customer, update that customer's email too.
- **Afterwards**, every provision call and handoff for this person arrives with `newEmail`. Matching by email then finds the same user.

## Responses

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ "result": "changed" }` | Done. |
| 200 | `{ "result": "already_changed" }` | It was done earlier. |
| 200 | `{ "result": "not_found" }` | You have no user with either email. |
| 200 | `{ "result": "would_change" }` | `check: true`, and the change would work. |
| 409 | `{ "result": "email_taken" }` | Another user has `newEmail`. Nothing was changed. |
| 400 | `{ "error": "..." }` | Bad input. |
| 401 | `{ "error": "bad secret" }` | Wrong or missing secret. |
| 500 | anything | Your error. We will retry. |

A `404` tells us the endpoint isn't live yet, and Grow shows the admin that your app wasn't updated.

## Test before you tell us it's live

- [ ] Wrong secret: `401`, and nothing changes.
- [ ] Change a user: you get `changed`, the login and profile both show the new email, and the user ID is the same as before.
- [ ] Send the same call again: you get `already_changed`.
- [ ] The new email belongs to another user: you get `409`, and neither user changes.
- [ ] `check: true`: you get `would_change`, and nothing changes.
- [ ] Neither email is known: you get `not_found`.
- [ ] After a change, a provision call or handoff with the new email reaches the same user and workspace, and no second account is created.

Tell us when it's live on production and we'll switch it on for your app.
