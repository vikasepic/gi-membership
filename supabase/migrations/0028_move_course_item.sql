-- Dragging a lesson, and putting back an index that was lost.
--
-- The curriculum screen lets you drag a lesson within its chapter or into
-- another one, and drag chapters among themselves. `swap_course_item_order`
-- only ever swapped two adjacent rows, which is what the up/down buttons
-- needed and nothing more.
--
-- This has to be one function rather than a series of updates from the app:
-- sibling order is protected by a unique index, and a unique index is checked
-- per statement rather than at commit. Renumbering a list in place therefore
-- collides with itself half way through. Everything that can move is parked
-- outside the live range first, then written back.

-- ---------------------------------------------------------------------------
-- The chapter-ordering index, restored.
--
-- 0003 created it on (product_id, sort_order). 0006 dropped product_id, and
-- Postgres dropped the index with it — so since then two chapters in one
-- course have been able to claim the same position, while lessons could not.
-- Nothing noticed because the only writer was a two-row swap.
-- ---------------------------------------------------------------------------
create unique index if not exists course_items_chapter_order_uq
  on course_items (course_id, sort_order) where parent_id is null;

create or replace function move_course_item(
  p_item uuid,
  p_new_parent uuid,
  p_index integer
) returns void language plpgsql as $$
declare
  v_course      uuid;
  v_old_parent  uuid;
  v_ids         uuid[];
  v_at          integer;
  i             integer;
begin
  select course_id, parent_id into v_course, v_old_parent
    from course_items where id = p_item for update;
  if v_course is null then
    raise exception 'move_course_item: item not found';
  end if;

  -- Two levels, and the trigger from 0003 enforces it on write anyway. Saying
  -- so here means the caller gets a reason rather than a constraint error.
  if v_old_parent is null and p_new_parent is not null then
    raise exception 'move_course_item: a chapter cannot be nested inside another';
  end if;
  if v_old_parent is not null and p_new_parent is null then
    raise exception 'move_course_item: a lesson has to live in a chapter';
  end if;

  if p_new_parent is not null then
    perform 1 from course_items
      where id = p_new_parent and course_id = v_course and parent_id is null;
    if not found then
      raise exception 'move_course_item: destination is not a chapter of this course';
    end if;
  end if;

  -- Park everything that could move, each at a position nothing else holds.
  --
  -- Negating in place is not enough: source and destination would then share
  -- the same negative range, and the moment the item changes parent it lands
  -- on top of a parked row in its new list. A row number over both lists gives
  -- every affected row a slot of its own, and ordering that row number by the
  -- current position keeps the original order recoverable.
  with affected as (
    select id,
           row_number() over (order by parent_id nulls first, sort_order) as rn
      from course_items
     where course_id = v_course
       and (parent_id is not distinct from v_old_parent
         or parent_id is not distinct from p_new_parent)
  )
  update course_items ci
     set sort_order = -1000000 - a.rn
    from affected a
   where ci.id = a.id;

  update course_items set parent_id = p_new_parent where id = p_item;

  -- The list it came from, closed up behind it.
  if v_old_parent is distinct from p_new_parent then
    select array_agg(id order by sort_order desc) into v_ids
      from course_items
     where course_id = v_course and parent_id is not distinct from v_old_parent;
    for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
      update course_items set sort_order = i - 1 where id = v_ids[i];
    end loop;
  end if;

  -- The list it landed in, with the item at the index asked for.
  select array_agg(id order by sort_order desc) into v_ids
    from course_items
   where course_id = v_course
     and parent_id is not distinct from p_new_parent
     and id <> p_item;
  v_ids := coalesce(v_ids, array[]::uuid[]);

  v_at := greatest(0, least(p_index, array_length(v_ids, 1)));
  v_ids := v_ids[1 : v_at] || p_item || v_ids[v_at + 1 : array_length(v_ids, 1)];

  for i in 1 .. array_length(v_ids, 1) loop
    update course_items set sort_order = i - 1 where id = v_ids[i];
  end loop;
end;
$$;

grant execute on function move_course_item(uuid, uuid, integer) to service_role;

comment on function move_course_item(uuid, uuid, integer) is
  'Move a course item to a position, optionally under a different chapter. '
  'One transaction, because sibling order is uniquely indexed and a renumber '
  'in separate statements collides with itself.';
