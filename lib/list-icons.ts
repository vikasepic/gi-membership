/**
 * The marks a list can put in front of a line.
 *
 * Drawn here as paths rather than pulled from an icon package, and that is a
 * decision worth stating: a library like Font Awesome is either a dependency
 * this repo installs — which it cannot do quietly, two sessions share one
 * `node_modules` — or a stylesheet fetched from somebody else's CDN on every
 * page of a store that already refuses to load fonts that way. Neither is worth
 * it for twenty shapes. These ship in the page, cost nothing, and cannot go
 * down.
 *
 * All on a 24×24 grid, all `fill="currentColor"`, so one renderer draws any of
 * them at any size in any colour. Anything not here is an uploaded image.
 */

export type ListIcon = { id: string; label: string; d: string };

export const LIST_ICONS: ListIcon[] = [
  { id: "check", label: "Tick", d: "M9.6 16.2 5.4 12l-1.4 1.4 5.6 5.6L20.4 7.8 19 6.4 9.6 16.2Z" },
  { id: "check-circle", label: "Tick in a circle", d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.2 14.6-4.2-4.2 1.4-1.4 2.8 2.8 5.8-5.8 1.4 1.4-7.2 7.2Z" },
  { id: "dot", label: "Dot", d: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" },
  { id: "ring", label: "Ring", d: "M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" },
  { id: "square", label: "Square", d: "M7 7h10v10H7V7Z" },
  { id: "diamond", label: "Diamond", d: "M12 4 20 12l-8 8-8-8 8-8Z" },
  { id: "arrow", label: "Arrow", d: "M4 11h11.2l-4.6-4.6L12 5l7 7-7 7-1.4-1.4 4.6-4.6H4v-2Z" },
  { id: "chevron", label: "Chevron", d: "M9 5.4 15.6 12 9 18.6 7.6 17.2 12.8 12 7.6 6.8 9 5.4Z" },
  { id: "caret", label: "Caret", d: "M9 5l8 7-8 7V5Z" },
  { id: "plus", label: "Plus", d: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" },
  { id: "cross", label: "Cross", d: "M18.3 7.1 16.9 5.7 12 10.6 7.1 5.7 5.7 7.1l4.9 4.9-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9 4.9-4.9Z" },
  { id: "dash", label: "Dash", d: "M5 11h14v2H5v-2Z" },
  { id: "star", label: "Star", d: "M12 2.6l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.7l-5.9 3.1 1.2-6.6L2.5 9.6l6.6-.9L12 2.6Z" },
  { id: "heart", label: "Heart", d: "M12 21s-8-4.9-8-10.2A4.8 4.8 0 0 1 12 7.6 4.8 4.8 0 0 1 20 10.8C20 16.1 12 21 12 21Z" },
  { id: "bolt", label: "Bolt", d: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z" },
  { id: "shield", label: "Shield", d: "M12 2 4 5.4v5.8c0 4.6 3.4 8.8 8 9.8 4.6-1 8-5.2 8-9.8V5.4L12 2Z" },
  { id: "lock", label: "Lock", d: "M7 10V8a5 5 0 0 1 10 0v2h2v11H5V10h2Zm2 0h6V8a3 3 0 1 0-6 0v2Z" },
  { id: "clock", label: "Clock", d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 10.6 4 2.3-1 1.7-5-2.9V6h2v6.6Z" },
  { id: "download", label: "Download", d: "M11 3h2v9.2l3.6-3.6L18 10l-6 6-6-6 1.4-1.4L11 12.2V3ZM5 19h14v2H5v-2Z" },
  { id: "play", label: "Play", d: "M8 5.1 19 12 8 18.9V5.1Z" },
];

export const LIST_ICON_IDS = LIST_ICONS.map((i) => i.id);

const BY_ID = new Map(LIST_ICONS.map((i) => [i.id, i]));

/**
 * The path for a marker, or null when there is none to draw.
 *
 * Unknown ids fall back to the tick rather than to nothing: a list saved with a
 * mark that has since been renamed should keep a bullet, not silently lose it.
 */
export function listIconPath(id: string): string | null {
  if (id === "none" || id === "image") return null;
  return (BY_ID.get(id) ?? BY_ID.get("check"))!.d;
}
