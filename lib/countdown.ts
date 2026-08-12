/**
 * A deadline, and what is left of it.
 *
 * No `server-only`: the panel, the server render and the ticking client all
 * need these, and there is nothing secret here.
 *
 * The whole reason this file exists is the timezone. Elementar stores a
 * deadline as a local string and prints "Date set according to your timezone:
 * UTC+5.5" underneath it, which means the moment being counted to depends on
 * where the person editing the page happened to be sitting. The same countdown
 * then means a different instant to a reader in Delhi and one in London, and it
 * moves silently if the editor travels. Here a deadline is a wall-clock date
 * PLUS the zone it is to be read in, and the pair resolves to one instant that
 * every viewer counts to the same second.
 */

/** Zones offered in the picker. Not the full IANA list — see COMMON_ZONES. */
export type Zone = string;

/**
 * The zones a store actually sells into, plus UTC.
 *
 * The full IANA database is ~600 names and a dropdown of 600 is a worse control
 * than a dropdown of thirty. Anything missing can still be stored — the parser
 * accepts any zone the runtime knows — this list is only what the picker shows.
 */
export const COMMON_ZONES: { group: string; zones: Zone[] }[] = [
  { group: "UTC", zones: ["UTC"] },
  {
    group: "Europe",
    zones: ["Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Warsaw", "Europe/Athens", "Europe/Istanbul", "Europe/Moscow"],
  },
  {
    group: "Americas",
    zones: ["America/New_York", "America/Toronto", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Vancouver", "America/Mexico_City", "America/Bogota", "America/Sao_Paulo", "America/Argentina/Buenos_Aires"],
  },
  {
    group: "Asia & Middle East",
    zones: ["Asia/Jerusalem", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok", "Asia/Jakarta", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul", "Asia/Manila"],
  },
  {
    group: "Africa",
    zones: ["Africa/Lagos", "Africa/Cairo", "Africa/Nairobi", "Africa/Johannesburg"],
  },
  {
    group: "Oceania",
    zones: ["Australia/Perth", "Australia/Brisbane", "Australia/Sydney", "Pacific/Auckland"],
  },
];

export const ALL_ZONES: Zone[] = COMMON_ZONES.flatMap((g) => g.zones);

/** True when the runtime can resolve this zone. Unknown zones would throw. */
export function zoneIsValid(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * What a zone's offset is, in minutes, at a given instant.
 *
 * Not a constant per zone: London is +0 in January and +60 in July, and a
 * deadline set for a date on the other side of a DST change resolves an hour
 * out if the offset is taken "now" instead of at the deadline itself. This asks
 * the formatter what the wall clock reads there at that instant and measures
 * the difference, which is correct across every transition without shipping a
 * timezone table.
 */
function offsetMinutes(utcMs: number, zone: string): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(utcMs)).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  // `hour` can be "24" at midnight in some locales; Date.UTC normalises it.
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - utcMs) / 60000;
}

/**
 * A wall-clock date in a zone, as one instant.
 *
 * `local` is what the editor typed and read back — "2026-09-12T09:48" — which
 * carries no offset and is therefore not a moment until a zone is applied.
 *
 * Two passes, because the offset depends on the answer: guess by applying the
 * offset at the naive instant, then re-measure at that guess. One correction is
 * enough for every real zone, including the hour either side of a DST jump.
 *
 * Returns null for an unparseable date or an unknown zone, so a bad setting is
 * a block that renders nothing rather than a page that throws.
 */
export function instantFrom(local: string, zone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m || !zoneIsValid(zone)) return null;
  const [, y, mo, d, h, mi, s] = m;
  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  const guess = naive - offsetMinutes(naive, zone) * 60000;
  return naive - offsetMinutes(guess, zone) * 60000;
}

/** The zone's short name at that instant — "IST", "GMT+1", "PDT". */
export function zoneLabel(utcMs: number, zone: string): string {
  if (!zoneIsValid(zone)) return "";
  const part = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "short" })
    .formatToParts(new Date(utcMs))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

/**
 * The deadline said back in words, for the panel.
 *
 * The single most useful thing a countdown editor can show, and the thing
 * Elementor replaces with a caption about the editor's own timezone. Seeing
 * "12 Sep 2026, 09:48 IST · 05:18 in London" is how somebody catches that they
 * typed the wrong day before a page goes out.
 */
export function describeDeadline(local: string, zone: string, alsoIn = "Europe/London"): string {
  const at = instantFrom(local, zone);
  if (at === null) return "";
  const fmt = (z: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: z,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(at));
  const here = `${fmt(zone)} ${zoneLabel(at, zone)}`.trim();
  if (zone === alsoIn || !zoneIsValid(alsoIn)) return here;
  return `${here} · ${fmt(alsoIn)} in ${alsoIn.split("/").pop()!.replace(/_/g, " ")}`;
}

export type Remaining = { days: number; hours: number; minutes: number; seconds: number; done: boolean };

/**
 * How much is left, broken into units.
 *
 * Clamped at zero rather than counting negative: a passed deadline is "done",
 * and a block showing "-3 days" is a page nobody maintained.
 *
 * `carry` folds hidden units into the next one up, so hiding Days on a
 * three-day countdown reads "72 hours" instead of silently losing three days —
 * which is what every widget that hides a unit without carrying does.
 */
export function remainingAt(deadlineMs: number, nowMs: number, carry = { days: true, hours: true, minutes: true }): Remaining {
  const left = Math.max(0, deadlineMs - nowMs);
  const total = Math.floor(left / 1000);
  const days = carry.days ? Math.floor(total / 86400) : 0;
  const afterDays = total - days * 86400;
  const hours = carry.hours ? Math.floor(afterDays / 3600) : 0;
  const afterHours = afterDays - hours * 3600;
  const minutes = carry.minutes ? Math.floor(afterHours / 60) : 0;
  const seconds = afterHours - minutes * 60;
  return { days, hours, minutes, seconds, done: left === 0 };
}

/** "1 day" / "2 days" — Elementor prints "1 Days". */
export function unitLabel(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/** Two digits when asked, so 07 and 7 are a choice rather than an accident. */
export const pad = (n: number, on: boolean) => (on ? String(n).padStart(2, "0") : String(n));


/**
 * An evergreen deadline: a length, started when this visitor first arrived.
 *
 * The start is remembered in the browser, so a reload does not hand somebody a
 * fresh 48 hours — which is the version of this widget that lies. It is still
 * per visitor: a different browser is a different deadline, and clearing site
 * data starts it again. That is the honest limit of a timer with nothing behind
 * it, and it is why `docs/countdown-block.md` calls the enforced version a
 * separate piece of work.
 *
 * Keyed by block id AND by the length, so changing 48 hours to 24 starts
 * everyone again rather than leaving old visitors on a deadline the page no
 * longer offers.
 */
export const evergreenKey = (blockId: string, minutes: number) => `gi.cd.${blockId}.${minutes}`;

/** Minutes from the three fields, floored at one so a zero-length is not "already over". */
export function evergreenMinutes(days: number, hours: number, minutes: number): number {
  return Math.max(1, Math.round(days) * 1440 + Math.round(hours) * 60 + Math.round(minutes));
}

/**
 * When this visitor's clock ends, reading and writing the stored start.
 *
 * `restartAfterDays` at 0 means never: once it has run out it stays run out.
 * Above zero, somebody who comes back later than that gets a new one — which is
 * a real campaign pattern (a monthly window) rather than a reset on every
 * visit, and is stated in the panel rather than being a surprise.
 */
export function evergreenDeadline(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  minutes: number,
  nowMs: number,
  restartAfterDays = 0,
): number {
  const raw = storage.getItem(key);
  const started = raw === null ? NaN : Number(raw);
  const valid = Number.isFinite(started) && started > 0 && started <= nowMs;
  if (valid) {
    const ends = started + minutes * 60000;
    const restartable = restartAfterDays > 0 && nowMs >= ends + restartAfterDays * 86400000;
    if (!restartable) return ends;
  }
  storage.setItem(key, String(nowMs));
  return nowMs + minutes * 60000;
}
