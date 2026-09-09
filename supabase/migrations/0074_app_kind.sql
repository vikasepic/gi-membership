-- Internal apps, told apart from external ones.
--
-- Every row in `apps` has been an external app: a base URL, a provision
-- endpoint, a handoff endpoint, a shared secret. The store grants it by
-- calling out over HTTP and sends the buyer to it with a signed token.
--
-- An internal app runs inside this codebase, on this domain, against this
-- database. It has no host to call and no secret to share; access is the
-- ownership row itself, read directly by the app's own pages. Everything else
-- about an app — an offer grants it, ownership records it, the library lists
-- it, a refund revokes it — is the same for both kinds, which is why this is a
-- column on the same table rather than a second registry.
--
-- The default keeps every existing row external, so Content Engine and the
-- Funnel App are untouched. The two columns an internal app cannot have are
-- loosened, and the check says in one place what each kind must carry.

alter table apps
  add column if not exists kind text not null default 'external'
    check (kind in ('internal', 'external'));

comment on column apps.kind is
  'internal = runs inside this codebase at /apps/<key>, no HTTP bridge. external = a separate app reached through provision and handoff.';

alter table apps
  alter column base_url drop not null,
  alter column shared_secret drop not null;

alter table apps drop constraint if exists apps_external_has_endpoint;
alter table apps add constraint apps_external_has_endpoint
  check (kind <> 'external' or (base_url is not null and shared_secret is not null));

-- The two internal apps. Active from the start: there is nothing to point at,
-- the route exists the moment the code that reads this row is deployed.
-- Their implementation lives in lib/builtin-apps/registry.ts, keyed on `key`.
insert into apps (store_id, key, name, kind, entitlement_mapping, channels, active)
select s.id, v.key, v.name, 'internal', '{}'::jsonb, '{}'::text[], true
  from stores s
 cross join (values
   ('micro-product-builder', 'Micro-Product Builder'),
   ('hook-generator',        'Viral Hook Generator')
 ) as v(key, name)
on conflict (store_id, key) do nothing;
