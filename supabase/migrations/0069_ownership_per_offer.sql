-- One access record per thing bought, not per app.
--
-- Content Engine is now sold as three offers — Instagram, LinkedIn, and both —
-- and a person may hold more than one at a time. The old key allowed one
-- ownership row per (store, user, app), so buying the second offer did not add
-- a record: grantOfferOwnership caught the 23505 and overwrote the first row in
-- place, taking its stripe_subscription_id with it.
--
-- Three things followed from that, all silent: the first subscription was
-- orphaned, so a later cancellation webhook found no row and did nothing while
-- the card kept being charged; and the app was told at the moment of the second
-- purchase to revoke the first channel.
alter table ownership drop constraint if exists ownership_user_app_uq;
drop index if exists ownership_user_app_uq;

-- NULLS NOT DISTINCT is required, not tidiness. Postgres treats NULLs as
-- distinct in a unique index by default, and app-originated rows — source
-- 'app', inserted by the bridge when an app reports a sale it made itself —
-- carry no offer_id. Without this clause those rows could duplicate without
-- limit. One of them is live today, so this is a real case.
create unique index if not exists ownership_user_app_offer_uq
  on ownership (store_id, user_id, app_id, offer_id)
  nulls not distinct
  where app_id is not null;

-- Product grants keep their own shape; nothing here touches them.
