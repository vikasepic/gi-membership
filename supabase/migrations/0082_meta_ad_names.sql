-- Meta campaign / ad set / ad names, keyed by the numeric id their URL template
-- sends.
--
-- Most of this account's ads use Meta's DEFAULT dynamic parameters, which put
-- the campaign, ad set and ad IDs into utm_campaign, utm_term and utm_content —
-- so the ledger showed `120250826827780282` where a reader needs
-- "AJ | Product Validator | Sales | Relaunch". The ads team's own template does
-- send real names, but only a minority of campaigns use it.
--
-- Seeded by hand on 11 Sep 2026, read out of Ads Manager, because the
-- Conversions API token carries only `read_ads_dataset_quality` and cannot read
-- an ad object at all. Set META_ADS_TOKEN (a System User token with ads_read on
-- the ad account) and lib/meta-names.ts fills in unknown ids by itself; without
-- it this table is exactly as current as its last hand-seed.
create table if not exists meta_ad_names (
  id          text primary key,
  name        text not null,
  -- campaign | adset | ad. Advisory only: an id is unique across all three, so
  -- nothing looks up BY kind. It is here so a human reading the table knows
  -- which level a row describes.
  kind        text not null check (kind in ('campaign', 'adset', 'ad')),
  updated_at  timestamptz not null default now()
);

comment on table meta_ad_names is
  'Numeric Meta object id -> human name, for rendering UTM labels that carry ids instead of names.';

-- Nothing here is per-store and nothing is secret, but the table is written
-- only by the server: RLS on with no policy means PostgREST's anon and
-- authenticated roles see nothing, and service_role bypasses it.
alter table meta_ad_names enable row level security;

revoke all privileges on table meta_ad_names from anon, authenticated;
grant select, insert, update, delete on table meta_ad_names to service_role;

insert into meta_ad_names (id, name, kind) values
  ('120250826827780282', 'AJ | Product Validator | Sales | Relaunch', 'campaign'),
  ('120250765579170282', 'AJ | Product Validator | Sales',            'campaign'),
  ('120250826827840282', 'DPV | Advantage+ Broad',                    'adset'),
  ('120250765579150282', 'Broad | 28 - 55 | USUKCAAUS',               'adset'),
  ('120250826827630282', 'Good Ideas Go Further - Sticky Notes',      'ad'),
  ('120250826827700282', 'Turn This Into This — Notebook Before After', 'ad'),
  ('120250826827800282', 'The Idea Is On Trial — Courtroom',          'ad'),
  ('120250826827620282', 'Don''t Build Blind - Ajit',                 'ad'),
  ('120250826827660282', 'Hit Mess or Miss — Diagnosis Result',       'ad'),
  ('120250765617320282', 'Banner 1 — Hope?',                          'ad'),
  ('120250766180220282', 'Banner 6 — Months',                         'ad')
on conflict (id) do update set name = excluded.name, updated_at = now();
