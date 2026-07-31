-- Per-product ActiveCampaign tag.
--
-- The tag id is the numeric id from ActiveCampaign (Contacts > Manage Tags —
-- the id appears in the URL when editing a tag), not the tag's name. Names are
-- editable in AC and would silently stop matching after a rename; the id does
-- not change.
--
-- Text rather than integer on purpose: it is an opaque identifier we only ever
-- hand back to ActiveCampaign, never do arithmetic on, and AC's own API accepts
-- and returns it as a string.

alter table products
  add column if not exists activecampaign_tag_id text;

comment on column products.activecampaign_tag_id is
  'ActiveCampaign tag id applied to the buyer on purchase. Null = no tag.';
