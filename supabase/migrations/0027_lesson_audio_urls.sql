-- A lesson can carry more than one audio link.
--
-- audio_url shipped an hour ago as a single value and is already the wrong
-- shape: a lesson can be a part one and a part two, or a session and its
-- debrief. Converting now, while it holds almost nothing, is cheaper than
-- keeping a singular column and a plural one beside it forever.
--
-- The existing value is carried across rather than dropped.

alter table course_items
  add column if not exists audio_urls text[] not null default '{}';

update course_items
   set audio_urls = array[audio_url]
 where audio_url is not null
   and btrim(audio_url) <> ''
   and cardinality(audio_urls) = 0;

alter table course_items drop column if exists audio_url;

comment on column course_items.audio_urls is
  'Externally hosted audio for an audio lesson, in order. Public by nature — an uploaded attachment is the protected option.';
