-- A second price for the same thing.
--
-- The one-click upsell charges a card already on file, so there is nothing to
-- fill in and nothing to choose — one offer, one button. That is what makes it
-- convert, and it is also why "monthly or yearly" had nowhere to live.
--
-- The alternative is declared on the offer rather than picked by the buyer's
-- browser: accepting sends "alt", and the server resolves it through THIS
-- column. A client that could name any offer id could name a cheaper one.

alter table offers
  add column if not exists alt_offer_id uuid references offers(id) on delete set null;

-- An offer cannot be its own alternative, and a chain of them would mean the
-- page has to decide how deep to look.
alter table offers
  drop constraint if exists offers_alt_not_self;
alter table offers
  add constraint offers_alt_not_self check (alt_offer_id is null or alt_offer_id <> id);

comment on column offers.alt_offer_id is
  'A second billing option for the same grant, shown beside this one on the upsell page. Resolved server-side; never sent by the client.';
