-- The checkout is a page too.
--
-- It is the last page before money moves and the only one nobody can edit: the
-- panel beside the card fields is written in TSX, so changing a word on it is a
-- deploy. Everything else in this store is blocks.
--
-- So the checkout becomes a page like the storefront did — one row set per
-- store, owner_type 'checkout' — and the editor, the renderer, the templates,
-- the clipboard and the save path are the ones that already exist. What the
-- checkout adds is five blocks that draw the live order rather than words
-- somebody typed, and one rule the sales page does not need: three of them
-- cannot be removed. See lib/blocks.ts CHECKOUT_TYPES.
--
-- 'email' rides along in the same widening. The post-purchase email is the next
-- thing being built on this table and it is the same shape — one owner row per
-- store, blocks inside it — and one migration on a live database is less risk
-- than two. Nothing reads it yet.
--
-- Widening, not dropping. 0046 said why: the check is what stops a typo
-- becoming an owner_type nothing reads, and rows nobody can find again.

alter table page_sections
  drop constraint if exists page_sections_owner_type_check;

alter table page_sections
  add constraint page_sections_owner_type_check
  check (owner_type in ('product', 'offer', 'store', 'checkout', 'email'));

alter table page_settings
  drop constraint if exists page_settings_owner_type_check;

alter table page_settings
  add constraint page_settings_owner_type_check
  check (owner_type in ('product', 'offer', 'store', 'checkout', 'email'));

comment on column page_sections.owner_type is
  'product | offer | store | checkout | email. The last three are keyed by the '
  'store id and have one owner row each: the storefront home page, the checkout '
  'layout, and the post-purchase email. See lib/pages.ts sectionsFor().';
