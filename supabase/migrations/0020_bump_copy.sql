-- Separate copy for the checkout bump.
--
-- `headline` and `description` drove five surfaces at once: the checkout bump,
-- the storefront section, the library standing offer, the standalone offer
-- checkout, and the upsell page hero. Editing the bump changed all five, and
-- the admin form gave no clue that it would.
--
-- The bump is the one that needs its own voice. It is a single line beside a
-- checkbox on a page where someone is mid-payment, so it wants to be short and
-- specific; the upsell page is a full sales page and wants the opposite.
--
-- Null means "use the main headline/description", so nothing changes for an
-- offer that has not set these, and the fallback keeps a half-filled offer
-- looking finished rather than blank.

alter table offers
  add column if not exists bump_headline    text,
  add column if not exists bump_description text;

comment on column offers.bump_headline is
  'Bold line on the checkout bump. Falls back to headline when null.';
comment on column offers.bump_description is
  'Grey line under it on the checkout bump. Falls back to description when null.';
