-- An audio lesson can point at a hosted file instead of an uploaded one.
--
-- Uploads stay the default and stay protected: they live in the private bucket
-- and are served through an ownership-checked, 60-second signed URL. A pasted
-- address is the opposite — whoever has the link can play it, with no check at
-- all. That is a real trade-off, so the editor says so rather than offering the
-- two as if they were equivalent.
--
-- Its own column rather than reusing video_embed_url: one column meaning "the
-- video, unless the lesson is audio, in which case the audio" is the kind of
-- overloading that reads fine today and is wrong the first time a lesson has
-- both.

alter table course_items
  add column if not exists audio_url text;

comment on column course_items.audio_url is
  'Externally hosted audio for an audio lesson. Public by nature — an uploaded attachment is the protected option.';
