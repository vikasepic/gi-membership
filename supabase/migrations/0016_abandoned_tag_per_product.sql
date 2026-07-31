-- Abandoned-cart tag moves from the store to the product.
--
-- It was store-wide on the assumption that one abandoned-cart automation would
-- serve the whole catalogue. That was wrong for this store: tags here are named
-- per launch (limitless_immersion_abandoned_cart), and an abandoned-cart email
-- that cannot say which thing was abandoned is a worse email.
--
-- Safe to drop rather than keep: the store column was added today, was never
-- set (verified null before this ran), and leaving an unused column that the
-- admin no longer writes is how the next person ends up debugging a setting
-- that does nothing.

alter table products
  add column if not exists activecampaign_abandoned_tag_id text;

comment on column products.activecampaign_abandoned_tag_id is
  'Tag applied when checkout for THIS product starts, removed when it is paid.';

alter table stores
  drop column if exists activecampaign_abandoned_tag_id;
