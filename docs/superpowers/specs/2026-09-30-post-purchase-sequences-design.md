# Post-purchase email sequences, per offer and product

Date: 30 Sep 2026
Status: design approved in chat, spec awaiting review
Prototype: https://claude.ai/artifact/Q8SD7xTjKrdU3U3Q1ut96s (version 2)

## What the owner asked for

Every offer and every product gets a post-purchase email section. It is off
by default. When it is on, the owner writes a subject line and an email body
in a simple editor, the kind any email marketing tool has: images, links,
fonts, sizes, colours. The body has a maximum width for desktop and one for
mobile, both with defaults. The owner can add more emails after the first,
as a sequence, with a delay between each.

Decisions made in chat on 30 Sep 2026:

- **In addition to the welcome email.** The store-wide welcome email
  (`lib/post-purchase-send.ts`) is unchanged. These emails are extra.
- **Timing.** Email 1 goes right after the welcome, once the checkout is
  fully over (after the upsell decision), about a minute after the welcome so
  the welcome arrives first. Each later email waits a delay, in hours or
  days, after the one before it.
- **Storage.** One set of tables keyed by what the sequence belongs to
  (`owner_type` offer or product, `owner_id`), the way `page_sections`
  already works. Not columns on `offers` and `products`.
- **Stop rules.** The rest of a buyer's sequence for an item stops when the
  order is refunded or charged back, when their access to the item ends, or
  when they click "Stop these emails". That link is on every follow-up, not
  on email 1.

## Assumptions (stated in chat, not contradicted)

- Only a purchase through the store starts a sequence: a paid order, a $0
  trial start, a bump, an upsell, a coupon order. Renewals, refunds, access
  granted by hand in admin and access granted by a connected app never do.
- One sequence per item bought. A buyer who takes the product, the bump and
  the upsell, each with a sequence switched on, gets all three.
- The sender is the store's existing sender (Settings, Email:
  `postPurchaseEmail.senderName`, `senderEmail`, `replyTo`). No per-email
  From.
- An email's content is read when it is sent, not when the sequence starts.
  Editing email 3 changes what everyone who has not reached email 3 yet will
  get. Deleting an email skips it for everyone still before it. Reordering
  or deleting emails mid-sequence never sends a buyer the same email twice
  and never drops one they have not had yet.

## Out of scope

Open and click tracking, A/B tests, per-email sender, sending to a list or
segment, emails triggered by anything but a purchase, a visual drag-and-drop
builder, syncing these emails into ActiveCampaign.

## Data (migration 0091)

`0091_post_purchase_sequences.sql`. Applied to production by hand before the
image that reads it, then `notify pgrst, 'reload schema'`, per AGENTS.md.

```sql
create table post_purchase_sequences (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  owner_type  text not null check (owner_type in ('offer', 'product')),
  owner_id    uuid not null,
  enabled     boolean not null default false,
  -- Desktop/mobile width and padding, font, size, line height, colours.
  -- Parsed by a zod schema whose parse({}) is the defaults (below).
  layout      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (store_id, owner_type, owner_id)
);

create table post_purchase_emails (
  id           uuid primary key default gen_random_uuid(),
  sequence_id  uuid not null references post_purchase_sequences(id) on delete cascade,
  position     integer not null,              -- 1, 2, 3 in send order
  delay_amount integer not null default 0 check (delay_amount >= 0 and delay_amount <= 365),
  delay_unit   text not null default 'days' check (delay_unit in ('hours', 'days')),
  subject      text not null default '' check (char_length(subject) <= 200),
  preheader    text not null default '' check (char_length(preheader) <= 200),
  doc          jsonb not null default '{}'::jsonb, -- TipTap JSON, the editor's source
  updated_at   timestamptz not null default now(),
  unique (sequence_id, position) deferrable initially deferred
);

create table post_purchase_sends (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references stores(id) on delete cascade,
  order_item_id  uuid not null references order_items(id) on delete cascade,
  sequence_id    uuid not null references post_purchase_sequences(id) on delete cascade,
  email_id       uuid references post_purchase_emails(id) on delete set null,
  position       integer not null,            -- the step: 1st, 2nd, 3rd email this line gets
  to_email       text not null,
  due_at         timestamptz not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  reason         text,                        -- why skipped or failed
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  unique (order_item_id, sequence_id, position)
);
create index post_purchase_sends_due_idx on post_purchase_sends (status, due_at) where status = 'pending';

alter table order_items add column post_purchase_stopped_at timestamptz;
```

RLS enabled on all three with no policies (service role only), and
privileges revoked from anon and authenticated, per migration 0067.

`delay_amount` on position 1 is ignored: email 1 always goes right after the
welcome. The `unique (order_item_id, sequence_id, position)` constraint is
what makes queueing idempotent: a second attempt to queue the same step
inserts nothing.

### Layout defaults

The schema's `parse({})`, matching the prototype:

| Setting | Default |
|---|---|
| Desktop max width | 600 px (320 to 900) |
| Mobile max width | 100 % (60 to 100) |
| Desktop padding | 32 px |
| Mobile padding | 20 px |
| Font | Arial, Helvetica, sans-serif |
| Text size | 16 px |
| Line height | 1.6 |
| Text colour | #1a1a1a |
| Links and buttons | #c8653d |
| Email body | #ffffff |
| Background around it | #f1efe9 |

Fonts are limited to the email-safe list in the prototype (Arial, Helvetica,
Verdana, Tahoma, Trebuchet MS, Georgia, Times New Roman, Courier New). Gmail
and Outlook drop web fonts, so offering one would show the owner a font most
buyers never see.

## Editor

Reuses the store's TipTap editor (`components/editor/rich-text.tsx`, TipTap
3). New dependencies: `@tiptap/extension-text-style` (TextStyle, FontFamily,
FontSize, Color, BackgroundColor) and `@tiptap/extension-text-align`.
StarterKit 3 already brings underline, strike, lists, headings, horizontal
rule, undo and redo; Link and Image are already installed.

Two custom nodes, each a small TipTap extension with its own render rule:

- **EmailButton**: label, href, background colour, alignment. Atomic, edited
  through a pop-over like the prototype's.
- **MergeTag**: `first_name`, `offer_name`, `access_link`. Atomic, shown as
  a chip in the editor, written into the doc as `{ type: "mergeTag", attrs:
  { key } }`. `access_link` is also accepted as an href.

Images upload through the existing media library (`lib/media`, Supabase
storage), which returns a public absolute URL. A pasted web address is also
accepted. Images are stored as URLs, never as data: URIs: most inboxes block
data: images.

## Rendering (pure, `lib/post-purchase-render.ts`)

`renderPostPurchaseEmail({ doc, subject, preheader, layout, vars, stopUrl })
=> { subject, html, text }`, with no database and no network, so every
case is testable.

- Table-based wrapper with every style inline, same approach as
  `lib/post-purchase-email.ts`. The outer table paints the background colour;
  the inner cell is `width: 100%; max-width: {desktop}px`.
- A `<style>` block with a `@media (max-width: 600px)` rule applies the
  mobile width and padding. Clients that strip `<style>` (some Gmail views)
  fall back to the fluid `width: 100%` cell, which still fits a phone.
- The preheader is the standard hidden span at the top of the body.
- Merge tags are substituted from `vars`: `first_name` (empty when unknown,
  and a leading "Hi " then reads "Hi ," so the renderer collapses the space
  before punctuation, as the welcome does), `offer_name`, `access_link`
  (the store's login URL, `postPurchaseEmail.accessUrl`). The subject and
  preheader get the same substitution.
- Links must be absolute `https:`. Anything else is dropped at save time
  with an inline error, not at send time.
- Follow-ups (position 2 and later) get a fixed footer: "You are getting
  this because you bought {offer_name}. Stop these emails", linking to
  `stopUrl`, plus a `List-Unsubscribe` header pointing at the same URL.
- A plain-text part is generated from the doc.

## Sending

Two jobs, both in `lib/post-purchase-sequences.ts`.

**Queue (at checkout over).** The welcome already knows when a checkout is
over: `sendPostPurchaseIfDue` waits for no pending upsell token. That
detection is split out of the welcome so it runs whether or not the welcome
itself is enabled. When a checkout is over, `queueSequencesForOrder(orderId)`
inserts one `post_purchase_sends` row per order line that:

- is not a renewal (kind in product, oto, bump),
- has an offer or product whose sequence is `enabled` with at least one
  email,

with `position` 1 and `due_at` one minute from now. The unique constraint
makes a repeat call insert nothing.

**Send (every 5 minutes).** Runs from the existing retry sweep
(`/api/cron/retry`, which already runs the welcome sweep every five
minutes), so no new scheduled task is needed. For each pending row with
`due_at <= now()`, oldest first, capped per run:

1. Claim it: update `status = 'sending'` where it is still `pending`
   (compare-and-set, so two sweeps cannot both send).
2. Check the stop rules, and if one applies, mark `skipped` with the reason
   and do not queue the next step:
   - the order is `refunded`,
   - the buyer no longer holds the item: no ownership row for the product or
     offer in `active`, `trialing` or `past_due`. This is also how a
     chargeback stops it: `handleDispute` (lib/reversals.ts) revokes access
     and leaves the order's status alone,
   - `order_items.post_purchase_stopped_at` is set,
   - the sequence is now off.
3. Find the email to send: the row's `email_id` if that email still exists
   and this line has not been sent it; otherwise the first email, in the
   sequence's current order, that this line has not been sent.
4. Render and send with `sendEmail`, from the store's sender.
5. Mark `sent`, then queue the next step: the first email in the current
   order this line has not been sent, `due_at = sent_at + its delay`. None
   left means the sequence is finished for this item.

A send that throws marks the row `failed` with the error and logs it to
`error_events` (source `post_purchase_sequence`), where it shows on the
Errors page. It is not retried automatically, and the rest of that buyer's
sequence does not continue: a follow-up that assumes the one before it
arrived is worse than none.

## Stop link

`/email/stop?t=<token>`. The token is signed the way preview and view-as
tokens are (`OTO_SIGNING_SECRET`), carrying the `order_item_id` and no
expiry. The route sets `post_purchase_stopped_at` and shows a one-line page:
"Done. You won't get any more of these emails about {offer_name}." No
login, no confirmation step; `List-Unsubscribe-Post` one-click is supported
by accepting POST on the same route.

## Admin

A "Post-purchase emails" section on the offer edit page
(`app/admin/offers/[id]`) and the product edit page
(`app/admin/products/[id]`), built as in the prototype:

- On/off switch, off by default. Turning it on for the first time creates
  email 1 from a starter template.
- The row of emails with their timing, "+ Add email", move earlier or later,
  delete (not on email 1).
- For the selected email: subject with a first-name button, preview text,
  its delay (hours or days after the one before), the editor, a Desktop and
  Mobile width switch, and "Preview as" a sample buyer.
- Layout panel for the whole sequence with the defaults above and "Reset
  layout to defaults".
- Inbox preview of subject and preview text.
- "Send a test to me" sends the selected email, rendered with sample
  values, to the signed-in admin's address.
- Save writes the sequence, its emails and their order in one server action,
  guarded by `requireAdmin`, validated by zod (lengths, delays, URLs).

## Testing

- Renderer: desktop and mobile widths reach the HTML; merge tags filled,
  and a missing first name does not leave "Hi ,"; buttons and images render
  as email-safe tables and `img` tags with absolute URLs; the stop footer
  and `List-Unsubscribe` appear on follow-ups and not on email 1; the plain
  text part carries the links.
- Queue: one row per eligible line; renewals, disabled sequences and items
  with no emails queue nothing; a repeat call inserts nothing; queued even
  when the welcome is switched off.
- Send: a due row sends once when two sweeps race; each stop rule skips
  and stops the chain; a deleted email is skipped and the chain continues;
  the next step is due at `sent_at + delay`; a failure is logged and
  stops the chain.
- Stop link: a valid token stops the item's sequence; a forged or edited
  token does nothing.
- Admin: the save action refuses non-admins, bad URLs and out-of-range
  delays; the CHECK constraints are exercised by an integration test that
  actually saves, since tsc and vitest cannot see them (AGENTS.md).

## Risks

- **Deliverability.** More emails per purchase means more for spam filters
  to judge. The stop link, `List-Unsubscribe` and the store's verified
  sending domain are the mitigations. Watch Resend's bounce and complaint
  numbers for the first weeks.
- **Rendering in Outlook.** Outlook ignores max-width on a div and much CSS;
  the table wrapper and inline styles are there for it. The test email is
  the owner's check before switching a sequence on.
- **A sequence started before an edit.** Content is read at send time, so a
  buyer mid-sequence gets the edited version. That is intended (a typo fix
  reaches everyone) and is stated in the admin section's help text.
