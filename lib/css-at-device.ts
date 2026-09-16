import { DEVICE_MAX, type Device } from "@/lib/blocks";

/**
 * A stylesheet as one width would see it.
 *
 * The builder canvas is a 390px column inside a 1900px window, so a
 * `@media (max-width: 640px)` block in the page's own CSS never fires there
 * however narrow the canvas is drawn — the query asks the window. Every
 * per-device value the builder owns is inlined for the same reason; this does
 * the equivalent for CSS somebody typed: a media block whose query the device
 * would satisfy is unwrapped, one it would not is dropped, and everything
 * else passes through untouched.
 *
 * The live page never sees this. There the browser answers the query itself.
 */

/** A width each device stands for, for answering a query the way that device would. */
export const DEVICE_WIDTH: Record<Device, number> = {
  desktop: 1280,
  tablet: DEVICE_MAX.tablet ?? 1023,
  mobile: 390,
};

export function cssAtDevice(css: string, device: Device): string {
  return resolve(css, DEVICE_WIDTH[device]);
}

function resolve(css: string, width: number): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@media", i);
    if (at < 0) {
      out += css.slice(i);
      break;
    }
    const open = css.indexOf("{", at);
    if (open < 0) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(open + 1, depth === 0 ? j - 1 : j);
    if (queryMatches(css.slice(at + 6, open), width)) out += resolve(body, width);
    i = j;
  }
  return out;
}

/**
 * Whether a media query list holds at a width. Only width is answered — that
 * is the one thing the canvas lies about. Print is never the canvas; anything
 * else (screen, hover, reduced motion) is left as true so the rule survives
 * rather than vanishing over a feature nobody asked about.
 */
export function queryMatches(query: string, width: number): boolean {
  return query.split(",").some((alt) =>
    alt.split(/\band\b/i).every((part) => {
      const t = part.trim().toLowerCase();
      if (!t) return true;
      if (/\bprint\b/.test(t)) return false;
      const m = /\(\s*(max|min)-width\s*:\s*([\d.]+)\s*(px|em|rem)?\s*\)/.exec(t);
      if (m) {
        const n = parseFloat(m[2]) * (m[3] && m[3] !== "px" ? 16 : 1);
        return m[1] === "max" ? width <= n : width >= n;
      }
      const r = /\(\s*width\s*(<=|<|>=|>)\s*([\d.]+)\s*px\s*\)/.exec(t);
      if (r) {
        const n = parseFloat(r[2]);
        return r[1] === "<=" ? width <= n : r[1] === "<" ? width < n : r[1] === ">=" ? width >= n : width > n;
      }
      return true;
    }),
  );
}
