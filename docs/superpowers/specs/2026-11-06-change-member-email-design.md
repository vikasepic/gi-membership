# Change a member's email (6 Nov 2026)

Asked for by the owner after Lisa Gu (guqinlisa@gmail.com → lisa@renucoaching.ca) had to be moved by hand in Grow and Content Engine.

## What it does

A "Change email" button on the admin member page (`/admin/members/[id]`, Account box) changes the person's email **in place** everywhere that knows them by it. Their user ID, access, subscriptions, password and app workspaces stay as they are. Nothing is deleted, recreated or merged. (Owner's words: "I just want to change the email, not delete and create new email.")

Order (`lib/email-change.ts`):

1. **Refuse** if the address isn't valid, matches their current email, or already belongs to another Grow member. Also refuse if either the old or the new address is an ADMIN_EMAILS owner: moving onto an owner address would create a permanent owner.
2. **Ask every active external app first** (`check: true`). Stop and change nothing if any app says the new address belongs to a different user there (`email_taken`, or `already_changed`, because on a first change the member can't be on the new address yet), or if an app doesn't answer. *My call:* we stop rather than going ahead and flagging, so no person ends up split between two addresses.
3. **Login** (GoTrue, `email_confirm: true`, so no confirmation link is sent). If it refuses, nothing has moved yet.
4. **The store's rows**, in one transaction (`change_member_email`, migration 0099): `users`, `orders`, `post_purchase_flows`, pending `post_purchase_sends`, `checkout_leads`, and the `email` in every unresolved queued retry, so an old app grant or AC tag can't replay the old address. `trial_history` is copied, not moved, so neither address can take the same free trial again. If this fails, the login is put back.
5. **Each app** is told for real. A failure is queued for retry (`app_email_change` job). The retry always moves the app to the member's email at that moment, so a later change or a revert wins. An app without the endpoint is logged on the Errors page so it can be changed there by hand.
6. **Stripe**: every customer on their orders and subscriptions in the current key's mode gets the new email, so receipts and card notices reach it. Billing itself is keyed by ID.
7. **ActiveCampaign**: the contact's email is changed in place. If the new address already has its own contact, nothing is merged; it's logged for a person.
8. **Both addresses** get a notice email (owner's call).

The admin sees one line saying what happened in each place.

*My call, changed from the first playback:* `orders.email` moves too. Post-purchase emails (`hasPaidOrder`), renewals and the purchase summary find a buyer by the order's email. Left behind, the person's onboarding emails would end as "every order refunded". The address they paid with stays on the Stripe payment.

## The app side

One endpoint, the same for every external app: `docs/app-email-change.md`. Content Engine shipped it on 6 Nov (`8fbc1c4` in Content-Machine-Ajit). Funnel App and Book Writer shipped theirs by 10 Nov; all three answered a signed `check: true` probe with `not_found` that day. An app connected later without the endpoint shows as "not updated" and is logged.

## Known limit

If the request dies after the store rows move but before the apps are told (for example, a deploy restarts the container mid-request), pressing the button again says "That is already their email". Those apps then have to be changed by hand.

## Not included

- Members changing their own email.
- Merging two accounts.
- `pending_app_entitlements`: those rows are for people who have no Grow account yet, so a member has none.
