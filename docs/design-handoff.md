# Handing a page design to this repo

For whoever designs a sales or offer page, and for whoever ports it.

Nothing here is about how a page should look, or about what goes on it in what
order. Design from the copy, freely. This is only about the **technical shape**
of the files — the classes, the CSS, the markup, the scripts — so that porting
a design is mechanical instead of a week of translation.

Every rule below exists because breaking it cost us real rework.

The one thing worth knowing up front: a page here is assembled in a builder out
of components, and the people who later edit it do so component by component.
A design whose HTML is already cut that way ports in an afternoon. A design
built as one continuous standalone document does not — it has to be taken
apart first, and that is where the time goes.

---

## 1. Markup

These cost nothing to follow and save the most time:

- **One visual element, one element.** Don't wrap three unrelated things in a
  single styled div. Each becomes its own component.
- **Repeating items are siblings with identical structure.** A list of cards
  becomes one component holding four items — but only if the four are built
  the same way. A third card with an extra wrapper cannot be the same
  component as the other three.
- **Mark what each repeating block is.** `data-mod="cards"` on the container
  and `data-field="title"` / `"body"` / `"icon"` on the parts removes all
  guesswork. If you'd rather not use attributes, consistent class names do the
  same job — what matters is that the same role always carries the same name.
- **One root class per component**, with all of its CSS written under that
  class. See §3 for why this one matters more than it looks.

## 2. Components that already exist

Not a structure to design to — just the list of things the builder can already
draw. Where a pattern in your design is one of these, build it as the ordinary
version of that pattern and mark it, and we use the built-in. That is what
makes it editable afterwards by someone who is not a developer.

| The pattern | What it becomes |
|---|---|
| Heading, paragraph, rich text | `heading`, `text` |
| Picture, video | `image`, `video` |
| Call to action | `button` |
| Ticked or bulleted list | `iconlist` |
| Grid of titled cards | `cards` |
| Testimonial or quote carousel | `slides` |
| Questions and answers | `faq` |
| Figures strip | `stats` |
| Dated list down a line | `timeline` |
| Price panel, comparison, ways to pay | `pricecard`, `pricing`, `prices` |
| Ticking deadline | `countdown` |
| Bar that follows the page down | `stickybar` |
| Columns, space, a rule | `row`, `spacer`, `divider` |

Anything that is none of these is fine — it just becomes custom markup, which
is not editable later. Worth a word when you know you're doing it, so we can
decide whether it's worth building properly.

## 3. CSS

This is the section that bites hardest.

Component CSS is scoped to that component when we port it. Page-level CSS is
**not** — it is injected into the document as written. A stylesheet authored
for a standalone page once restyled the store's own navigation and the admin's
editing screen here, and took several rounds to undo.

- **No bare element selectors.** Not `body`, `html`, `*`, `section`,
  `h1`-`h3`, `p`, `a`, `img`, `footer`. Everything hangs off a class.
- **No generic class names.** `.wrap`, `.nav`, `.center`, `.quiet`, `.grid`,
  `.card`, `.title` all collide with the app's own.
- **Never style by utility class.** The components carry utility classes of
  their own, so a rule like `.thing .grid { grid-template-columns: … }` also
  hits an icon tile that happens to be a `<span class="grid">`. That exact
  collision shoved every step icon 26px sideways on a page we shipped.
  Use a child combinator, or your own class.
- **Don't rely on margin collapsing.** Components are laid out as flex items,
  so adjacent margins **add** instead of collapsing. A 40px gap between two
  blocks whose paragraph already carries `1.05em` comes out at 58px. Put the
  gap on the container rather than on its children, which also ports straight
  onto the builder's own spacing instead of becoming hand-written CSS.
- **`:first-child` and `:last-child` do not mean what they mean in your file.**
  Each paragraph becomes its own component, so every `<p>` is an only child and
  matches both. A `p:last-child { margin-bottom: 0 }` in a base sheet therefore
  zeroes the gap under *every* paragraph on the page — it did exactly that to
  one of ours, and took a round to find.
- **State grid columns explicitly.** Component grids resolve against their
  container, not the viewport, so a grid sitting in a narrow column collapses
  to one column at any screen width. `repeat(3, minmax(0,1fr))` ports;
  relying on `auto-fit` inside one does not.
- **Breakpoints are 767 and 1023.** Mobile ≤767, tablet 768–1023, desktop
  ≥1024. Use these and per-device values map onto the builder's own device
  settings instead of becoming hand-written CSS.
- Inline markup inside a text component is wrapped in a `<span>` when
  rendered, so `p > span` targets that wrapper rather than yours.

Aim to keep hand-written CSS under roughly **10% of the page**. Much above
that usually means a built-in component was available and wasn't used.

## 4. Motion

- **Scroll-driven CSS is the default**: `animation-timeline: view()` and a
  range. It needs no script and cannot break the page.
- **Use `cover` ranges, not `entry`.** An `entry` range is only as long as the
  element itself, so a reveal on a heading finishes inside about 24px of
  scroll and reads as no animation at all. `cover` spans the viewport plus the
  element. See `docs/lessons.md`, 21 Oct.
- **If motion has to run on a clock** — an IntersectionObserver plus a timed
  transition, which is what most designs assume — say so. It needs JavaScript
  that hides elements and depends on itself to bring them back, which is a
  decision to take deliberately on a page that takes money, not to discover
  halfway through a port.
- **A reveal that hides with CSS must un-hide from the same place.** If a class
  on `<html>` sets `opacity: 0` but the observer that clears it lives in a
  separate file, then that file failing to load leaves the page blank rather
  than unanimated. Add the class only once the observer is attached.
- Always include the `prefers-reduced-motion` fallback.

## 5. JavaScript and anything that behaves

- **A buy button has no URL.** It is an action the page resolves to its own
  checkout. Don't hard-code a checkout link — mark which button it is.
- **Don't build your own carousel.** The built-in ones already scroll, with
  arrows and pointer drag.
- **Don't ship a layout that only resolves after a script runs.** If something
  genuinely needs JavaScript, flag it rather than assuming it will survive.
- Leave out trailing-slash redirect scripts, analytics, and consent banners.
  The app has its own and they conflict.

## 6. Assets

- Images are uploaded to the store's library and served from its storage.
  Supply the files; don't inline base64, and don't bundle a photo into
  anything meant to be reused.
- Inline SVG is fine and ports as-is.
- Name any font the design needs. Don't assume one is already loaded.

## 7. What a standalone page assumes that this is not

A file written as its own web page carries assumptions that are all false
here. Strip these:

- Styling or resetting `html` / `body`, including `scroll-behavior` and
  `overflow-x`.
- A global reset or normalise.
- A fixed header assuming it owns the window. The store draws its own header
  and footer. A page can hide them, but then it owns everything they did,
  including the policy links.

## 8. What to hand over

- The HTML and CSS.
- A note of anything that needs JavaScript.
- A note of anything that is deliberately custom rather than one of §2.
- The image files.
- Desktop, tablet and mobile renderings. The height of each section at a
  stated width is the fastest check there is — it catches a wrong column count
  or a lost margin in seconds.
