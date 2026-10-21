# Handing a page design to this repo

For whoever designs a sales or offer page, and for whoever ports it.

Nothing here is about how a page should look. Type, colour, spacing, layout
and motion are the designer's. This is only about the **technical shape** of
the files, so that porting a design is mechanical instead of a week of
translation. Every rule below exists because breaking it cost us real rework
on the Foundations Weekend page.

The short version: a page here is **a fixed list of bands, each holding
modules**. A design that is already cut that way ports in an afternoon. A
design built as one standalone HTML document does not — it has to be taken
apart first, and that is where the time goes.

---

## 1. A page is bands, and the bands have fixed names

A sales page is always these twelve, in this order:

    hero · problem · solution · benefits · offer · authority
    proof · value · guarantee · faq · cta · footer

Three things follow, and they are not negotiable:

- **The order comes from that list, not from the file.** `lib/pages.ts` merges
  stored rows onto the canonical list. Moving a section in the HTML moves
  nothing; the position column does not decide either.
- **A band with any other name is silently dropped.** Not an error — it just
  never renders.
- **A band is one background.** If the design changes ground colour, that is a
  band boundary.

So: split the design into bands and name each one. Where a visual section has
no obvious name, group by continuous background runs and tell us which band
you meant. Fewer, larger bands are fine; a band may hold several visual
sections. Unused bands are left empty.

## 2. Inside a band, everything is a module

The builder has a fixed vocabulary. Design whatever you like, but build
repeating structures out of these, because these are what an editor can later
change:

| The thing in the design | The module |
|---|---|
| A heading | `heading` |
| A paragraph or rich text | `text` |
| A picture | `image` · a video `video` |
| A call to action | `button` |
| A ticked or bulleted list | `iconlist` |
| A grid of titled cards | `cards` |
| A testimonial / quote carousel | `slides` |
| Questions and answers | `faq` |
| A figures strip | `stats` |
| A dated list down a line | `timeline` |
| A price panel | `pricecard` · a comparison `pricing` · ways to pay `prices` |
| A ticking deadline | `countdown` |
| A bar that follows the page | `stickybar` |
| Columns | `row` |
| Space / a rule | `spacer` · `divider` |

`html` exists and is the escape hatch. A page made of `html` blocks cannot be
edited by anyone in the admin, which is most of the point of the builder, so
treat it as a last resort and tell us when you have used one.

If a pattern in the design is none of these, say so early. Adding a module is
a reasonable outcome; discovering mid-port that a design needs one is not.

## 3. Markup conventions that make the port mechanical

These cost the designer nothing and save the most time:

- **One visual element, one element.** Don't wrap three unrelated things in a
  single styled div. Each will become its own block.
- **Repeating items are siblings with identical structure.** A module's items
  come from that repetition. Four cards where the third has an extra wrapper
  means the third cannot be the same module.
- **Mark what each repeating block is.** A `data-mod="cards"` on the container
  and `data-field="title"` / `"body"` / `"icon"` on the parts removes all
  guesswork. If you'd rather not, consistent class names do the same job —
  what matters is that the same role always carries the same name.
- **Put a single root class on every component**, and write all of its CSS
  under that class. See the next section for why.

## 4. CSS

Per-block CSS is scoped: `selector` is rewritten to that block's own class
(`lib/block-style.ts`). Page-level CSS is **not** scoped — it is injected into
the document as written. A stylesheet authored for a standalone page once
restyled the storefront chrome and the admin's editor canvas here, and took
several rounds to undo.

So:

- **No bare element selectors.** Not `body`, `html`, `*`, `section`, `h1`-`h3`,
  `p`, `a`, `img`, `footer`. Everything hangs off a component class.
- **No generic class names.** `.wrap`, `.nav`, `.center`, `.quiet`, `.grid`,
  `.card` collide with the app's own.
- **Never style by utility class.** Modules carry Tailwind classes, so a rule
  like `.thing .grid { grid-template-columns: … }` also hits the icon tile
  inside a card, which is a `<span class="grid">`. That exact bug shoved every
  step icon 26px sideways. Use a child combinator or your own class.
- **Don't rely on margin collapsing.** Blocks are flex items. Adjacent margins
  **add** instead of collapsing, so a 40px gap between two blocks whose
  paragraph already carries `1.05em` comes out at 58px. State the gap you want
  on one side only.
- **State grid columns explicitly.** Module grids use container queries, not
  viewport ones, so a grid inside a narrow column collapses to one column at
  any screen width. `repeat(3, minmax(0,1fr))` ports; relying on `auto-fit`
  inside a module does not.
- **Breakpoints are 767 and 1023.** Mobile ≤767, tablet 768–1023, desktop
  ≥1024. Use these and per-device values map onto the builder's own device
  settings instead of becoming custom CSS.
- Inline markup inside a text block is wrapped in a `<span>` by the renderer,
  so `p > span` targets that wrapper, not yours.

Aim for raw CSS under roughly **10% of the page**. Above that, it is usually a
sign that a module was available and wasn't used.

## 5. Motion

There is no built-in reveal setting; motion is CSS we port by hand.

- **Scroll-driven CSS only, by default.** `animation-timeline: view()` and a
  range. It cannot break the page.
- **Use `cover` ranges, not `entry`.** An `entry` range is only as long as the
  element itself, so a reveal on a heading finishes in ~24px of scroll and
  reads as no animation at all. `cover` spans the viewport plus the element.
  See `docs/lessons.md`, 21 Oct.
- **If motion must run on a clock** (an IntersectionObserver plus a timed
  transition, which is what most designs assume), flag it. It needs JavaScript
  that hides elements and depends on itself to bring them back — a decision to
  take deliberately on a page that takes money, not to discover during the
  port.
- Always include the `prefers-reduced-motion` fallback.

## 6. Things that behave

- **A buy button has no URL.** It is an action the page resolves to its own
  checkout. Don't hard-code a checkout link; mark it as the buy button.
- **Don't build your own carousel.** `slides` and a `cards` shelf both scroll,
  with arrows and pointer drag.
- **Anything else needing JavaScript, flag it.** Don't ship a design whose
  layout only resolves after a script runs.

## 7. Assets

- Images are uploaded to the store's library and served from its storage.
  Supply the files; don't inline base64, and don't bundle a photo into
  something reusable.
- Inline SVG is fine and ports as-is.
- Name any font the design needs. Don't assume one is already loaded.

## 8. What a standalone page assumes that this is not

A design file written as its own web page carries assumptions that are all
false here. Strip these:

- Styling or resetting `html` / `body`, including `scroll-behavior` and
  `overflow-x`.
- A global reset or normalise.
- A fixed header assuming it owns the window. The store draws its own header
  and footer. A page can hide them, but then it owns everything they did —
  including the policy links, which is a thing to decide, not to forget.
- Trailing-slash redirect scripts, analytics, consent banners. The app has its
  own.

## 9. What to hand over

- The HTML/CSS, cut into bands and named.
- A note of anything that is none of the modules in §2.
- A note of anything needing JavaScript.
- The image files.
- Desktop, tablet and mobile renderings, so the port can be checked against
  something. Each band's height at a stated width is the fastest check there
  is — it catches a wrong column count or a lost margin in seconds.
