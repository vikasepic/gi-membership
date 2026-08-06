/**
 * The shape of every cover image, in one place.
 *
 * The same file was drawn 16:10 on the storefront and 4:5 in the library, so a
 * landscape cover was centre-cropped to portrait the moment a buyer opened
 * what they had bought — different framing, and anything near the edges gone.
 * One image cannot serve two shapes, so there is one shape.
 *
 * 16:10 rather than 16:9: it is the ratio five of the seven surfaces already
 * used, and it leaves a little more height for a face or a title than video
 * does.
 */
export const COVER_RATIO = "16 / 10";

/** Tailwind's form of the same thing, for a class name. */
export const COVER_ASPECT = "aspect-[16/10]";

/**
 * What to upload.
 *
 * 1600 wide covers the largest place a cover is drawn (a full-width hero on a
 * large screen) at 2× for a retina display. Bigger is only slower; smaller
 * goes soft exactly where the image is largest.
 */
export const COVER_WIDTH = 1600;
export const COVER_HEIGHT = 1000;

/** "1600 × 1000" — for telling someone what to make. */
export const COVER_SIZE_LABEL = `${COVER_WIDTH} × ${COVER_HEIGHT}`;

/**
 * What is wrong with an image someone is about to upload, in their words.
 *
 * Warnings, never refusals. A slightly-off cover is a cosmetic problem and
 * blocking the upload over it would stop someone shipping a product for the
 * sake of forty pixels.
 */
export function coverWarnings(width: number, height: number): string[] {
  const out: string[] = [];
  if (width < COVER_WIDTH * 0.6) {
    out.push(`It is ${width}px wide. Under ${Math.round(COVER_WIDTH * 0.6)}px it will look soft on a large screen.`);
  }
  const ratio = width / height;
  const target = COVER_WIDTH / COVER_HEIGHT;
  // A tenth off is invisible once cropped. Beyond that something is losing a
  // real part of the picture, and it is worth saying which way.
  if (ratio < target * 0.9) {
    out.push("It is taller than the frame, so the top and bottom will be cropped off.");
  } else if (ratio > target * 1.1) {
    out.push("It is wider than the frame, so the sides will be cropped off.");
  }
  return out;
}

/** Mirrors the server limit in lib/media.ts. */
export const COVER_MAX = 5 * 1024 * 1024;
export const mb = (n: number) => `${Math.round(n / 1024 / 1024)}MB`;
