// How long ago a purchase was, worked out when its card appears, so a tab left
// open for an hour never says "2 minutes ago". Rounded down, never up: the
// popup does not get to make a sale look fresher than it was.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

export function timeAgo(at: string, now: Date): string {
  // A purchase "in the future" is the visitor's clock running slow.
  const ms = Math.max(0, now.getTime() - new Date(at).getTime());
  if (ms < MIN) return "just now";
  if (ms < HOUR) return plural(Math.floor(ms / MIN), "minute");
  if (ms < DAY) return plural(Math.floor(ms / HOUR), "hour");
  return plural(Math.floor(ms / DAY), "day");
}
