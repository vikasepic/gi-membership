-- Grant the service_role access to app tables. It bypasses RLS but still needs
-- table-level privileges for PostgREST server-side reads/writes. anon and
-- authenticated are intentionally NOT granted here: without RLS policies that
-- would expose every row to the public anon key. They get scoped access when
-- RLS lands (phase 2, auth). Server code uses the service-role client only.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- Cover tables/sequences created by later migrations too.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
