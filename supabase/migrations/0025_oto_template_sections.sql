-- Allow the ten-section layout as an upsell template.
--
-- The check constraint is the fifth place the layout list lives, and the one
-- that fails last: the dropdown offers the option, the save validator accepts
-- it, and then the write is rejected by the database. A wiring test reads this
-- file, which is how the omission was caught.

alter table offers drop constraint if exists offers_oto_template_check;
alter table offers add constraint offers_oto_template_check
  check (oto_template in ('short', 'visual', 'long', 'sales', 'sections', 'custom'));
