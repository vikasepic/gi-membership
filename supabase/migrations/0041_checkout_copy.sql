-- What the checkout says beside the card fields, per product.
--
-- That half of the checkout carried four lines of reassurance written into the
-- component: the card going straight to Stripe, the refund window, access
-- opening on payment, and the trial warning. All four are true of every
-- product, which is why they were hardcoded — but "true of every product" is
-- not the same as "all there is to say about this one", and there was no way to
-- add a word without a deploy.
--
-- Both columns are optional and both fall back to what is there today, so a
-- product that says nothing here reads exactly as it did.

alter table products
  -- A line under the tagline. The one thing worth saying about THIS product to
  -- someone who already has their card out.
  add column if not exists checkout_note text,
  -- Replaces the four reassurance lines when it has anything in it. An array of
  -- strings rather than rich text: they are a list of short claims, and a
  -- formatting toolbar invites paragraphs where a list belongs.
  add column if not exists checkout_bullets jsonb not null default '[]'::jsonb;
