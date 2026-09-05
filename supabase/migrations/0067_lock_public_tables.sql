-- Take the public database away from the public.
--
-- Found 5 Sep 2026 while checking privileges on a new table: the anon key —
-- the one shipped to every visitor's browser as NEXT_PUBLIC_SUPABASE_ANON_KEY
-- — held SELECT, INSERT, UPDATE, DELETE and TRUNCATE on every table in the
-- public schema, and no table had row-level security enabled. Verified against
-- production through the live REST API, not inferred:
--
--   GET /rest/v1/orders    -> 200, 5 rows
--   GET /rest/v1/users     -> 200, 8 rows
--   GET /rest/v1/ownership -> 200, 7 rows
--   GET /rest/v1/visitors  -> 200, 67 rows
--   POST /rest/v1/page_counts -> 201
--
-- So customer email addresses, purchase history and who owns what were
-- readable by anyone who viewed source on the storefront, and the same key
-- could rewrite or TRUNCATE those tables. This is Supabase's default grant on
-- the public schema; it was never granted deliberately and nothing in this
-- repo relies on it.
--
-- Nothing in the application does. Every one of the 32 places that builds a
-- client with the anon key calls `auth.*` and nothing else — getUser, sign in,
-- sign out, password reset. All table access goes through createServiceClient
-- with the service-role key, which bypasses RLS. Auth itself lives in the
-- `auth` schema and is untouched by any of this.

-- 1. Take the privileges away.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- 2. Stop the next table from arriving with the same grant. This is the part
--    that makes the fix stick: without it, the next `create table` in a
--    migration is public again and nobody notices.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- 3. Belt and braces: row-level security on every table, with no policies.
--    Revoking privileges is the lock; this is the second lock, so that a
--    future `grant` run by hand — or by a Supabase upgrade restoring its
--    defaults — does not silently reopen the door. With RLS on and no policy,
--    anon and authenticated are refused even holding SELECT. service_role
--    bypasses RLS, so the application is unaffected.
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;
