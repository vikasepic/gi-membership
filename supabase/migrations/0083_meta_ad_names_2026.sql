-- Every 2026 campaign and ad set that could plausibly appear in a UTM on this
-- store, so the ledger names a campaign the first time it makes a sale rather
-- than after somebody notices an id and asks.
--
-- Read from the ad account (act_3523450187940750, "Coach Ajit") on 11 Sep 2026.
-- The account holds 121 campaigns going back to 2025 Instagram boosts; only
-- these can reach a store that launched in July 2026, so the rest are left out
-- rather than bulk-loaded — a lookup table nobody can skim is one nobody
-- checks when a name looks wrong.
--
-- This does NOT cover a campaign created after today. Two things do, and
-- neither is a migration: set META_ADS_TOKEN so lib/meta-names.ts resolves
-- unknown ids by itself, or have the ads team put {{campaign.name}} in the ad
-- URL so no lookup is needed at all. Until one of those, a brand-new campaign
-- shows its id.
insert into meta_ad_names (id, name, kind) values
  -- Campaigns
  ('120250833683450282', 'AJ | LAL COLD | Book Writer | Sales | Sept 2026',    'campaign'),
  ('120250856954100282', 'AJ | Retargeting | Book Writer | Sales | Sept 2026', 'campaign'),
  ('120250826635190282', 'DPV Launch — Sales — Sep 2026',                      'campaign'),
  ('120250708929510282', 'AL | Book Writer RT | SALES',                        'campaign'),
  ('120250675893140282', 'AL | Book Writer AUG 2026 | SALES',                  'campaign'),
  ('120250513041700282', 'AJ | Viral Carousels | Aug 26',                      'campaign'),
  ('120249888948110282', 'AJ | Digital Product Business | Sales',              'campaign'),
  ('120249439822260282', 'AJ | Launch | DPS | Jul 11',                         'campaign'),

  -- Ad sets. The two Book Writer ones are what the ads team's own template
  -- sends as utm_term, so these are the ids already arriving on live traffic.
  ('120250834047950282', 'LAL New Buyers 1% | Book Writer | Banners',          'adset'),
  ('120250833684560282', 'LAL New Buyers 1% | Book Writer | Videos',           'adset'),
  ('120250856954230282', 'Page Visitors | Book Writer | Fresh Banners',        'adset'),
  ('120250832903740282', 'DPV — Interest Signals — 28-55',                     'adset'),
  ('120250832488910282', 'DPV — Interest Signals — 28-55 (2)',                 'adset'),
  ('120250826642460282', 'DPV — Advantage+ Broad — 28-55',                     'adset'),
  ('120250826640960282', 'DPV — Interest Signals — 28-55 (3)',                 'adset'),
  ('120250708929520282', 'RT :: Book Writer SP Visitors',                      'adset'),
  ('120250675893430282', 'LAL Book Writer Buyers | 30-55 | US CA UK GE NL',    'adset'),
  ('120250235286300282', 'LAL Book Writer Buyers | 30-55 | US CA UK GE NL (2)', 'adset'),
  ('120249888948120282', 'AJ | Launch | DPS | Sales Ad',                       'adset'),
  ('120245833126510282', 'LAL New Buyers 1% | May 15 | NV | Book Writer | 30 - 55', 'adset')
on conflict (id) do update set name = excluded.name, updated_at = now();
