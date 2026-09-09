-- What Meta is told this thing is called.
--
-- `content_name` on a Purchase is what shows up in an ad account's reporting
-- and what audiences get built on, and until now it was whatever the storefront
-- happened to call the thing: a product's title, an offer's name, or the
-- description copied onto an order line at checkout. Three sources for one
-- field, none of them settable, so an ads team could not name a thing the way
-- their campaigns already named it without renaming it for buyers too.
--
-- Nullable on purpose. Blank means "carry on using the title/name", so nothing
-- reported today changes until somebody deliberately types something — which
-- matters when live campaigns are already optimising against the old value.
--
-- Sits beside ad_event_name, which is the same idea for the event's NAME.
alter table products add column if not exists content_name text;
alter table offers   add column if not exists content_name text;

comment on column products.content_name is
  'Overrides the product title as Meta''s content_name. Null falls back to the title.';
comment on column offers.content_name is
  'Overrides the offer name as Meta''s content_name. Null falls back to the name.';
