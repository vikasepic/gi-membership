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
