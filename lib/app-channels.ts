/**
 * The channels a connected app can grant, and the only values an offer may
 * hold.
 *
 * Named here rather than typed into the editor, because three places have to
 * agree about them: the checkbox list an admin ticks, the zod schema that
 * refuses anything else on save, and the CHECK constraint in 0058 that refuses
 * it again at the database. A fourth place — the app itself — has to agree
 * too, and cannot be made to by any code in this repo, which is exactly why
 * the values are short, lowercase and boring.
 *
 * Adding one is three edits and a migration, in that order: this list, the
 * CHECK, then tell the app. Adding it here alone produces a tickbox that saves
 * and a database that refuses.
 */
export const APP_CHANNELS = [
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
] as const;

export type AppChannel = (typeof APP_CHANNELS)[number]["value"];

export const APP_CHANNEL_VALUES = APP_CHANNELS.map((c) => c.value) as readonly string[];

/** Only the ones we know, de-duplicated, in the order above. */
export function normalizeChannels(raw: unknown): AppChannel[] {
  const asked = new Set(
    (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).map((v) => String(v).trim().toLowerCase()),
  );
  return APP_CHANNELS.filter((c) => asked.has(c.value)).map((c) => c.value);
}

/** "Instagram and LinkedIn" — for a summary line an admin reads. */
export function channelsLabel(channels: readonly string[]): string {
  const names = APP_CHANNELS.filter((c) => channels.includes(c.value)).map((c) => c.label);
  if (names.length === 0) return "the app's own default";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
