-- 0093: the step each offer and product sits under on the home page.
--
-- The steps themselves live in stores.settings.homeSteps (lib/home-steps-schema.ts);
-- these columns hold a step's id. Null, or an id no longer in the list, puts
-- the thing under "Everything else", so deleting a step never hides a product.
--
-- Apply to production BEFORE the image that reads these columns: OFFER_COLUMNS
-- and PRODUCT_COLUMNS select them, and a select of an unknown column fails every
-- offer and product read, checkout included. Then: notify pgrst, 'reload schema';

alter table public.offers add column if not exists home_step text;
alter table public.products add column if not exists home_step text;

alter table public.offers drop constraint if exists offers_home_step_check;
alter table public.offers add constraint offers_home_step_check
  check (home_step is null or home_step ~ '^[a-z0-9-]{1,40}$');
alter table public.products drop constraint if exists products_home_step_check;
alter table public.products add constraint products_home_step_check
  check (home_step is null or home_step ~ '^[a-z0-9-]{1,40}$');

notify pgrst, 'reload schema';
