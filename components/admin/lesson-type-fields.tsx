"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  uploadItemFileAction,
  removeAttachmentAction,
} from "@/app/admin/courses/[id]/items/actions";
import type { Attachment } from "@/lib/curriculum";
import { RichText } from "@/components/editor/rich-text";
import { inputClass as input, Field, Section } from "@/components/admin/form-controls";
import type { CourseItem, ItemType } from "@/lib/curriculum";

// The part of the lesson editor that the Type dropdown controls.
//
// Split out and made client-side because the panels used to branch on the
// SAVED type, so the field labelled "decides the fields below" decided nothing
// until you saved and the page came back — you would pick Audio and still be
// looking at a Video URL box. The type has to be state for the promise on that
// label to be true.

const TYPE_LABEL: Record<ItemType, string> = {
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  text: "Text",
};

// YouTube and Vimeo expose playback position cross-origin; other providers do
// not, so their lessons complete on the dwell timer instead. Say which applies
// rather than letting it look broken.
function trackingNote(url: string): string {
  if (!url) return "";
  return /youtube\.com|youtu\.be|vimeo\.com/i.test(url)
    ? "Auto-completes at 50% watched."
    : "This provider can't report progress — completes on time-on-page instead.";
}

export function LessonTypeFields({ item, kindLabel }: { item: CourseItem; kindLabel: string }) {
  const [type, setType] = useState<ItemType>(item.itemType);
  const [videoUrl, setVideoUrl] = useState(item.videoEmbedUrl ?? "");
  const [audioUrls, setAudioUrls] = useState<string[]>(
    item.audioUrls.length ? item.audioUrls : [""],
  );

  const audioFiles = item.attachments.filter((a) => a.mime.startsWith("audio/"));
  const pdfFiles = item.attachments.filter((a) => a.mime === "application/pdf");

  return (
    <>
      <Section title={`${kindLabel} details`}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field label="Title" required>
              <input name="title" defaultValue={item.title} required className={input} />
            </Field>
          </div>
          <Field label="Type" hint="decides the fields below">
            <select
              name="itemType"
              value={type}
              onChange={(e) => setType(e.target.value as ItemType)}
              className={input}
            >
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Subtitle" hint="optional">
          <input name="subtitle" defaultValue={item.subtitle ?? ""} className={input} />
        </Field>
      </Section>

      {/* Only the fields this type actually needs. A PDF lesson has no video
          URL to fill in; a video lesson doesn't pretend to be a worksheet. */}
      {type === "video" && (
        <Section title="Video" hint="Vimeo, YouTube or Loom — paste the embed URL.">
          <Field label="Video URL">
            <input
              name="videoEmbedUrl"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className={input}
            />
          </Field>
          {videoUrl && <p className="-mt-2 text-xs text-muted">{trackingNote(videoUrl)}</p>}
        </Section>
      )}

      {/* A URL typed and then switched away from would otherwise be dropped on
          save, because an unrendered input posts nothing. Switching type is not
          the same as clearing the field. */}
      {type !== "video" && <input type="hidden" name="videoEmbedUrl" value={videoUrl} />}

      {type === "audio" && (
        <Section title="Audio" hint="Links and files together — a lesson can carry several of either.">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Links</span>
            {audioUrls.map((u, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  name="audioUrls"
                  value={u}
                  onChange={(e) =>
                    setAudioUrls(audioUrls.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  placeholder="https://…/lesson.mp3"
                  aria-label={`Audio link ${i + 1}`}
                  className={input}
                />
                {audioUrls.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove audio link ${i + 1}`}
                    onClick={() => setAudioUrls(audioUrls.filter((_, j) => j !== i))}
                    className="rounded px-2 text-sm text-muted hover:text-primary"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAudioUrls([...audioUrls, ""])}
              className="w-fit rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted transition-colors hover:border-fg hover:text-fg"
            >
              + Add another link
            </button>
          </div>

          <MediaFiles
            item={item}
            files={audioFiles}
            accept="audio/*"
            addLabel="Upload an audio file"
            emptyLabel="No audio files yet."
          />

          {audioUrls.some(Boolean) && (
            // Worth saying plainly. An upload is served through an
            // ownership-checked signed URL that expires in a minute; a pasted
            // link is playable by anyone who has it. Both are legitimate — they
            // are just not equivalent, and the difference is invisible once
            // saved.
            <p className="text-sm text-muted">
              <strong className="text-fg">Anyone with a link can play it</strong> — uploads are the
              option that checks ownership. Both play, in the order shown.
            </p>
          )}
        </Section>
      )}

      {/* Kept on save when the type is switched away, like the video URL. */}
      {type !== "audio" &&
        audioUrls.filter(Boolean).map((u, i) => (
          <input key={i} type="hidden" name="audioUrls" value={u} />
        ))}

      {type === "pdf" && (
        <Section title="PDF" hint="Read inline. More than one is fine — they stack in order.">
          <MediaFiles
            item={item}
            files={pdfFiles}
            accept="application/pdf"
            addLabel="Upload a PDF"
            emptyLabel="No PDF yet."
          />
        </Section>
      )}

      <Section
        title="Body"
        hint={type === "text" ? "The written lesson." : "Notes shown under the media — optional."}
      >
        <RichText name="bodyHtml" value={item.bodyHtml ?? ""} />
      </Section>
    </>
  );
}

/**
 * Files for this lesson's media, in the panel they belong to.
 *
 * The uploader used to live in a separate Files section far down the page, so
 * choosing between "paste a link" and "upload a file" meant scrolling between
 * two parts of the form to see both options. They are one decision.
 *
 * Upload and remove are called straight from handlers rather than through
 * forms: this sits inside the save form, and a form cannot contain another.
 */
function MediaFiles({
  item,
  files,
  accept,
  addLabel,
  emptyLabel,
}: {
  item: CourseItem;
  files: Attachment[];
  accept: string;
  addLabel: string;
  emptyLabel: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Files</span>
      {files.length === 0 ? (
        <p className="text-sm text-muted">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {files.map((f) => (
            <li
              key={f.path}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">{f.name}</span>
              <button
                type="button"
                disabled={busy}
                aria-label={`Remove ${f.name}`}
                onClick={() =>
                  run(async () => {
                    const fd = new FormData();
                    fd.append("courseId", item.courseId);
                    fd.append("itemId", item.id);
                    fd.append("path", f.path);
                    await removeAttachmentAction(fd);
                  })
                }
                className="shrink-0 text-muted hover:text-primary disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="w-fit cursor-pointer rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted transition-colors hover:border-fg hover:text-fg">
        {busy ? "Working…" : `+ ${addLabel}`}
        <input
          type="file"
          accept={accept}
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            run(async () => {
              const fd = new FormData();
              fd.append("courseId", item.courseId);
              fd.append("itemId", item.id);
              fd.append("file", file);
              return uploadItemFileAction(fd);
            });
          }}
        />
      </label>
      {error && <span className="text-sm text-primary">{error}</span>}
      <span className="text-xs text-muted">
        Uploads are private — only people who own this course can open them.
      </span>
    </div>
  );
}
