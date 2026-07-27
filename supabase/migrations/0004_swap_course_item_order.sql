-- Atomic sibling reorder. Two partial unique indexes forbid two siblings
-- sharing a sort_order, so a swap needs an intermediate value. Doing it inside
-- one function makes the whole swap a single transaction: a failure rolls back
-- rather than stranding a row at the parking value.
create or replace function swap_course_item_order(a_id uuid, b_id uuid)
returns void language plpgsql as $$
declare
  a_order integer;
  b_order integer;
begin
  select sort_order into a_order from course_items where id = a_id for update;
  select sort_order into b_order from course_items where id = b_id for update;
  if a_order is null or b_order is null then
    raise exception 'swap_course_item_order: item not found';
  end if;
  update course_items set sort_order = -1 where id = a_id;
  update course_items set sort_order = a_order where id = b_id;
  update course_items set sort_order = b_order where id = a_id;
end;
$$;

grant execute on function swap_course_item_order(uuid, uuid) to service_role;
