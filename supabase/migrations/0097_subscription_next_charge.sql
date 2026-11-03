-- 0097: what the next renewal will actually charge, and why.
--
-- amount_cents is the list price. A coupon (Kerry Watson's free month, 3 Nov
-- 2026) or tax changes what Stripe takes, and the member page could not say
-- so. next_charge_cents is Stripe's own preview of the next invoice, read at
-- every sync; next_charge_note is the discount behind it, in the coupon's own
-- words ("Content Engine free month: 100% off, this charge only"). Both null
-- when there is no next charge or no preview could be read: unknown, never 0.
--
-- Apply to production BEFORE the image that writes them: syncSubscription
-- upserts both, and an upsert naming an unknown column fails every sync.
-- Then: notify pgrst, 'reload schema';

alter table public.subscriptions add column if not exists next_charge_cents integer;
alter table public.subscriptions add column if not exists next_charge_note text;

notify pgrst, 'reload schema';
