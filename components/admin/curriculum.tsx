"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addChapterAction,
  addLessonAction,
  deleteItemAction,
  moveItemToAction,
  renameItemAction,
  setPublishedAction,
} from "@/app/admin/courses/[id]/items/actions";
import { courseHealth, isUntitled, lessonIsEmpty } from "@/lib/curriculum-health";
import type { CourseItem, CurriculumNode } from "@/lib/curriculum";

// The curriculum.
//
// Chapters hold lessons, both drag to reorder, and a lesson can be dragged
// into another chapter. Every move sends the FINISHED position rather than a
// series of steps — see move_course_item, which has to do the renumber inside
// one transaction because sibling order is uniquely indexed.
//
// The screen leads with what is wrong. Every lesson in this store is currently
// empty and still called "New Lesson", and none of that is visible in a list
// of titles: a published lesson holding nothing is a dead end someone paid
// for, so it is named rather than left to be discovered.

type Drag =
  | { kind: "lesson"; id: string; from: string }
  | { kind: "chapter"; id: string }
  | null;

const TYPE_LABEL: Record<CourseItem["itemType"], string> = {
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  text: "Text",
};

/** What a lesson actually holds, in words. */
function contents(l: CourseItem): string[] {
  const bits: string[] = [];
  if (l.videoEmbedUrl?.trim()) bits.push("video");
  const audio = l.audioUrls.filter((u) => u.trim()).length;
  if (audio) bits.push(`${audio} audio`);
  if (l.attachments.length) bits.push(`${l.attachments.length} file${l.attachments.length === 1 ? "" : "s"}`);
  if (l.bodyHtml?.replace(/<[^>]*>/g, "").trim()) bits.push("written");
  return bits;
}

const pill = "rounded-full border px-1.5 py-0.5 text-[0.62rem] leading-4 whitespace-nowrap";
const PILL = {
  type: `${pill} border-border bg-surface-2 text-muted`,
  warn: `${pill} border-[#e8d6ab] bg-[#fdf5e4] font-semibold text-[#8a5a12]`,
  live: `${pill} border-[#bfdccb] bg-[#eaf4ee] font-semibold text-[#1f7a4d]`,
  draft: `${pill} border-border bg-surface-2 text-muted`,
};

export function Curriculum({
  courseId,
  nodes,
  chapterLabel,
  lessonLabel,
}: {
  courseId: string;
  nodes: CurriculumNode[];
  chapterLabel: string;
  lessonLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const drag = useRef<Drag>(null);
  const health = useMemo(() => courseHealth(nodes), [nodes]);

  const chapter = chapterLabel.toLowerCase();
  const lesson = lessonLabel.toLowerCase();

  function run(action: (fd: FormData) => Promise<void>, fields: Record<string, string>) {
    const fd = new FormData();
    fd.set("courseId", courseId);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    start(async () => {
      await action(fd);
      router.refresh();
    });
  }

  function move(id: string, parentId: string | null, index: number) {
    run(moveItemToAction, { itemId: id, parentId: parentId ?? "", index: String(index) });
  }

  function onDrop(e: React.DragEvent, target: { kind: "lesson"; ch: string; index: number } | { kind: "chapter"; index: number }) {
    const d = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    if (d.kind === "lesson" && target.kind === "lesson") move(d.id, target.ch, target.index);
    if (d.kind === "chapter" && target.kind === "chapter") move(d.id, null, target.index);
  }

  const problems: string[] = [];
  if (health.publishedEmpty)
    problems.push(
      `${health.publishedEmpty} published ${health.publishedEmpty === 1 ? "lesson has" : "lessons have"} nothing in ${health.publishedEmpty === 1 ? "it" : "them"}`,
    );
  if (health.hollowChapters)
    problems.push(`${health.hollowChapters} live ${chapter}${health.hollowChapters === 1 ? " is" : "s are"} empty`);
  if (health.lessons > 0 && health.published === 0)
    problems.push("nothing is published, so a buyer opens this and finds an empty course");

  return (
    <section className="flex flex-col gap-4" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg">Curriculum</h2>
        <span className="ml-auto" />
        <button
          type="button"
          onClick={() => run(addChapterAction, { title: `New ${chapterLabel}` })}
          className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-fg"
        >
          Add {chapter}
        </button>
      </div>

      {/* What is wrong, counted. Derived from the tree, so it cannot go stale. */}
      <div className="flex flex-wrap gap-2">
        <Stat n={health.chapters} label={`${chapter}s`} />
        <Stat n={health.lessons} label={`${lesson}s`} />
        <Stat n={health.published} label="published" />
        <Stat n={health.empty} label="with nothing in them" flag />
        <Stat n={health.untitled} label="still untitled" flag />
      </div>

      {problems.length > 0 && (
        <p className="rounded-xl border border-[#e8d6ab] bg-[#fdf5e4] px-3 py-2 text-sm text-[#8a5a12]">
          Needs attention: {problems.join(" · ")}.
        </p>
      )}

      {nodes.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted">
          No {chapter}s yet. Add one to start building this course.
        </p>
      )}

      <ol className="flex flex-col gap-2.5">
        {nodes.map((ch, ci) => (
          <li
            key={ch.id}
            draggable
            onDragStart={(e) => {
              drag.current = { kind: "chapter", id: ch.id };
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              drag.current = null;
              setDropTarget(null);
            }}
            onDragOver={(e) => {
              if (drag.current?.kind !== "chapter") return;
              e.preventDefault();
              setDropTarget(ch.id);
            }}
            onDrop={(e) => onDrop(e, { kind: "chapter", index: ci })}
            className={`overflow-hidden rounded-xl border bg-surface ${
              dropTarget === ch.id ? "border-primary" : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 bg-surface-2 px-3 py-2.5">
              <span className="cursor-grab select-none text-muted" title={`Drag to reorder ${chapter}s`} aria-hidden>
                ⠿
              </span>
              <span className="w-6 text-xs tabular-nums text-muted">{String(ci + 1).padStart(2, "0")}</span>
              <button
                type="button"
                onClick={() => setFolded((f) => ({ ...f, [ch.id]: !f[ch.id] }))}
                aria-expanded={!folded[ch.id]}
                aria-label={folded[ch.id] ? `Expand ${ch.title}` : `Collapse ${ch.title}`}
                className="px-1 text-xs text-muted hover:text-fg"
              >
                {folded[ch.id] ? "▸" : "▾"}
              </button>

              {renaming === ch.id ? (
                <RenameField
                  value={ch.title}
                  onDone={(title) => {
                    setRenaming(null);
                    if (title && title !== ch.title) run(renameItemAction, { itemId: ch.id, title });
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setRenaming(ch.id)}
                  title="Rename"
                  className={`min-w-0 truncate text-left font-medium ${isUntitled(ch.title) ? "italic text-muted" : ""}`}
                >
                  {ch.title}
                </button>
              )}

              <span className={ch.isPublished ? PILL.live : PILL.draft}>{ch.isPublished ? "Live" : "Draft"}</span>
              <span className="text-xs text-muted">
                {ch.children.length} {ch.children.length === 1 ? lesson : `${lesson}s`}
              </span>

              <span className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => run(addLessonAction, { parentId: ch.id, title: `New ${lessonLabel}` })}
                  className="rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-fg"
                >
                  Add {lesson}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run(setPublishedAction, {
                      itemId: ch.id,
                      scope: "chapter",
                      published: String(!ch.isPublished),
                    })
                  }
                  className="rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-fg"
                >
                  {ch.isPublished ? "Unpublish" : "Publish"} all
                </button>
                <DeleteButton
                  label={`Delete ${chapter}`}
                  confirm={
                    ch.children.length
                      ? `Delete “${ch.title}” and its ${ch.children.length} ${ch.children.length === 1 ? lesson : `${lesson}s`}? This cannot be undone.`
                      : `Delete “${ch.title}”?`
                  }
                  onConfirm={() => run(deleteItemAction, { itemId: ch.id })}
                />
              </span>
            </div>

            {!folded[ch.id] &&
              (ch.children.length === 0 ? (
                <p className="border-t border-border px-3 py-3 pl-10 text-sm text-muted">
                  Nothing in this {chapter} yet
                  {ch.isPublished ? " — and it is live, so a buyer opens it and finds nothing." : "."}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {ch.children.map((l, li) => {
                    const bits = contents(l);
                    const empty = lessonIsEmpty(l);
                    return (
                      <li
                        key={l.id}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          drag.current = { kind: "lesson", id: l.id, from: ch.id };
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          drag.current = null;
                          setDropTarget(null);
                        }}
                        onDragOver={(e) => {
                          if (drag.current?.kind !== "lesson") return;
                          e.preventDefault();
                          e.stopPropagation();
                          setDropTarget(l.id);
                        }}
                        onDrop={(e) => onDrop(e, { kind: "lesson", ch: ch.id, index: li })}
                        className={`flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5 pl-10 ${
                          dropTarget === l.id ? "bg-surface-2 shadow-[inset_3px_0_0_var(--primary)]" : ""
                        }`}
                      >
                        <span className="cursor-grab select-none text-muted" title={`Drag to reorder ${lesson}s`} aria-hidden>
                          ⠿
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          {renaming === l.id ? (
                            <RenameField
                              value={l.title}
                              onDone={(title) => {
                                setRenaming(null);
                                if (title && title !== l.title) run(renameItemAction, { itemId: l.id, title });
                              }}
                            />
                          ) : (
                            <Link
                              href={`/admin/courses/${courseId}/items/${l.id}`}
                              className={`w-fit max-w-full truncate border-b border-border text-sm font-medium hover:border-fg ${
                                isUntitled(l.title) ? "italic text-muted" : ""
                              }`}
                            >
                              {l.title}
                            </Link>
                          )}
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                            <span className={PILL.type}>{TYPE_LABEL[l.itemType]}</span>
                            {empty ? <span className={PILL.warn}>Empty</span> : <span>{bits.join(" · ")}</span>}
                            {isUntitled(l.title) && <span className={PILL.warn}>Untitled</span>}
                          </span>
                        </span>

                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setRenaming(l.id)}
                            className="rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-fg"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              run(setPublishedAction, { itemId: l.id, published: String(!l.isPublished) })
                            }
                            className="rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-fg"
                          >
                            {l.isPublished ? "Unpublish" : "Publish"}
                          </button>
                          <span className={l.isPublished ? PILL.live : PILL.draft}>
                            {l.isPublished ? "Live" : "Draft"}
                          </span>
                          <DeleteButton
                            label={`Delete ${lesson}`}
                            confirm={`Delete “${l.title}”? This cannot be undone.`}
                            onConfirm={() => run(deleteItemAction, { itemId: l.id })}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ))}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Stat({ n, label, flag }: { n: number; label: string; flag?: boolean }) {
  const bad = flag && n > 0;
  return (
    <span
      className={`rounded-lg border px-3 py-1.5 ${
        bad ? "border-[#e8d6ab] bg-[#fdf5e4]" : "border-border bg-surface"
      }`}
    >
      <b className={`block text-lg tabular-nums leading-6 ${bad ? "text-[#8a5a12]" : ""}`}>{n}</b>
      <span className="text-[0.7rem] text-muted">{label}</span>
    </span>
  );
}

/** Rename in place. Enter commits, Escape abandons, blur commits. */
function RenameField({ value, onDone }: { value: string; onDone: (title: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <input
      autoFocus
      aria-label="Title"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onDone(text.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") onDone("");
      }}
      className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-fg"
    />
  );
}

/**
 * Two clicks to delete.
 *
 * A curriculum row carries a lesson somebody wrote and a chapter carries every
 * lesson under it, and there is no undo — so the second click states what
 * actually goes.
 */
function DeleteButton({
  label,
  confirm,
  onConfirm,
}: {
  label: string;
  confirm: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setArmed(true)}
        className="rounded px-1.5 py-0.5 text-sm text-muted hover:bg-surface-2 hover:text-primary"
      >
        ✕
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-1">
      <span className="text-xs text-muted">{confirm}</span>
      <button
        type="button"
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
        className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-fg"
      >
        Delete
      </button>
      <button type="button" onClick={() => setArmed(false)} className="text-xs text-muted hover:text-fg">
        Keep
      </button>
    </span>
  );
}
