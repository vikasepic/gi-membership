-- 0094: a member's country, kept from their orders.
--
-- The ads team asked for buyers by country on 6 Oct 2026. Orders had a
-- buyer_country, mostly empty (the offer checkout never copied the one Stripe's
-- form collects; fixed in the same change), and members had none at all.
--
-- users.country is the country of the member's latest order that has one. The
-- trigger keeps it so on every checkout path at once, including ones written
-- later, rather than each path remembering to.

alter table public.users add column if not exists country text;
alter table public.users drop constraint if exists users_country_check;
alter table public.users add constraint users_country_check check (country is null or country ~ '^[A-Z]{2}$');

create or replace function public.users_country_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.buyer_country is not null and new.user_id is not null then
    -- Only from the member's latest order: backfilling an old order must not
    -- overwrite the country of a newer one.
    update public.users u
       set country = new.buyer_country
     where u.id = new.user_id
       and u.country is distinct from new.buyer_country
       and not exists (
         select 1 from public.orders o
          where o.user_id = new.user_id and o.buyer_country is not null
            and o.created_at > new.created_at
       );
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_user_country on public.orders;
create trigger orders_set_user_country
  after insert or update of buyer_country on public.orders
  for each row execute function public.users_country_from_order();

-- Every member with an order that has a country, from their latest one.
update public.users u
   set country = o.buyer_country
  from (
    select distinct on (user_id) user_id, buyer_country
      from public.orders
     where buyer_country is not null and user_id is not null
     order by user_id, created_at desc
  ) o
 where o.user_id = u.id
   and u.country is distinct from o.buyer_country;

notify pgrst, 'reload schema';
