/**
 * The Google families offered in the picker.
 *
 * A curated list rather than the whole catalogue, for two reasons. The full
 * index needs an API key in the environment, which is one more secret to hold
 * for a list that barely changes. And 1,800 families in a dropdown is a worse
 * picker than sixty, not a better one — nobody scrolls to Zilla Slab, they
 * scroll until they give up.
 *
 * Grouped by what they are for, because "which font" is a question people
 * answer by purpose long before they answer it by name.
 *
 * No `server-only`: the admin form needs these names in the browser.
 */

export type FontGroup = { label: string; families: string[] };

export const GOOGLE_FONTS: FontGroup[] = [
  {
    label: "Sans — neutral",
    families: [
      "Inter",
      "Roboto",
      "Open Sans",
      "Lato",
      "Source Sans 3",
      "Work Sans",
      "IBM Plex Sans",
      "Public Sans",
      "Manrope",
      "Figtree",
    ],
  },
  {
    label: "Sans — with character",
    families: [
      "Poppins",
      "Montserrat",
      "Nunito",
      "Raleway",
      "Rubik",
      "DM Sans",
      "Outfit",
      "Plus Jakarta Sans",
      "Space Grotesk",
      "Bricolage Grotesque",
      "Sora",
      "Urbanist",
    ],
  },
  {
    label: "Serif — for reading",
    families: [
      "Lora",
      "Merriweather",
      "Source Serif 4",
      "Crimson Pro",
      "Libre Baskerville",
      "EB Garamond",
      "Newsreader",
      "Spectral",
      "Bitter",
      "Literata",
    ],
  },
  {
    label: "Serif — for headlines",
    families: [
      "Playfair Display",
      "DM Serif Display",
      "Fraunces",
      "Instrument Serif",
      "Bodoni Moda",
      "Abril Fatface",
      "Cormorant Garamond",
      "Young Serif",
    ],
  },
  {
    label: "Display",
    families: ["Oswald", "Bebas Neue", "Anton", "Archivo Black", "Alfa Slab One", "Righteous"],
  },
  {
    label: "Monospace",
    families: ["JetBrains Mono", "IBM Plex Mono", "Space Mono", "Roboto Mono", "Fira Code"],
  },
  {
    label: "Handwriting",
    families: ["Caveat", "Kalam", "Patrick Hand", "Shadows Into Light"],
  },
];

export const GOOGLE_FAMILIES: string[] = GOOGLE_FONTS.flatMap((g) => g.families);

/**
 * The weights fetched for a family.
 *
 * Four, not nine. Every extra weight is another file a visitor downloads, and
 * a page that uses Thin and Black is rarer than a page that loads them and uses
 * neither. Italic is included because prose uses it and a browser asked for an
 * italic it does not have will slant the upright one itself, badly.
 */
export const FONT_WEIGHTS = [400, 500, 600, 700] as const;

/** Fonts that ship with the app and need no downloading. */
export const BUILT_IN_FONTS = ["Inter", "Poppins"] as const;
