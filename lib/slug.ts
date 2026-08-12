// Turn a human title into a URL slug. Shared so the admin auto-fill and any
// server-side normalisation agree on the same rules.
//
// Matches the course/product slug constraint exactly: lowercase letters,
// numbers, and single hyphens, no leading/trailing hyphen.
export function slugify(input: string): string {
  return input
    .normalize("NFKD") // strip accents: "Café" -> "Cafe"
    .replace(/[̀-ͯ]/g, "") // combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // any run of non-alphanumerics becomes one hyphen
    .replace(/^-+|-+$/g, ""); // trim hyphens off both ends
}


/**
 * The same rules, minus the one that fights the keyboard.
 *
 * `slugify` trims hyphens off both ends, which is right for a finished slug and
 * impossible to type through: "funnel" + "-" becomes "funnel-", which trims
 * straight back to "funnel", so the hyphen vanishes the moment it is typed and
 * the next letter lands against the last one. Somebody trying to write
 * "funnel-kit" got "funnelkit" and no explanation.
 *
 * So a slug being TYPED keeps a trailing hyphen. Everything else is identical —
 * still lowercase, still no runs, still no leading hyphen — and `slugify` runs
 * on blur and again on the server, so what is finally stored is unchanged.
 */
export function slugDraft(input: string): string {
  const trailing = /-$/.test(input);
  const core = slugify(input);
  // A lone "-" is not a slug; it is somebody who has started typing.
  return core === "" ? "" : trailing ? `${core}-` : core;
}
