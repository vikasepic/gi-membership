-- A Meta custom event name, per funnel.
--
-- One pixel serves several funnels on this ad account, so a single Purchase
-- cannot tell them apart in reporting. The ads team names an event per funnel
-- ("Product Validator Sale") and reads that instead. The name is theirs and
-- changes when they say so, which is exactly why it is a row and not code:
-- hardcoding it would make renaming an ad report a deploy.
--
-- Null means send nothing, so every existing product is unchanged.
alter table products add column if not exists ad_event_name text;

-- Meta rejects a custom event name over 40 characters, and silently: the event
-- simply never appears in the account, which looks like a tracking bug and gets
-- debugged as one. Refuse it here instead, where the person typing it finds out.
-- Trimmed to null so an accidental space is not a "name".
alter table products drop constraint if exists products_ad_event_name_len;
alter table products add constraint products_ad_event_name_len
  check (ad_event_name is null or char_length(btrim(ad_event_name)) between 1 and 40);

comment on column products.ad_event_name is
  'Meta trackCustom event name fired on the upsell page for this funnel. Set by the ads team. Null sends nothing.';
