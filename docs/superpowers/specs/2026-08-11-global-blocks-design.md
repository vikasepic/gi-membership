# Global blocks — design

A template is a copy taken once. A **global block** stays linked: it is placed
on many pages, and editing it changes every page that uses it.

The brief said this needs "a reference in the page JSON and a resolve step at
render, not just another row", and that is exactly the shape below.

---

## Decisions taken before designing

Four, each settled with Ajit rather than assumed:

| Question | Decision |
|---|---|
| Where is a global edited from? | Anywhere it appears. One real copy; editing it changes every page. |
| Deleted while pages use it? | **Refused**, listing the pages. A live page cannot lose a chunk of itself because of a tidy-up on another screen. |
| Same thing as a saved template? | **No** — its own shelf in the UI, so which kind you are looking at is readable at a glance. |
| Can one page differ? | **Unlink.** That page keeps its own copy from then on; every other page stays linked. |

---

## The reference: a block type that draws nothing

A new block type, `global`, whose only prop is the id it points at:

```ts
{ id: "b_1a2b3c4d", type: "global", props: { globalId: "…uuid…" }, style: … }
```

It sits in the page's blocks array like anything else, so a global call to
action can sit *beneath* a section's own heading rather than replacing the
whole band.

**Why a block type**, when the template brief says not to add one without
needing it: this one is structural, not a design. It draws nothing. The two
alternatives are worse — a reference on the section row makes a band all-or-
nothing, and a `globalId` on every block puts a field on thousands of blocks
that almost none of them use, with murky meaning the moment the linked thing is
a row with columns.

`blockRendersNothing` returns **true** for a `global`, always. That looks wrong
until you follow the order: expansion happens before anything renders, so a
resolvable placeholder has already become its referenced blocks and is gone by
the time that function is asked. What is left to ask about is an *unexpanded*
placeholder — no map, or a target that no longer exists — and a pointer to
nothing draws nothing. So the page gets no gap, by the same rule an empty
heading already follows.

## The resolve step: a map handed to the renderer

`blocksForSection` is the single place a page's blocks are decided, and it is
pure and synchronous — the builder calls it too, in the browser. So it cannot
read the database. Instead it takes what it needs:

```ts
blocksForSection(view: SectionView, globals?: GlobalBlocks): Block[]
```

where `GlobalBlocks` is `Map<string, Block[]>`. Every existing caller keeps
working untouched, because the parameter is optional and absent means "expand
nothing".

The flow:

1. **Server reads the page.** `getPageSections` returns the rows as it does
   today, placeholders intact.
2. **One query for the globals.** `resolveGlobals(rows)` walks every section's
   blocks (including inside rows and columns — `walkBlocks` already does this),
   collects the `globalId`s, and fetches those rows in a single `in` query.
3. **The renderer expands.** `SalesPage` passes the map down; `blocksForSection`
   replaces each placeholder with the referenced blocks in place.

**Stored JSON always keeps the placeholder.** Expanding on read and saving the
result would silently break every link the first time a page was saved.

### Ids inside a resolved global

The referenced blocks carry the ids they have in the global's own row. Two
pages showing the same global therefore render the same ids, which is fine —
they are different documents. Within one page a global could in principle
appear twice; the resolve step re-ids the second and later copies so the DOM
never carries a duplicate id.

## Editing: anywhere, changes everywhere

Selecting a linked block in the builder shows a short panel in place of the
usual controls:

- **Linked to “Author — your host”** — the name, so it is obvious what is
  shared.
- **Edit globally** — opens the same `BlockEditor` on the global's own blocks.
  Saving writes to the global's row, not to the page. Every page using it
  changes.
- **Unlink** — see below.

The canvas draws the resolved design with a marker on it, so it is never a
surprise which blocks on a page are shared. Nothing about a linked block is
editable in the page's own JSON: the page holds a pointer, and a pointer has
no typography.

## Unlink: the page keeps a copy

Replaces the placeholder, **in that page only**, with the global's blocks under
fresh ids. From that moment they are ordinary blocks the page owns, and the
global stops reaching them.

One-way, and the confirmation says so: *"This page will keep what it has now
and stop receiving changes."* To go back you insert the global again.

## Deleting a global

Blocked while any page uses it. The delete path counts usages first and refuses
with the list of pages, so the fix is obvious: remove it from those pages, or
unlink them.

**Counted in application code, not by a jsonb query.** The obvious
`content @> '{"blocks":[{"props":{"globalId":"…"}}]}'` only matches a
placeholder at the top of a section: containment does not reach into a row's
columns, so a global dropped inside a two-column row would be invisible to it
and the guard would cheerfully delete something three live pages were using.
So the count reads this store's sections and walks each tree with `walkBlocks`,
which already descends into columns. It is a handful of rows for one store —
correctness is worth more than the query being clever.

## Storage

The existing `templates` table gains one column:

```sql
alter table templates add column if not exists kind text not null default 'template';
-- 'template' | 'global'
```

Both kinds hold the same thing — a name, a group, an array of `Block`, and the
band the design was drawn on — so a second near-identical table would be two
migrations, two readers and two places for a bug to hide. The **UI keeps them
apart**, which is the part that matters: separate shelves, so which kind you
are looking at is readable at a glance.

A consequence worth stating rather than hiding: promoting a saved design to a
global is a one-field update. No button is being built for it; if it is wanted
later, nothing has to be rebuilt.

## What changes on screen

**Templates screen** gains a third section, *Global blocks*, with its own
**New global block**. Cards there say how many pages use them; delete refuses
with the list.

**Library popup** shows globals in their own group. Inserting one drops a
**link**, not a copy, and the preview footer says so before the press that
commits it.

**Builder** gains the linked-block panel described above.

## Testing

| Behaviour | Why it is worth a test |
|---|---|
| A placeholder survives sanitize + normalize unchanged | If a save rewrites it, every link on the site breaks at once |
| Two pages sharing one global both change when it is edited | The entire point of the feature |
| A placeholder whose target is gone renders nothing | A live page must not develop a hole |
| Unlink leaves the global untouched and the page independent | The safety valve has to be safe in both directions |
| Delete refuses while in use, and names the pages | The guard Ajit chose |
| A global appearing twice on one page emits no duplicate ids | Selecting or deleting either would otherwise hit the first |
| `blocksForSection` with no map expands nothing | Every existing caller passes no map and must not change |

## Not in this piece of work

- **Promoting** a saved design to a global, or the reverse.
- **Re-linking** an unlinked block.
- **Nested globals** — a global containing a reference to another global. The
  resolve step expands one level and leaves any nested placeholder unresolved,
  which renders nothing rather than recursing.
- **Per-page overrides** of a linked block (change the heading here only).
  Unlink is the answer to that, deliberately: an override system is a second
  way for a page to differ, and two ways is how nobody can predict what a page
  will show.
