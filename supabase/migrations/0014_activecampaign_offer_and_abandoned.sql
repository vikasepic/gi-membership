-- ActiveCampaign tags for offers, and one store-wide abandoned-cart tag.
--
-- Offers were missing: the Content Engine trial is an offer, not a product, so
-- the most valuable thing the store sells was the one purchase that applied no
-- tag at all.
--
-- The abandoned-cart tag lives on the store rather than per product. It is
-- applied when someone starts a checkout and removed the moment they pay, so
-- the ActiveCampaign automation is "tagged, wait an hour, still tagged? send
-- the email". One tag does that for the whole catalogue; a tag per product
-- would mean a duplicate automation per product to maintain.

alter table offers
  add column if not exists activecampaign_tag_id text;

comment on column offers.activecampaign_tag_id is
  'ActiveCampaign tag applied when this offer is granted, removed when it is cancelled or refunded.';

alter table stores
  add column if not exists activecampaign_abandoned_tag_id text;

comment on column stores.activecampaign_abandoned_tag_id is
  'Tag applied at checkout start and removed on payment. Drives the abandoned-cart automation.';
