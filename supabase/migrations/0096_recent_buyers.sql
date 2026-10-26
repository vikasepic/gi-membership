-- 0096: the recent buyers popup (spec 2026-10-26-recent-buyers-popup-design.md).
--
-- show_recent_buyers: whether this offer's or product's buyers appear in the
-- popup, on its own page and in the home page mix. On by default, existing
-- rows included: the owner chose to have it live everywhere on deploy day.
--
-- hide_from_recent_buyers: a member the admin has taken out of the popup,
-- every purchase past and future. A person asking not to be shown is a
-- privacy request, so it is one switch on the person, not one per order.
--
-- Apply to production BEFORE the image that reads these columns: OFFER_COLUMNS
-- and PRODUCT_COLUMNS select them, and a select of an unknown column fails every
-- offer and product read, checkout included. Then: notify pgrst, 'reload schema';

alter table public.offers add column if not exists show_recent_buyers boolean not null default true;
alter table public.products add column if not exists show_recent_buyers boolean not null default true;
alter table public.users add column if not exists hide_from_recent_buyers boolean not null default false;

notify pgrst, 'reload schema';
