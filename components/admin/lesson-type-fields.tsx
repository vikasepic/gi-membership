"use client";

import { useState } from "react";
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
  const [audioUrl, setAudioUrl] = useState(item.audioUrl ?? "");

  const hasAudio = item.attachments.some((a) => a.mime.startsWith("audio/"));
  const hasPdf = item.attachments.some((a) => a.mime === "application/pdf");

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
        <Section title="Audio" hint="A hosted link, or a file you upload below.">
          <Field label="Audio URL" hint="Direct link to an MP3 — leave empty to use an uploaded file.">
            <input
              name="audioUrl"
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="https://…/lesson.mp3"
              className={input}
            />
          </Field>
          {audioUrl ? (
            // Worth saying plainly. An upload is served through an
            // ownership-checked signed URL that expires in a minute; a pasted
            // link is playable by anyone who has it. Both are legitimate — they
            // are just not equivalent, and the difference is invisible once
            // saved.
            <p className="-mt-1 text-sm text-muted">
              This link is used instead of any uploaded file.{" "}
              <strong className="text-fg">Anyone with the address can play it</strong> — an upload is
              the option that checks ownership.
            </p>
          ) : (
            <p className="-mt-1 text-sm text-muted">
              {hasAudio
                ? "Audio file attached — served only to people who own this."
                : "No audio yet — paste a link above or upload a file under Files."}
            </p>
          )}
        </Section>
      )}

      {/* Kept on save when the type is switched away, like the video URL. */}
      {type !== "audio" && <input type="hidden" name="audioUrl" value={audioUrl} />}

      {type === "pdf" && (
        <Section title="PDF" hint="Upload the PDF below under Files — students read it inline.">
          <p className="text-sm text-muted">
            {hasPdf ? "PDF attached." : "No PDF yet — add one under Files."}
          </p>
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
