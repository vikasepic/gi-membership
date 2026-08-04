"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { useState } from "react";

// Keeps its HTML in a hidden input so the surrounding <form action={serverAction}>
// submits it like any other field. Output is sanitized server-side on save.
/**
 * `name` posts the HTML in a hidden input, for the forms that still use one.
 * `onChange` is for editors that hold their own state — the page editor has one
 * Save for the whole page, so there is no form here to submit.
 */
export function RichText({
  name,
  value,
  onChange,
}: {
  name?: string;
  value: string;
  onChange?: (html: string) => void;
}) {
  const [html, setHtml] = useState(value ?? "");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false }),
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: value ?? "",
    onUpdate: ({ editor }) => {
      const next = editor.getHTML();
      setHtml(next);
      onChange?.(next);
    },
    editorProps: {
      attributes: {
        class:
          "prose-editor min-h-48 w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none focus:border-primary",
      },
    },
  });

  if (!editor) return null;

  const Btn = ({ on, active, children }: { on: () => void; active: boolean; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={on}
      className={`rounded px-2 py-1 text-xs ${active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border px-2 py-1">
        <Btn on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>Bold</Btn>
        <Btn on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>Italic</Btn>
        <Btn on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}>H2</Btn>
        <Btn on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })}>H3</Btn>
        <Btn on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>List</Btn>
        <Btn on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>1. List</Btn>
        <Btn on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>Quote</Btn>
        <Btn
          on={() => {
            const url = window.prompt("Link URL");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          active={editor.isActive("link")}
        >
          Link
        </Btn>
      </div>
      <EditorContent editor={editor} />
      {name && <input type="hidden" name={name} value={html} />}
    </div>
  );
}
