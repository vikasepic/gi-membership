"use client";

import { useState } from "react";
import { Group } from "@/components/admin/form-controls";
import { ColorControl } from "@/components/admin/color-control";
import { newColorId, type PaletteColor } from "@/lib/palette";

/**
 * The store's named colours.
 *
 * A hex typed into a block is a copy; there is no way back from twenty copies
 * to one decision. A colour named here is offered in every colour picker in the
 * builder, and a block that takes one stores a REFERENCE — so changing the
 * brand colour is this field, not a hunt through every page.
 *
 * Renaming is safe: the link is an id, generated when the colour is added and
 * never derived from the name.
 */

/** A sensible starting set, so the first press is not a blank row. */
const STARTERS: { name: string; value: string }[] = [
  { name: "Brand", value: "#b4472b" },
  { name: "Deep", value: "#1f3a5f" },
  { name: "Ink", value: "#16181f" },
  { name: "Paper", value: "#faf9f6" },
];

export function PaletteFields({ palette, name }: { palette: PaletteColor[]; name: string }) {
  const [list, setList] = useState<PaletteColor[]>(palette);

  const edit = (i: number, patch: Partial<PaletteColor>) =>
    setList(list.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const add = () =>
    setList([
      ...list,
      { id: newColorId(), ...(STARTERS[list.length] ?? { name: "", value: "#000000" }) },
    ]);

  return (
    <Group
      label="Global colours"
      changed={list.length}
      hint="named once here, offered in every colour picker in the page builder"
    >
      <input type="hidden" name={name} value={JSON.stringify(list)} />

      {list.length === 0 && (
        <p className="text-xs leading-relaxed text-muted">
          None yet. A colour added here appears under every colour control in the
          builder, and a block that uses one points at it — so changing it here
          changes it everywhere it was used, on every page at once.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {list.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2">
            <input
              aria-label={`${c.name || "Colour"} name`}
              placeholder="Name it — Brand, Ink, Panel"
              value={c.name}
              maxLength={40}
              onChange={(e) => edit(i, { name: e.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
            {/* The same control as everywhere else, with the globe off: this is
                where a global colour is DEFINED, and one pointing at another
                has no answer. */}
            <span className="flex w-40 shrink-0">
              <ColorControl
                label={`${c.name || "Colour"} value`}
                value={c.value}
                onChange={(v) => edit(i, { value: v ?? "#000000" })}
                globals={false}
              />
            </span>
            <button
              type="button"
              onClick={() => setList(list.filter((_, j) => j !== i))}
              // Said plainly: this is the one action here that reaches pages.
              title="Remove. Blocks using it keep the colour they were given."
              className="shrink-0 rounded px-1 text-xs text-muted hover:text-primary"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {list.length < 24 && (
        <button
          type="button"
          onClick={add}
          className="self-start rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-primary hover:text-fg"
        >
          Add a colour
        </button>
      )}

      <p className="text-[0.7rem] leading-relaxed text-muted">
        Removing a colour does not repaint anything: a block keeps the exact
        colour it was given, it just stops following this one.
      </p>
    </Group>
  );
}
