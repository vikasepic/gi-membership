/**
 * Every date and time the site shows, pinned to one zone.
 *
 * There is no store timezone setting anywhere in this codebase, so a bare
 * `new Intl.DateTimeFormat(...)` with no `timeZone` renders in whatever zone
 * the runtime happens to be in. For a server component that is the
 * container's zone; for a `"use client"` component it is the *viewer's
 * browser zone* — so an admin in London and one in Delhi looking at the same
 * order see two different times, and an order placed near midnight can read
 * as landing on a different day depending on who is looking. Pinning
 * `timeZone: "UTC"` here makes every render of every date the same instant,
 * for everyone, everywhere. No imports, so both server and client components
 * can use it.
 *
 * `lib/countdown.ts` is deliberately different: a campaign deadline carries
 * its own zone because the deadline belongs to the campaign, not the reader.
 * Nothing here should be used for that.
 */

type DateInput = Date | string;

const toDate = (input: DateInput): Date => (input instanceof Date ? input : new Date(input));

function utcFormat(options: Intl.DateTimeFormatOptions) {
  const formatter = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" });
  return (input: DateInput): string => formatter.format(toDate(input));
}

/** "10 Sep" */
export const shortDate = utcFormat({ day: "numeric", month: "short" });

/** "10 Sep 2026" */
export const dateWithYear = utcFormat({ day: "numeric", month: "short", year: "numeric" });

/** "19:33" */
export const time = utcFormat({ hour: "2-digit", minute: "2-digit" });

/** "10 Sep, 19:33" */
export const shortDateTime = utcFormat({
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** "10 September 2026 at 19:33" */
export const fullDateTime = utcFormat({
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "10 September 2026" */
export const longDate = utcFormat({ day: "numeric", month: "long", year: "numeric" });

/** "10 September" */
export const longMonthDay = utcFormat({ day: "numeric", month: "long" });
