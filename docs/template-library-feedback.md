# Review notes — first pass

Collected one at a time from Ajit while the library was open in the builder.
Nothing is fixed until the whole set is in: the point of collecting first is to
find the pattern behind the notes rather than patching each in isolation.

---

## 1. The popup inserts on click, with no way to look first

> "In the popup on click It just add the section directly on the page.. I need
> to have the preview option first as the sections in small preview doesn't
> show everything. so lets add a big preview button as well to see the template
> in the popup again and choose to add on the page."

**Asked for:** a preview step. A button on each card that opens the design
large — inside the popup — and from there the choice to add it or go back.

**What is actually wrong underneath:** the tile is a fixed 4:3 box with the
design rendered at 900px and scaled to fit the tile's WIDTH. Anything taller
than 4:3 at that width is cut off at the bottom, which is why the author
designs stop mid-paragraph. So the small tile is not a preview of the design,
it is the top of the design. Two separate faults in one note:

- clicking commits immediately — no intent step between browsing and changing
  the page
- the tile crops rather than fits, so the thing being committed to is not what
  was on screen

A larger preview fixes the second only if it fits the whole design rather than
cropping it at a bigger size.

---

## 2a. The bleed shows up as a mystery negative margin

> "In the first author I see unwanted margin in - from botom."

The container's Margin reads `0 0 -64 0` in Advanced → Layout. That -64 is
mine: it is what makes the figure stand on the band's bottom edge instead of
floating above it, because it cancels the section's own `md:py-16`.

**The fault is not the look, it is that the trick is invisible and the number
is not.** Someone opening the panel finds a negative number nobody typed,
attached to no explanation, and the only sane reading is "something is wrong
here". A template may not leave a booby trap in the inspector.

Related to 2b: with a real section width control, the bleed does not need a
negative margin at all — see below.

## 2b. A section has no width control

> "section settings doesn't have width option to set.. And the column inside is
> in now fixed width.. so section must have width too. like elementor have
> Boxed, Full and custom"

Section settings currently offers Band colour, Accent, Background image,
Visibility and Attributes — no width. Every band is hardcoded in
`components/page/sales-page.tsx`: `px-6 py-12 md:py-16` around an inner
`mx-auto w-full max-w-[1040px]`.

**Asked for:** Boxed / Full / Custom on the section, the way Elementor does it.

This is the biggest note so far, and it reaches further than it looks:

- It is the honest fix for every "the design bleeds to the screen edge"
  problem — designs 1, 3, 4 and 5 all have full-bleed grounds, and I have been
  telling Ajit the band must carry them because a blocks-only template cannot
  reach the edge. A Full section makes that a setting rather than a caveat.
- It removes the negative-margin trick in 2a.
- It is a change to the page renderer and to what a section stores, not to a
  template — so it belongs in the plan as its own piece of work, ahead of
  rebuilding any design on top of it.

---

## 3. The About card does not match, and nothing has a z-index

> "The design is not matching the exact shared screenshot and blocks columns
> and section doesn't have z-index option too.. that's why you were not able to
> match the design"

The diagnosis is right, and it is worse than one missing control. Two separate
faults, both traced in the code:

**The overlap inverts in the builder.** On the live page the card covers the
photograph because a later sibling paints later — that is the whole mechanism,
since `columnCss` emits no margin and the card cannot be pulled left. In the
builder the photograph covers the card instead: the editor wraps each block in
its own positioned chrome, and a positioned element paints above a
non-positioned one whatever the source order says. So the trick holds on the
page and reverses in the editor.

**Nothing can express "this sits on top of that".** `BlockStyle` has no
z-index, and neither does `ColumnStyle`. Overlap therefore rests entirely on
paint order, which is not a thing an author can see, set, or reason about.
Ajit's read — that this is why the design does not match — is correct.

**The gradient button is missing in the builder, and that is a third fault.**
`customCss` is emitted only by `blockRules`, which the live page uses when it
is NOT pinned to a device. The editor canvas renders through `blockTextRules`,
which carries typography and ink and nothing else. So every Custom CSS rule is
invisible in the builder AND in the page editor's section preview — the pill
shows as the flat band accent there and as the teal-to-green gradient only on
the real page.

That matters beyond this card: the plan was to reach for Custom CSS for the
outlined stat boxes in design 6 and for anything else `BlockStyle` cannot say.
Every one of those would look wrong in the editor. Custom CSS is not a usable
building material for a template until the editor emits it too.
