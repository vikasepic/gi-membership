-- Which product a counted view was about.
--
-- Without it "/checkout" is one row for the whole catalogue: the query string
-- is stripped before the path is stored (deliberately — ?fbclid=… would make
-- every row unique), so a checkout for the validator and one for the carousels
-- guide were the same line and there was no way to tell them apart.
--
-- Not nullable, defaulting to the empty string. It has to join the primary
-- key, and Postgres will not accept a NULL in one — a nullable column here is
-- not a stricter version of this, it is a version that does not run. Empty
-- string means "this page is not about one product".
--
-- Still no identifier. A slug names a thing in the catalogue, not a person,
-- so what makes this table safe to count everyone with is unchanged.
alter table page_counts add column if not exists product text not null default '';

-- Rebuild the key so the upsert conflicts on the product too. Without this the
-- column exists and every write for a given path/source collides on the old
-- key, which looks like the feature working while it silently merges products.
alter table page_counts drop constraint if exists page_counts_pkey;
alter table page_counts add primary key (store_id, day, path, source, product);

create or replace function bump_page_count(
  p_store uuid, p_day date, p_path text, p_source text, p_product text
) returns void language sql as $$
  insert into page_counts (store_id, day, path, source, product, hits)
  values (p_store, p_day, p_path, p_source, p_product, 1)
  on conflict (store_id, day, path, source, product)
  do update set hits = page_counts.hits + 1;
$$;

-- `create or replace` with a different argument count OVERLOADS rather than
-- replaces, so the four-argument version is still here and still callable.
-- Left in place it would keep writing product-less rows from any stale caller,
-- and PostgREST would resolve to it happily. Drop it by its exact signature.
drop function if exists bump_page_count(uuid, date, text, text);

-- Only the service role calls this. Postgres grants EXECUTE to PUBLIC by
-- default, and 0067 revoked function privileges from anon/authenticated but
-- not from PUBLIC. The insert would still be refused — the function is
-- `language sql` with no `security definer`, so it runs with the caller's
-- privileges and anon has neither the table grant nor an RLS policy — but
-- leaving EXECUTE open means that argument has to be reconstructed by whoever
-- reads this next.
revoke all privileges on function bump_page_count(uuid, date, text, text, text) from public;
grant execute on function bump_page_count(uuid, date, text, text, text) to service_role;
