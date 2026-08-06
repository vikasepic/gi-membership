-- Every file this store holds, in one place.
--
-- Until now an upload went into a bucket and the path was written onto whatever
-- was being edited. That made a file a property OF a product, so the same photo
-- used on a product, its sales page and its course was uploaded three times,
-- under three names, and could not be found again from any of them. Nothing
-- knew what a file was called, what was in it, or where else it was used.
--
-- One row per stored object. The bucket is part of the identity, not a
-- detail: public-media is marketing anyone can fetch, paid-assets is what
-- people bought. Nothing here changes that boundary — the library lists both,
-- and a paid asset is still only ever served through the ownership-checked
-- signed URL.

create table if not exists media (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  bucket      text not null check (bucket in ('public-media', 'paid-assets')),
  path        text not null,
  -- What a person calls it. Seeded from the filename, because
  -- "IMG_4021_final_v2.jpg" is at least what they will recognise on the day
  -- they upload it.
  name        text not null,
  -- What is IN the image, for anyone who cannot see it — and for the search
  -- engines that now index the pages these appear on. Null for audio and PDFs,
  -- which have no alt text to have.
  alt         text,
  mime        text not null,
  size        bigint not null default 0,
  -- Known for images, null otherwise. Recorded at upload because measuring it
  -- later means downloading the file to ask.
  width       int,
  height      int,
  created_at  timestamptz not null default now(),
  -- One row per object. Re-recording the same upload updates it rather than
  -- filling the library with the same file over and over.
  unique (store_id, bucket, path)
);

-- The library is always browsed one type at a time: an image picker must never
-- offer a PDF, because choosing one would render a broken image on a sales
-- page with no explanation.
create index if not exists media_by_kind
  on media (store_id, mime, created_at desc);

alter table media enable row level security;
-- No policies. Written and read by the store's own code through the service
-- role: it lists paid assets alongside public ones, so nothing anonymous
-- reads it.
grant select, insert, update, delete on media to service_role;
