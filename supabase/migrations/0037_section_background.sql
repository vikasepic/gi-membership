-- A picture behind a whole band.
--
-- A section's look was a preset and nothing else: six bands, each pairing a
-- ground with ink that stays readable on it. That is a good default and a hard
-- floor — the moment someone wants a photograph behind a hero, the preset has
-- no way to say so and the answer was "you cannot".
--
-- Stored beside the preset rather than replacing it. The band still decides the
-- ink, which is what keeps the words readable when the image fails to load, is
-- slow, or turns out to be lighter than it looked. The image sits on top of the
-- band's own colour, and the darkening wash sits on top of the image.
--
-- Same shape as a block's background (lib/blocks.ts Background), so one
-- renderer draws both and there is no second set of rules to keep in step.

alter table page_sections
  add column if not exists background jsonb;

comment on column page_sections.background is
  'Optional {type,color,image,size,position,repeat,overlay} over the band preset. Null means the preset alone.';
