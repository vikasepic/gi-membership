-- Writing down what every stored page already does, one width at a time.
--
-- Six style keys — fontFamily, size, lineHeight, letterSpacing, weight and
-- transform — stopped being inherited by the narrower widths in the same commit
-- as this migration. They are the six the store now has a site-wide answer for,
-- so a phone that says nothing about its heading size has somewhere better to
-- fall than "whatever the laptop said".
--
-- Every block saved before today was authored under the old rule. A heading
-- given 48px on desktop and never touched on mobile MEANT 48px on mobile,
-- because that is what the page rendered. Left alone it would now fall to the
-- site default and every existing sales page would move. So the value the page
-- already renders is written down explicitly at tablet and at mobile, and
-- nothing moves: `blockRules` emits a width's typography from that width's own
-- values, so an explicit 48px at mobile is the same 48px it inherited.
--
-- What this is NOT: it cannot be told apart afterwards from a value a human
-- pinned by hand. Back up page_sections before running it in production.
--
-- Two operational notes for whoever runs it:
--   * `page_sections_updated` bumps `updated_at`, and `updated_at` IS the
--     optimistic-concurrency token the builder checks (lib/pages.ts). Anyone
--     with a page open while this runs gets a false "someone else edited this"
--     conflict. Run it with nobody editing.
--   * It is idempotent. The second run finds every key already present, builds
--     the identical jsonb and updates nothing at all — no row touched, no
--     `updated_at` moved.
--
-- `page_sections.content->'blocks'` is the only place a block tree is stored.
-- `offers.oto_sections` and `offers.oto_page` are legacy per-offer copy and
-- hold none, so they are not walked.

-- One override's halves, in whichever of the two shapes it was stored in.
create or replace function __override_style(o jsonb) returns jsonb
language sql immutable as $$
  select case
    -- A block with no `responsive` at all is the common case, and `->` on a
    -- missing key gives SQL NULL rather than a JSON null. Everything downstream
    -- of a NULL here is NULL, which silently means "already has that key".
    when o is null or jsonb_typeof(o) <> 'object' then '{}'::jsonb
    when jsonb_exists(o, 'style') or jsonb_exists(o, 'props') then coalesce(o -> 'style', '{}'::jsonb)
    else o
  end;
$$;

create or replace function __override_props(o jsonb) returns jsonb
language sql immutable as $$
  select case
    when jsonb_typeof(o) = 'object' and (jsonb_exists(o, 'style') or jsonb_exists(o, 'props'))
      then coalesce(o -> 'props', '{}'::jsonb)
    else '{}'::jsonb
  end;
$$;

create or replace function pin_typography(node jsonb) returns jsonb
language plpgsql immutable as $$
declare
  -- The same six as SITE_DEFAULTED_KEYS in lib/blocks.ts. `color` is not among
  -- them: it still inherits down the widths, so there is nothing to pin.
  keys constant text[] := array[
    'fontFamily', 'size', 'lineHeight', 'letterSpacing', 'weight', 'transform'
  ];
  k       text;
  v       jsonb;
  style   jsonb;
  resp    jsonb;
  tablet  jsonb;
  mobile  jsonb;
  wrote   boolean := false;
begin
  if jsonb_typeof(node) <> 'object' then
    return node;
  end if;

  style := coalesce(node -> 'style', '{}'::jsonb);
  resp  := coalesce(node -> 'responsive', '{}'::jsonb);

  -- Overrides were once stored as the style patch itself, with no `style` or
  -- `props` key around it — `normalizeOverride` still reads that shape, so a
  -- row can still be in it. Reading `->'style'` blindly would see an empty
  -- override and then overwrite the real one on the way out.
  tablet := __override_style(resp -> 'tablet');
  mobile := __override_style(resp -> 'mobile');

  foreach k in array keys loop
    v := style -> k;
    -- Unset is the value baseStyle() gives the key, and unset is nothing to
    -- record: the narrow widths already fall through to the same place the
    -- desktop one does. A JSON null is a value here, not a missing key.
    continue when v is null
      or v = 'null'::jsonb
      or (k = 'fontFamily' and v = '""'::jsonb)
      or (k = 'transform' and v = '"none"'::jsonb);

    if not jsonb_exists(tablet, k) then
      tablet := tablet || jsonb_build_object(k, v);
      wrote := true;
    end if;
    -- From the tablet, never from the desktop. A block given a smaller size on
    -- tablet and left alone on mobile renders the TABLET size on a phone, and
    -- copying the desktop value here is the one way to move such a page.
    if not jsonb_exists(mobile, k) then
      mobile := mobile || jsonb_build_object(k, tablet -> k);
      wrote := true;
    end if;
  end loop;

  -- Only when something was actually written. An override object built for a
  -- block that needed nothing would be stripped again by `normalizeResponsive`
  -- on the next read, so it is pure jsonb bloat and a pointless `updated_at`.
  if wrote then
    node := jsonb_set(node, '{responsive}', jsonb_build_object(
      'tablet', jsonb_build_object('style', tablet, 'props', __override_props(resp -> 'tablet')),
      'mobile', jsonb_build_object('style', mobile, 'props', __override_props(resp -> 'mobile'))
    ));
  end if;

  -- A row holds a block tree per column, and those blocks have styles of their
  -- own. Recursion rather than two hardcoded levels: the editor caps nesting at
  -- two, but the walker has no reason to know that.
  --
  -- `columnStyles` is deliberately not walked. A column's typography is stored
  -- and edited but never emitted — `columnCss` writes background, padding and
  -- radius and nothing else — so there is no rendered value there to preserve.
  if jsonb_typeof(node -> 'columns') = 'array' then
    node := jsonb_set(node, '{columns}', coalesce((
      select jsonb_agg(
               -- A column that is not an array is a column `jsonb_array_elements`
               -- raises on, and one raise here aborts the whole `do` block and
               -- with it every row already rewritten. Left as it was found.
               case when jsonb_typeof(col) = 'array' then coalesce((
                 select jsonb_agg(pin_typography(b) order by bi)
                   from jsonb_array_elements(col) with ordinality as inner_b(b, bi)
               ), '[]'::jsonb) else col end
               order by ci)
        from jsonb_array_elements(node -> 'columns') with ordinality as outer_c(col, ci)
    ), '[]'::jsonb));
  end if;

  return node;
end;
$$;

do $$
declare
  moved integer;
begin
  -- `is distinct from` is what makes a second run free: a row whose blocks come
  -- back identical is not written, so its `updated_at` does not move and nobody
  -- editing it is told their work is stale.
  with pinned as (
    select id,
           jsonb_set(content, '{blocks}', coalesce((
             select jsonb_agg(pin_typography(b) order by i)
               from jsonb_array_elements(content -> 'blocks') with ordinality as t(b, i)
           ), '[]'::jsonb)) as content
      from page_sections
     where jsonb_typeof(content -> 'blocks') = 'array'
  ),
  changed as (
    update page_sections s
       set content = p.content
      from pinned p
     where s.id = p.id and s.content is distinct from p.content
    returning 1
  )
  select count(*) into moved from changed;
  raise notice 'pin_typography: % section(s) rewritten', moved;
end;
$$;

drop function pin_typography(jsonb);
drop function __override_style(jsonb);
drop function __override_props(jsonb);
