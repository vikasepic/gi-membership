// Turns Font Awesome's metadata into the smallest thing an icon picker needs.
//
// Run: node scripts/extract-fa-icons.mjs
//
// The package is a devDependency and never reaches the browser. What ships is
// this file's output, loaded only when the picker is opened — and once an icon
// is chosen, its PATH is stored in the block, so the store's own pages draw it
// with no library and no lookup at all.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const meta = require("@fortawesome/fontawesome-free/metadata/icon-families.json");

const out = [];
for (const [id, entry] of Object.entries(meta)) {
  const styles = entry?.svgs?.classic ?? {};
  for (const [style, svg] of Object.entries(styles)) {
    if (!svg?.path) continue;
    out.push({
      // "solid check" is how a person searches; the id alone collides across
      // styles and the label alone is not unique either.
      i: `${style}:${id}`,
      l: entry.label ?? id,
      s: style,
      // Only the terms that are not already in the label, which is most of the
      // weight in this file.
      t: (entry.search?.terms ?? []).filter((t) => !String(entry.label ?? "").toLowerCase().includes(t)).slice(0, 8),
      v: (svg.viewBox ?? [0, 0, 512, 512]).join(" "),
      d: svg.path,
    });
  }
}
out.sort((a, b) => a.l.localeCompare(b.l) || a.s.localeCompare(b.s));
// public/, not lib/. In the bundle it would reach every page of the store;
// as a static file it is fetched once, by the admin, only when the picker is
// opened — and never by a store page, because choosing an icon stores its PATH
// in the block.
writeFileSync("public/fa-icons.json", JSON.stringify(out));
console.log(`icons: ${out.length}`);
console.log(`bytes: ${readFileSync("public/fa-icons.json").length}`);
