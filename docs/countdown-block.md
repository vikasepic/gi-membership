# Countdown block — feature table

**Built, 12 Aug 2026.** Due-date clock with a real timezone; a date-and-time
picker rather than a typed string; **evergreen**, per visitor, remembered so a
reload does not hand out a fresh window; unit toggles that carry; singular and
plural labels; leading zero; separator; the four expiry actions; and separate
font, size, weight, colour, case and letter-spacing for digits and labels, plus
box border, corner, shadow and least-width.

Still not built, and still open: **decision 2** — whether expiry does anything
beyond presentation. The evergreen timer here is a page feature; nothing about
the price changes when it reaches zero, and a visitor on another browser gets
their own window. `docs` says this plainly because the store's rule is that it
never fabricates urgency, and this is the one control that can.

A store-wide default timezone is not built either; a block naming no zone reads
UTC.

Studied from the Elementor Countdown widget (its Content, Style and Advanced
tabs, plus the official 3-minute walkthrough) and from the four screenshots
supplied on 12 Aug 2026. Nothing here is built yet.

**Two things are decided already and shape everything below:**

1. **Timezone is a first-class setting, not a note.** Elementor prints
   *"Date set according to your timezone: UTC+5.5"* under the date field — the
   deadline is stored in whatever timezone the **editor's browser** happened to
   be in. That is a real defect, not a caption: the same countdown means a
   different moment to a reader in Delhi and one in London, and it silently
   moves if the person editing it travels. We store an explicit zone with the
   date and resolve to a real instant, so every viewer counts to the same second.
2. **Most of Elementor's Style tab is already free here.** Every block in this
   builder has margin, padding, width, max-width, alignment, background
   (colour / image / gradient), corner, per-edge border, box shadow, per-device
   visibility, CSS id / class / custom CSS, and a typography set. The columns
   below mark what already exists so nobody rebuilds it.

Status key — **Have**: works today for every block · **Build**: new work ·
**New**: beyond what Elementor offers.

---

## Content

| Setting | What it does | Options / range | Status | Notes |
|---|---|---|---|---|
| Type | Which clock this is | Due date · Evergreen | Build | Decides which fields below apply. See *Open decisions*. |
| Due date | The moment counted to | Date + time picker | Build | Stored as an instant, not a local string. |
| **Timezone** | Which zone the date is read in | IANA list (`Europe/London`, `Asia/Kolkata`, …) + "the store's timezone" | **New** | The fix for Elementor's caption. Default: the store's own zone, set once in Site settings. |
| Show what it resolves to | States the deadline in plain words under the field | read-only | **New** | e.g. "Ends 12 Sep 2026, 09:48 IST — 05:18 in London". Removes the guesswork the caption creates. |
| Evergreen duration | Per-visitor length | Hours + Minutes (Elementor); add **Days** | Build | Elementor caps at hours+minutes; days is an obvious gap. |
| Evergreen restart | What a returning visitor sees | Never restarts · restarts after N days | **New** | Elementor is silent on this, which is how it becomes dishonest. |
| Days / Hours / Minutes / Seconds | Show or hide each unit | 4 toggles | Build | Independent, as Elementor. |
| Show label | Labels under the digits | on / off | Build | |
| Custom label | Replace the default words | on / off + 4 text fields | Build | Days / Hours / Minutes / Seconds. |
| **Label wording by value** | "1 day" vs "2 days" | singular + plural per unit | **New** | Elementor prints "1 Days". |
| **Leading zero** | 07 vs 7 | on / off | **New** | |
| **Separator** | Character between boxes | none · `:` · custom | **New** | |
| Actions after expire | What happens at zero | Redirect · Hide · Show message | Build | Elementor allows more than one. |
| Redirect URL | Where to send them | URL | Build | Must be validated the way nav links are (`/` or `https://`). |
| Message | Shown in place of the clock | rich text | Build | |
| **Before-start behaviour** | Deadline is in the future beyond the page's use, or already past when saved | hide · show message · count anyway | **New** | Elementor has no answer; a stale page just shows zeros. |

## Style — Countdown → Container

| Setting | Options | Status | Notes |
|---|---|---|---|
| Layout | Stretch · Centred | Build | Elementor's two-icon control. |
| Container width | slider + unit (% / px) | Have | `width` + `maxWidthValue` / `maxWidthUnit`. |
| Space between | slider + unit | Build | Gap between boxes — the block needs its own, per device. |

## Style — Countdown → Boxes

| Setting | Options | Status | Notes |
|---|---|---|---|
| Padding | 4 sides + link, per device | Have | |
| Background colour | colour | Have | Also gradient and image, which Elementor does not offer here. |
| Border type | none / solid / dashed / … | Have | Per-edge widths already supported. |
| Border radius | 4 corners + link | Have | Ours is a single corner value — **per-corner is Build**. |
| Box shadow | X / Y / blur / colour | Have | Added 11 Aug. Elementor also has spread + inset — **Build** if wanted. |

## Style — Content → Digits

| Setting | Options | Status | Notes |
|---|---|---|---|
| Colour | colour | Build | Must target digits **only** — block-level colour hits labels too. |
| Typography | family, size, weight, line-height, letter-spacing, case | Have (as a set) | Needs a **second** typography target on one block. That is the real work here. |
| Text shadow | X / Y / blur / colour | Build | We have box shadow, not text shadow. |

## Style — Content → Label

| Setting | Options | Status | Notes |
|---|---|---|---|
| Colour | colour | Build | Separate from digits. |
| Typography | full set | Build | Second target, as above. |
| Text shadow | X / Y / blur / colour | Build | |
| Text stroke | width + colour | Build | Elementor offers it on labels only. |

## Style — Message (only when "Show message" is set)

| Setting | Options | Status |
|---|---|---|
| Alignment | left · centre · right | Have |
| Colour | colour | Have |
| Typography | full set | Have |

## Advanced

Elementor's Advanced tab (margin, padding, z-index, responsive visibility, CSS
id/class, custom CSS, motion effects) is **already what every block here has**,
with the exception of motion effects, which this builder deliberately does not
have. No work.

---

## What this needs that Elementor does not have

- **A real timezone**, stored with the date, so the deadline is one instant
  rather than one string read differently by everyone.
- **Two typography targets on one block.** Today a block has one. Digits and
  labels needing separate size, weight and colour is the first case of this, and
  it will not be the last — the pattern is worth building once, properly.
- **A server-rendered first paint that does not lie.** The OTO sticky bar
  already solves this: it renders `null` until the client mounts, because a
  clock rendered on the server is wrong the moment it reaches the browser. Any
  countdown must copy that, or the page ships a frozen time and hydration
  flickers.
- **Honest expiry.** See below.

## Open decisions — these change the shape, not the settings

1. **Where the deadline lives.** Typed into the block, or read from something
   real — an offer's end date, a launch date set once and reused. The second
   means the clock cannot drift out of step with what the checkout actually
   does, and costs more.
2. **What "expired" means.** Presentation only, or the offer genuinely ends.
   That decides whether this is a page feature or touches the money path.
3. **Evergreen at all.** A per-visitor timer that resets on a new session while
   the price never changes is the fabricated urgency this store has ruled out.
   Evergreen with a server-side deadline per visitor, actually enforced, is
   honest and is real work. This is the store owner's call and has not been made.

## Reference already in the codebase

`components/oto/sticky-bar.tsx` — a working countdown against a real expiry
(a signed, single-use, short-TTL token). Read it before writing a second one:
it has the null-first-render fix and the once-per-second interval with cleanup.
