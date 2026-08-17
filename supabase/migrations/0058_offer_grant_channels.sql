-- Which channels inside the app an offer grants.
--
-- The store has always sent ONE entitlement key to a connected app — "which
-- access level to grant, agreed with us up front" — and Content Engine has one
-- level, so every offer that grants it grants the same thing. What the store
-- actually sells is per-channel: a plan for Instagram, a plan for LinkedIn, a
-- plan for both. That distinction had nowhere to live.
--
-- An array rather than three boolean columns or a second table: the answer is
-- a set, it is short, it is read on every provision call, and a set is what a
-- checkbox list produces. A table would be a join for something that is never
-- queried across offers.
--
-- The CHECK is NAMED. Three of the CHECKs on this table are inline and
-- unnamed, which is why they are invisible in a diff and why this repo has
-- twice shipped a feature the database then refused. Containment, not a
-- per-element enum, so adding a channel later is one ALTER rather than a
-- rewrite of the constraint's shape.
alter table offers
  add column if not exists grant_channels text[] not null default '{}';

alter table offers
  drop constraint if exists offers_grant_channels_known;
alter table offers
  add constraint offers_grant_channels_known
  check (grant_channels <@ array['instagram', 'linkedin']::text[]);

-- What is already sold. Every offer granting an app today grants Instagram —
-- stated once, here, rather than inferred at read time forever after. An offer
-- that grants a product or a course keeps an empty set, because channels are
-- not a thing it has.
update offers
   set grant_channels = array['instagram']::text[]
 where grant_app_id is not null
   and grant_channels = '{}';

comment on column offers.grant_channels is
  'Channels inside the granted app this offer unlocks. Empty for offers that do not grant an app. Sent to the app as `channels` on every provision call.';

notify pgrst, 'reload schema';
