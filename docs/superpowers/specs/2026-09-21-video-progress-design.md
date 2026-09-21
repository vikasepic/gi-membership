# Video progress and resume

**Asked for, 21 Sep 2026.** Videos are about to be two and three hours long.
A member who leaves one has no way back to where they were, the library shows
nothing about what they have started, and the admin cannot tell whether anyone
is turning up at all.

**Decided with the owner before any code:**

| Question | Answer |
|---|---|
| Loom | Dropped. It cannot report a playback position to the page that framed it, so a Loom lesson could never resume or complete on its own. |
| What a course bar measures | Watched time inside lessons, not lessons finished. |
| Completion threshold | 90% watched, on every video, up from 50%. |
| Admin view | Last sign-in, last lesson opened, a bar per course. No activity feed. |

## What was already there

`lib/video-embed.ts` parsed YouTube and Vimeo properly, with host allowlists
and embed URLs built from typed options rather than passed through from the
pasted link. The course page already had a bar and a Continue button.
`components/library/completion-controls.tsx` already spoke to both providers
over an origin-checked postMessage channel to detect 50% watched.

Three things were not:

- **Lesson video bypassed all of it.** `lesson-view.tsx` put the pasted URL
  straight into an iframe `src`, so any URL at all was framed on a page behind
  the paywall, and the admin form advertised a provider (Loom) that the embed
  builder had never supported.
- **`progress.position_seconds` had existed since 0001 and nothing wrote it.**
  Two helpers in `lib/library.ts` read and wrote it and had no callers.
- **Nothing recorded that a lesson had been opened**, only that one had been
  finished.

## Approach

Read the position over the postMessage channel that already exists. Seek
through the URL instead of sending a seek command: both providers take a start
time in the embed URL, so "resume" and "start over" are two sources for the
same component, applied before the first frame, rather than a command racing a
player that may not be listening yet. The rejected alternative was loading the
Vimeo and YouTube SDKs, which buys precise mid-stream seeking at the cost of
two third-party scripts on a paid page.

## The pieces

| File | Job |
|---|---|
| `supabase/migrations/0087_watch_progress.sql` | `duration_seconds`, `last_viewed_at`, two CHECKs, one index. |
| `lib/watch.ts` | Pure. Thresholds, the resume decision, watched fraction, time and "ago" formatting. |
| `lib/video-embed.ts` | `startSeconds`, `jsApi`, `videoSourceOf`, `lessonVideo`. |
| `lib/progress.ts` | `setItemPosition`, `touchItemViewed`, `recordView`, `watchRowFor`, `watchRowsFor`. |
| `lib/learning.ts` | Per-course progress, the last lesson opened, last-seen and last-sign-in for admin. |
| `components/library/video-player.tsx` | The resume prompt, the player, the bridge, the throttled save. |
| `components/library/continue-box.tsx` | The way back in, above the shelf. |
| `components/admin/learning-panel.tsx` | One member's sign-in, last lesson and course bars. |

`completion-controls.tsx` keeps the button, the download rule and the dwell
timer, and loses the video half. It was doing four jobs and now does three
that belong together.

## Rules worth keeping straight

- **A position save never touches `completed`.** Completion has its own rules,
  including the permanent manual override, and a write arriving every twenty
  seconds must not be able to argue with them.
- **No duration means no completion.** Half of a three-hour video and the whole
  of a six-minute one are the same number of seconds.
- **A completed lesson is a full bar** whatever its playhead says, because
  completion can arrive from the button, a download or dwell time, none of
  which move a playhead.
- **Under 30 seconds there is nothing to resume to**, and past 98% the offer
  becomes a restart rather than a resume into the closing credits.
- **Opening is not watching.** `last_viewed_at` is written when a lesson page
  renders; `position_seconds` only once a video plays.

## The failure modes this was built against

- **The save runs on a page that takes money.** Every write is fire and forget
  and swallows its own errors. A three-hour sitting is roughly 540 writes at
  one per twenty seconds, plus one on pause and one on leaving, the last by
  `sendBeacon` because the page is already going.
- **A CHECK is invisible to tsc, vitest and `next build`.** Both new ones are
  asserted against the real database in
  `lib/watch-progress.integration.test.ts`, because nothing else in the stack
  can see them.
- **PostgREST truncates at 1000 rows with no error, and a URL has a length
  limit.** The admin's activity query grows as members times lessons and hits
  both, so it chunks the id list and pages the rows.
- **Any frame on a page can post a message.** One forged message would
  otherwise mark a three-hour lesson finished. The origin check is the whole
  guard and is tested from a hostile origin.
- **Migrations do not run on deploy.** 0087 goes on by hand before the image
  that reads those columns serves traffic, then `notify pgrst, 'reload schema'`.

## Deliberately not built

An activity feed. It needs a new table written on every lesson view, which is
more writes on paid pages to answer a question the last-opened row mostly
already answers. Revisit if "what did they do last week" becomes a real
question rather than a nice one.
