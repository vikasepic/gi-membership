"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { emailExtensions } from "@/lib/email-editor-extensions";
import { EMAIL_FONTS, FONT_SIZES, MERGE_KEYS, MERGE_LABELS, type DocNode, type EmailLayout } from "@/lib/post-purchase-layout";
import { MediaModal, type PickedMedia } from "@/components/admin/media-modal";
import { publicCoverUrl } from "@/lib/media-url";

type Pop = null | "link" | "image" | "button";

/**
 * One post-purchase email, edited where it will be read: the canvas has the
 * email's own width, padding, colours and font, so what the owner arranges is
 * what arrives. The toolbar offers what an email client can show, and no more.
 */
export function EmailEditor({
  doc,
  docKey,
  onChange,
  layout,
  view,
}: {
  doc: DocNode;
  /** Changes when a different email is opened, so the editor reloads. */
  docKey: string;
  onChange: (doc: DocNode) => void;
  layout: EmailLayout;
  view: "desktop" | "mobile";
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: emailExtensions(),
    content: doc,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as DocNode),
    editorProps: { attributes: { class: "email-canvas-body", "aria-label": "Email content" } },
  });
  const [, rerender] = useState(0);
  const [pop, setPop] = useState<Pop>(null);
  const [media, setMedia] = useState(false);

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(doc, { emitUpdate: false });
    // Only when a different email is opened, never on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, editor]);

  useEffect(() => {
    if (!editor) return;
    const tick = () => rerender((n) => n + 1);
    editor.on("selectionUpdate", tick);
    editor.on("transaction", tick);
    return () => {
      editor.off("selectionUpdate", tick);
      editor.off("transaction", tick);
    };
  }, [editor]);

  if (!editor) return null;

  const width = view === "desktop" ? `min(100%, ${layout.desktopWidth}px)` : `${layout.mobileWidthPct}%`;
  const pad = view === "desktop" ? layout.desktopPadding : layout.mobilePadding;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <Toolbar editor={editor} onPop={setPop} />
      {pop === "link" && <LinkPop editor={editor} onClose={() => setPop(null)} />}
      {pop === "image" && <ImagePop editor={editor} onClose={() => setPop(null)} onLibrary={() => setMedia(true)} />}
      {pop === "button" && <ButtonPop editor={editor} onClose={() => setPop(null)} />}
      <div className="overflow-x-auto bg-surface-2 px-3 py-6">
        <div className={view === "mobile" ? "mx-auto w-[375px] max-w-full overflow-hidden rounded-[28px] border-[10px] border-[#1d1d22]" : "w-full"}>
          <div style={{ background: layout.backgroundColor, padding: view === "desktop" ? "24px 0" : 0 }}>
            <div
              className="email-canvas mx-auto"
              style={{
                width,
                padding: pad,
                background: layout.bodyColor,
                color: layout.textColor,
                fontFamily: layout.fontFamily,
                fontSize: layout.fontSize,
                lineHeight: layout.lineHeight,
                ["--email-link" as string]: layout.linkColor,
              }}
            >
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>
      </div>
      <MediaModal
        kind="image"
        open={media}
        onClose={() => setMedia(false)}
        onPick={(item: PickedMedia) => {
          const src = item.url ?? publicCoverUrl(item.path) ?? "";
          if (src) editor.chain().focus().setImage({ src, alt: item.alt ?? "" }).run();
          setMedia(false);
          setPop(null);
        }}
      />
    </div>
  );
}

function Tb({ on, active, label, children }: { on: () => void; active?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm ${active ? "bg-primary/10 text-primary" : "hover:bg-surface"}`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, onPop }: { editor: Editor; onPop: (p: Pop) => void }) {
  const c = () => editor.chain().focus();
  const block = editor.isActive("heading", { level: 1 }) ? "h1" : editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "p";
  const sel = "h-8 rounded-md border border-border bg-surface px-2 text-xs";
  return (
    <div role="toolbar" aria-label="Formatting" className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-border bg-surface-2 p-2">
      <Tb label="Undo" on={() => c().undo().run()}>↶</Tb>
      <Tb label="Redo" on={() => c().redo().run()}>↷</Tb>
      <select aria-label="Text style" className={sel} value={block} onChange={(e) => {
        const v = e.target.value;
        if (v === "p") c().setParagraph().run();
        else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
      }}>
        <option value="p">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option>
      </select>
      <select aria-label="Font" className={sel} value={(editor.getAttributes("textStyle").fontFamily as string) ?? ""} onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}>
        <option value="">Font</option>
        {EMAIL_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <select aria-label="Font size" className={sel} value={(editor.getAttributes("textStyle").fontSize as string) ?? ""} onChange={(e) => (e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run())}>
        <option value="">Size</option>
        {FONT_SIZES.map((s) => <option key={s} value={`${s}px`}>{s}</option>)}
      </select>
      <Tb label="Bold" active={editor.isActive("bold")} on={() => c().toggleBold().run()}><b>B</b></Tb>
      <Tb label="Italic" active={editor.isActive("italic")} on={() => c().toggleItalic().run()}><i>I</i></Tb>
      <Tb label="Underline" active={editor.isActive("underline")} on={() => c().toggleUnderline().run()}><u>U</u></Tb>
      <Tb label="Strikethrough" active={editor.isActive("strike")} on={() => c().toggleStrike().run()}><s>S</s></Tb>
      <label className="relative inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md text-sm hover:bg-surface" title="Text colour">
        A<input type="color" aria-label="Text colour" className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => c().setColor(e.target.value).run()} />
      </label>
      <label className="relative inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md text-sm hover:bg-surface" title="Highlight">
        ▮<input type="color" aria-label="Highlight colour" className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => c().setBackgroundColor(e.target.value).run()} />
      </label>
      <Tb label="Align left" active={editor.isActive({ textAlign: "left" })} on={() => c().setTextAlign("left").run()}>⟸</Tb>
      <Tb label="Align centre" active={editor.isActive({ textAlign: "center" })} on={() => c().setTextAlign("center").run()}>⟺</Tb>
      <Tb label="Align right" active={editor.isActive({ textAlign: "right" })} on={() => c().setTextAlign("right").run()}>⟹</Tb>
      <Tb label="Bulleted list" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}>•</Tb>
      <Tb label="Numbered list" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}>1.</Tb>
      <Tb label="Link" active={editor.isActive("link")} on={() => onPop("link")}>Link</Tb>
      <Tb label="Image" on={() => onPop("image")}>Image</Tb>
      <Tb label="Button" on={() => onPop("button")}>Button</Tb>
      <Tb label="Divider" on={() => c().setHorizontalRule().run()}>―</Tb>
      <select aria-label="Insert a personal detail" className={sel} value="" onChange={(e) => {
        if (e.target.value) c().insertContent([{ type: "mergeTag", attrs: { key: e.target.value } }, { type: "text", text: " " }]).run();
      }}>
        <option value="">Insert detail</option>
        {MERGE_KEYS.map((k) => <option key={k} value={k}>{MERGE_LABELS[k]}</option>)}
      </select>
      <Tb label="Clear formatting" on={() => c().unsetAllMarks().clearNodes().run()}>Tx</Tb>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold">{label}</label>
      {children}
    </div>
  );
}
const input = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";

function PopShell({ title, children, onClose, onApply, apply }: { title: string; children: React.ReactNode; onClose: () => void; onApply: () => void; apply: string }) {
  return (
    <div role="dialog" aria-label={title} className="grid gap-3 border-b border-border bg-surface p-3 sm:grid-cols-2">
      {children}
      <div className="flex items-end justify-end gap-2 sm:col-span-2">
        <button type="button" className="rounded-full border border-border px-3 py-1.5 text-xs" onClick={onClose}>Cancel</button>
        <button type="button" className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg" onClick={onApply}>{apply}</button>
      </div>
    </div>
  );
}

function LinkPop({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { from, to } = editor.state.selection;
  const [text, setText] = useState(editor.state.doc.textBetween(from, to, " "));
  const [href, setHref] = useState((editor.getAttributes("link").href as string) ?? "https://");
  const apply = () => {
    const url = href.trim();
    if (!url || url === "https://") return onClose();
    if (from === to) {
      editor.chain().focus().insertContent({ type: "text", text: text || url, marks: [{ type: "link", attrs: { href: url, target: "_blank" } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url, target: "_blank" }).run();
    }
    onClose();
  };
  return (
    <PopShell title="Link" onClose={onClose} onApply={apply} apply="Apply">
      <Field id="pp-link-text" label="Text"><input id="pp-link-text" className={input} value={text} onChange={(e) => setText(e.target.value)} disabled={from !== to} /></Field>
      <Field id="pp-link-href" label="Web address"><input id="pp-link-href" className={input} value={href} onChange={(e) => setHref(e.target.value)} /></Field>
      {editor.isActive("link") && (
        <button type="button" className="text-left text-xs text-muted underline" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onClose(); }}>Remove link</button>
      )}
    </PopShell>
  );
}

function ImagePop({ editor, onClose, onLibrary }: { editor: Editor; onClose: () => void; onLibrary: () => void }) {
  const editing = editor.isActive("image");
  const current = editor.getAttributes("image") as { src?: string; alt?: string; widthPct?: number; href?: string | null };
  const [src, setSrc] = useState(current.src ?? "");
  const [alt, setAlt] = useState(current.alt ?? "");
  const [width, setWidth] = useState(current.widthPct ?? 100);
  const [href, setHref] = useState(current.href ?? "");
  const apply = () => {
    const attrs = { src: src.trim(), alt, widthPct: Math.min(100, Math.max(10, width)), href: href.trim() || null };
    if (!attrs.src) return onClose();
    if (editing) editor.chain().focus().updateAttributes("image", attrs).run();
    else editor.chain().focus().insertContent({ type: "image", attrs }).run();
    onClose();
  };
  return (
    <PopShell title="Image" onClose={onClose} onApply={apply} apply={editing ? "Update" : "Insert"}>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <button type="button" className="w-fit rounded-full border border-border px-3 py-1.5 text-xs" onClick={onLibrary}>Choose or upload from the media library</button>
      </div>
      <Field id="pp-img-src" label="Or a web address"><input id="pp-img-src" className={input} value={src} placeholder="https://" onChange={(e) => setSrc(e.target.value)} /></Field>
      <Field id="pp-img-alt" label="Description (shown if images are blocked)"><input id="pp-img-alt" className={input} value={alt} onChange={(e) => setAlt(e.target.value)} /></Field>
      <Field id="pp-img-width" label="Width (%)"><input id="pp-img-width" type="number" min={10} max={100} step={5} className={input} value={width} onChange={(e) => setWidth(Number(e.target.value) || 100)} /></Field>
      <Field id="pp-img-href" label="Link the image to (optional)"><input id="pp-img-href" className={input} value={href} placeholder="https://" onChange={(e) => setHref(e.target.value)} /></Field>
    </PopShell>
  );
}

function ButtonPop({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const editing = editor.isActive("emailButton");
  const current = editor.getAttributes("emailButton") as { label?: string; href?: string; color?: string; align?: string };
  const [label, setLabel] = useState(current.label ?? "Open your library");
  const [href, setHref] = useState(current.href ?? "{{access_link}}");
  const [color, setColor] = useState(current.color ?? "#c8653d");
  const [align, setAlign] = useState(current.align ?? "left");
  const apply = () => {
    const attrs = { label: label.trim() || "Open", href: href.trim() || "{{access_link}}", color, align };
    if (editing) editor.chain().focus().updateAttributes("emailButton", attrs).run();
    else editor.chain().focus().insertContent({ type: "emailButton", attrs }).run();
    onClose();
  };
  return (
    <PopShell title="Button" onClose={onClose} onApply={apply} apply={editing ? "Update" : "Insert"}>
      <Field id="pp-btn-label" label="Label"><input id="pp-btn-label" className={input} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      <Field id="pp-btn-href" label="Web address"><input id="pp-btn-href" className={input} value={href} onChange={(e) => setHref(e.target.value)} /></Field>
      <Field id="pp-btn-color" label="Colour"><input id="pp-btn-color" type="color" className="h-9 w-12 rounded-lg border border-border" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
      <Field id="pp-btn-align" label="Position"><select id="pp-btn-align" className={input} value={align} onChange={(e) => setAlign(e.target.value)}><option value="left">Left</option><option value="center">Centre</option></select></Field>
    </PopShell>
  );
}
