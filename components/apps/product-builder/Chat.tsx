"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MessageRecord } from "@/lib/builtin-apps/product-builder/types";

export interface ChatProps {
  messages: MessageRecord[];
  streamingText: string | null; // the coach's reply in progress (null = idle)
  disabled: boolean;
  disabledReason?: string;
  draft: string;
  onDraftChange: (v: string) => void;
  onSend: (text: string) => void;
  canSkip: boolean;
  onSkip: () => void;
}

const THINKING_LINES = [
  "Listening",
  "Reading that back",
  "Finding the step you skipped",
  "Working out the next question",
];

export default function Chat({
  messages,
  streamingText,
  disabled,
  disabledReason,
  draft,
  onDraftChange,
  onSend,
  canSkip,
  onSkip,
}: ChatProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [thinkingIdx, setThinkingIdx] = useState(0);

  // Keep the newest message in view. scrollIntoView rather than scrolling the
  // list itself: at lg the list is the scroll container, on a phone the page
  // is, and this finds whichever one it is.
  useEffect(() => {
    const el = listRef.current?.lastElementChild;
    if (!el) return;
    el.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, streamingText]);

  // Rotate the waiting line while the coach has not started typing.
  useEffect(() => {
    if (streamingText !== "") return;
    const id = setInterval(() => setThinkingIdx((i) => i + 1), 2600);
    return () => clearInterval(id);
  }, [streamingText]);
  const waitingLine = THINKING_LINES[thinkingIdx % THINKING_LINES.length];

  // Grow the textarea with its content.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [draft]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
  };

  // Enter sends where there is a keyboard with a Shift key. On a phone Enter
  // is the only way to start a new line and the Send button is right there,
  // so it stays a newline — the convention every chat app on a phone follows.
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && hasFinePointer()) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={listRef}
        className="scroll-thin flex-1 space-y-4 overflow-y-auto px-1 py-4"
      >
        {messages.map((m) =>
          m.role === "assistant" ? (
            <CoachBubble key={m.id} text={m.content} />
          ) : m.kind === "skip" ? (
            <SkipNote key={m.id} />
          ) : (
            <UserBubble key={m.id} text={m.content} />
          ),
        )}
        {streamingText !== null && (
          <CoachBubble
            text={streamingText}
            waitingLine={streamingText === "" ? waitingLine : undefined}
            key={`streaming-${streamingText === "" ? thinkingIdx : "text"}`}
          />
        )}
      </div>

      {/* Sticky on a phone so the reply box is always on screen and the
          transcript scrolls under it; static at lg where the pane scrolls
          inside itself. The wrapper carries the page's own background so
          nothing shows through the gap beneath the rounded form. */}
      <div className="sticky bottom-0 z-10 bg-bg pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:static lg:pb-0">
      <form
        onSubmit={submit}
        className="rounded-2xl border border-border bg-surface p-2 shadow-sm transition-colors focus-within:border-primary/60"
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKey}
          disabled={disabled}
          rows={1}
          maxLength={6000}
          aria-label="Your reply"
          placeholder={disabled ? (disabledReason ?? "One moment") : "Answer in your own words."}
          className="no-focus-ring block w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed outline-none placeholder:text-muted disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-3 px-2 pb-1">
          <div className="flex items-center gap-3">
            {canSkip && (
              <button
                type="button"
                onClick={onSkip}
                disabled={disabled}
                className="text-xs font-medium text-muted underline underline-offset-4 transition-colors hover:text-primary disabled:opacity-40"
              >
                Skip this step
              </button>
            )}
            <span className="text-[11px] text-muted">
              {draft.length > 5000
                ? `${6000 - draft.length} characters left`
                : // The shortcut only exists where Enter sends.
                  <span className="hidden sm:inline">Enter sends · Shift+Enter for a new line</span>}
            </span>
          </div>
          <button
            type="submit"
            disabled={disabled || !draft.trim()}
            className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}

/** A mouse or trackpad — i.e. a keyboard with a Shift key beside it. */
function hasFinePointer(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches;
}

function CoachBubble({
  text,
  waitingLine,
}: {
  text: string;
  waitingLine?: string;
}) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy font-display text-sm italic text-white"
      >
        c
      </span>
      <div className="prose-coach max-w-[85%] rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed text-fg shadow-sm">
        {waitingLine ? (
          <p className="msg-fade text-muted">{waitingLine}</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-navy px-4 py-3 text-[15px] leading-relaxed text-white">
        {text}
      </div>
    </div>
  );
}

function SkipNote() {
  return (
    <div className="flex justify-center">
      <span className="rounded-full bg-plum/10 px-3 py-1 text-xs font-medium text-plum">
        You skipped this step. The coach filled it in with guesses.
      </span>
    </div>
  );
}
