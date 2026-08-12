"use client";

import { useState } from "react";
import { Group } from "@/components/admin/form-controls";
import {
  SNIPPET_PLACES,
  SNIPPET_PLACE_LABEL,
  parseHeadTags,
  type CodeSnippet,
  type SnippetPlace,
} from "@/lib/code-snippets";

/**
 * Code the owner pastes in, as a list rather than one box.
 *
 * Site-wide JavaScript is the inside of a script tag and holds one snippet;
 * this takes whole markup — `<script src>`, an inline block, a verification
 * `<meta>` — and takes several, each with a name so a list of five is readable
 * a year later.
 *
 * Two things the panel says out loud, because neither is guessable:
 * what a head snippet will actually emit, and that nothing runs on the checkout
 * unless it is told to.
 */
export function SnippetFields({ snippets }: { snippets: CodeSnippet[] }) {
  const [list, setList] = useState<CodeSnippet[]>(snippets);

  const edit = (i: number, patch: Partial<CodeSnippet>) =>
    setList(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const add = () =>
    setList([...list, { name: "", place: "bodyEnd", code: "", on: true, onCheckout: false }]);

  return (
    <Group
      label="Code snippets"
      changed={list.filter((s) => s.code.trim() !== "").length}
      hint="analytics, pixels, chat widgets, verification tags — whole markup, script tags and all"
    >
      <input type="hidden" name="codeSnippets" value={JSON.stringify(list)} />

      {list.length === 0 && (
        <p className="text-xs text-muted">
          Nothing added. Each snippet gets a name, a position and a switch, so
          several vendors can sit here without becoming one unreadable box.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {list.map((s, i) => (
          <li key={i} className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Name"
                value={s.name}
                onChange={(e) => edit(i, { name: e.target.value })}
                placeholder="What is it — Meta pixel, Crisp chat…"
                className="min-w-[10rem] flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              />
              <select
                aria-label="Where it goes"
                value={s.place}
                onChange={(e) => edit(i, { place: e.target.value as SnippetPlace })}
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              >
                {SNIPPET_PLACES.map((p) => (
                  <option key={p} value={p}>
                    {SNIPPET_PLACE_LABEL[p]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={s.on}
                  onChange={(e) => edit(i, { on: e.target.checked })}
                  className="size-3.5 accent-[var(--primary)]"
                />
                On
              </label>
              <button
                type="button"
                aria-label={`Remove ${s.name || "snippet"}`}
                onClick={() => setList(list.filter((_, j) => j !== i))}
                className="rounded px-1.5 text-xs text-muted hover:text-primary"
              >
                Remove
              </button>
            </div>

            <textarea
              aria-label="Code"
              value={s.code}
              rows={4}
              onChange={(e) => edit(i, { code: e.target.value })}
              placeholder={'<script async src="https://example.com/tag.js"></script>'}
              className="mt-2 w-full rounded-lg border border-border bg-surface px-2.5 py-2 font-mono text-[0.7rem] outline-none focus:border-primary"
            />

            {s.place === "head" && <HeadNote code={s.code} />}

            <label className="mt-2 flex items-start gap-2 text-[0.68rem] leading-snug text-muted">
              <input
                type="checkbox"
                checked={s.onCheckout}
                onChange={(e) => edit(i, { onCheckout: e.target.checked })}
                className="mt-0.5 size-3.5 shrink-0 accent-[var(--primary)]"
              />
              <span>
                Also run this on the checkout.{" "}
                <strong className="font-medium text-fg">Off by default on purpose.</strong> Card
                fields live in Stripe&rsquo;s own frame so no script here can read a card number —
                but one on that page can read the email and the name, and a payment page is
                supposed to have a known, deliberate list of scripts on it.
              </span>
            </label>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={add}
        className="w-fit rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-primary hover:text-fg"
      >
        Add a snippet
      </button>
    </Group>
  );
}

/**
 * What a head snippet will actually emit.
 *
 * A head cannot take arbitrary markup, so the paste is turned into real
 * `<script>`, `<meta>` and `<link>` elements. Saying which ones were found — and
 * which tags were not — is the difference between a snippet that silently does
 * nothing and one you can fix before saving.
 */
function HeadNote({ code }: { code: string }) {
  if (code.trim() === "") return null;
  const { tags, unsupported } = parseHeadTags(code);
  const counts = tags.reduce<Record<string, number>>((a, t) => ({ ...a, [t.tag]: (a[t.tag] ?? 0) + 1 }), {});
  const said = Object.entries(counts)
    .map(([t, n]) => `${n} ${t}${n === 1 ? "" : "s"}`)
    .join(", ");
  return (
    <p className="mt-1.5 text-[0.66rem] leading-snug">
      {said && <span className="text-muted">Will add {said} to the head. </span>}
      {unsupported.length > 0 && (
        <span className="text-primary">
          {unsupported.map((t) => `<${t}>`).join(", ")} cannot go in a head and will not be added —
          move this snippet to the top or the end of the page instead.
        </span>
      )}
    </p>
  );
}
