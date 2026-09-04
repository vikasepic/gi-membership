-- A Meta custom event name, per offer.
--
-- The same idea as products.ad_event_name (0064), for the other half of the
-- funnel: a bump or an upsell is its own thing to report on, and an ad account
-- running several funnels through one pixel cannot tell them apart from
-- StartTrial or Purchase alone.
--
-- Null means send nothing, so every existing offer is unchanged.
alter table offers add column if not exists ad_event_name text;

-- Meta drops a custom event name over 40 characters silently: the event simply
-- never appears, which looks like broken tracking and gets debugged as one.
-- Refuse it where the person typing it finds out.
alter table offers drop constraint if exists offers_ad_event_name_len;
alter table offers add constraint offers_ad_event_name_len
  check (ad_event_name is null or char_length(btrim(ad_event_name)) between 1 and 40);

comment on column offers.ad_event_name is
  'Meta trackCustom event name fired when this offer is bought, beside Purchase or StartTrial. Null sends nothing.';
