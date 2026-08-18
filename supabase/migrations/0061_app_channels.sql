-- Channels belong to the APP, not to every app.
--
-- 0058 gave an offer a set of channels and put the tickboxes on every offer
-- that grants an app. But a channel is a thing inside Content Engine — you buy
-- Instagram, or LinkedIn, or both, and the app opens the ones you paid for.
-- The Funnel App has no such idea. So the Funnel App offer showed an Instagram
-- tickbox, and 0058's backfill — "every offer granting an app grants
-- Instagram", which was true of every offer that existed when it was written —
-- ticked it and sent `channels: ["instagram"]` to an app that has no channels.
--
-- The app is the one that knows. It declares what it understands, and an offer
-- may only sell what its app declares: no list, no tickboxes, no channels on
-- the wire.
alter table apps
  add column if not exists channels text[] not null default '{}';

comment on column apps.channels is
  'What this app can grant inside itself, e.g. {instagram,linkedin} for Content Engine. Empty means the app has no such division and offers granting it carry no channels.';

-- Named, like 0058's. An unnamed CHECK is invisible in a diff, which is how
-- this repo has twice shipped a feature the database then refused.
alter table apps
  drop constraint if exists apps_channels_known;
alter table apps
  add constraint apps_channels_known
  check (channels <@ array['instagram', 'linkedin']::text[]);

-- The one app that has them. Matched on key, not on name: the name is editable
-- in the admin and the key is the thing the bridge is wired to.
update apps
   set channels = array['instagram', 'linkedin']::text[]
 where key in ('content-engine', 'content_engine', 'contentengine');

-- Undo 0058's over-broad backfill. Only where the app now says it has no
-- channels — an offer whose app does have them keeps exactly what it was sold
-- as, including the Instagram that backfill correctly gave it.
update offers o
   set grant_channels = '{}'
  from apps a
 where o.grant_app_id = a.id
   and a.channels = '{}'
   and o.grant_channels <> '{}';

notify pgrst, 'reload schema';
