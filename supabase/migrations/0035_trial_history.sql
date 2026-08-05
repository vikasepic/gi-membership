-- Who has already had a free trial of what.
--
-- Cancel after three paid months, come back, and today you get another seven
-- days free. Cancel INSIDE the trial and sign up again and you get another one,
-- forever. Neither is a thing anyone should have to police by hand.
--
-- Keyed on what the trial GRANTED, not on the offer that sold it: the monthly
-- and the yearly Funnel App offers both grant app 8ee0…/funnel, so trialling
-- one has to close the other. An offer-keyed record would have been a loophole
-- with two doors.
--
-- Keyed on email rather than user id, so a second account on the same address
-- does not reset it. A genuinely new address is a genuinely new person as far
-- as this store can tell, and pretending otherwise means refusing free trials
-- to people who never had one.

create table if not exists trial_history (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  email         text not null,
  -- "app:<appId>:<entitlementKey>" or "product:<productId>". See grantKeyOf.
  grant_key     text not null,
  first_trial_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (store_id, email, grant_key)
);

create index if not exists trial_history_lookup
  on trial_history (store_id, email, grant_key);

alter table trial_history enable row level security;
-- No policies: read and written by the store's own code through the service
-- role. It decides whether something is free, so nothing anonymous reads it.
grant select, insert on trial_history to service_role;

-- Everyone who has already had one. A subscription created from an offer that
-- carried trial days IS a trial — fulfilOffer passes trial_period_days straight
-- from the offer — so this is exact rather than a guess.
insert into trial_history (store_id, email, grant_key, first_trial_at)
select distinct on (u.email, key.grant_key)
       o.store_id,
       lower(u.email),
       key.grant_key,
       own.created_at
  from ownership own
  join offers   o   on o.id = own.offer_id
  join users    u   on u.id = own.user_id
  cross join lateral (
    select case
             when o.grant_app_id is not null
               then 'app:' || o.grant_app_id || ':' || coalesce(o.grant_entitlement_key, '')
             when o.grant_product_id is not null
               then 'product:' || o.grant_product_id
             else null
           end as grant_key
  ) key
 where own.stripe_subscription_id is not null
   and o.trial_days is not null
   and o.trial_days > 0
   and key.grant_key is not null
 order by u.email, key.grant_key, own.created_at
on conflict (store_id, email, grant_key) do nothing;
