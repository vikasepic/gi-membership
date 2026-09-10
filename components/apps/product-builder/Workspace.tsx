"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { streamApi } from "@/lib/builtin-apps/client";
import {
  DOCUMENT_TITLES,
  SKIPPABLE_STAGES,
  STAGE_LABELS,
} from "@/lib/builtin-apps/product-builder/stages";
import type {
  DocumentKind,
  DocumentRecord,
  MessageRecord,
  SessionRecord,
} from "@/lib/builtin-apps/product-builder/types";
import Chat from "./Chat";
import ShapePanel from "./ShapePanel";
import DocumentReader, { GuideMarkdown } from "./DocumentReader";

const ERROR_MESSAGES: Record<string, string> = {
  no_access: "Your access to this app is not active. If you just bought it, give it a moment and reload.",
  unauthorized: "You are signed out. Sign in again to continue.",
  busy_try_again: "The coach is busy right now. Try again in a minute.",
  generation_failed: "That did not go through. Nothing was saved. Try again.",
  stream_interrupted: "The connection dropped. Send that again.",
  network_error: "Could not reach the server. Check your connection and try again.",
  ai_auth_failed: "The server's model key was rejected. Tell support.",
  ai_request_rejected: "The model rejected the request. Tell support.",
  ai_unreachable: "Could not reach the model. Try again in a moment.",
  ai_declined: "The model declined to continue with this material.",
  session_closed: "This session was closed by the coach.",
  cannot_skip: "This step cannot be skipped.",
  not_ready: "Reach the gate with the coach before building.",
  no_guide_yet: "Build the guide first, then add to it.",
  save_failed: "Generated, but could not be saved. Try again.",
  server_misconfigured: "The server is missing its model key. Tell support.",
  internal_error: "Something went wrong on our side. Try again.",
};

type Streaming =
  | { kind: "coach"; text: string }
  | { kind: "build"; docKind: DocumentKind; text: string };

const SHAPE_VIEW = "shape";
const API = "/api/product-builder";

/**
 * The coaching workspace: chat on the left, the product taking shape (or a
 * built document) on the right. Everything it starts with was loaded by the
 * page on the server; from there it talks only to the app's own routes.
 */
export function Workspace({
  initialSession,
  initialMessages,
  initialDocuments,
  appRoute,
}: {
  initialSession: SessionRecord;
  initialMessages: MessageRecord[];
  initialDocuments: DocumentRecord[];
  appRoute: string;
}) {
  const [session, setSession] = useState<SessionRecord>(initialSession);
  const [messages, setMessages] = useState<MessageRecord[]>(initialMessages);
  const [documents, setDocuments] = useState<DocumentRecord[]>(initialDocuments);
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<string>(() =>
    initialDocuments.length ? initialDocuments[initialDocuments.length - 1].id : SHAPE_VIEW,
  );
  const [mobileTab, setMobileTab] = useState<"chat" | "product">("chat");
  const [confirmSkip, setConfirmSkip] = useState(false);
  const kickoffRef = useRef(false);
  const bufferRef = useRef("");
  const flushRef = useRef<number | null>(null);
  // The coach stream stays open a few seconds after the reply (shape
  // extraction). A newer turn may start meanwhile; only the newest run may
  // clear the streaming state.
  const runSeq = useRef(0);

  // Batch streamed text into React state a few times a second.
  const queueText = useCallback((text: string) => {
    bufferRef.current += text;
    if (flushRef.current !== null) return;
    flushRef.current = window.setTimeout(() => {
      flushRef.current = null;
      const chunk = bufferRef.current;
      bufferRef.current = "";
      setStreaming((prev) => (prev ? { ...prev, text: prev.text + chunk } : prev));
    }, 120);
  }, []);

  const flushNow = useCallback(() => {
    if (flushRef.current !== null) {
      clearTimeout(flushRef.current);
      flushRef.current = null;
    }
    const chunk = bufferRef.current;
    bufferRef.current = "";
    if (chunk) {
      setStreaming((prev) => (prev ? { ...prev, text: prev.text + chunk } : prev));
    }
  }, []);

  /** One coach turn: a typed reply, a skip, or (null) the coach's next reply. */
  const runCoach = useCallback(
    async (text: string | null, skip = false) => {
      const runId = ++runSeq.current;
      setError(null);
      setStreaming({ kind: "coach", text: "" });
      let tempId: string | null = null;
      if (text || skip) {
        tempId = `temp-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: tempId!,
            role: "user",
            kind: skip ? "skip" : "chat",
            content: text ?? "",
            stage: null,
            created_at: new Date().toISOString(),
          },
        ]);
      }

      let failed: string | null = null;
      const { errorCode } = await streamApi(
        `${API}/coach`,
        { session_id: session.id, ...(skip ? { skip: true } : text ? { message: text } : {}) },
        (ev) => {
          switch (ev.type) {
            case "text":
              queueText(ev.text);
              break;
            case "stage":
              setSession((s) => ({ ...s, stage: ev.stage }));
              break;
            case "shape":
              setSession((s) => ({ ...s, shape: ev.shape }));
              break;
            case "message":
              if (ev.message.role === "user") {
                setMessages((prev) => prev.map((m) => (m.id === tempId ? ev.message : m)));
              } else {
                flushNow();
                setMessages((prev) => [...prev, ev.message]);
                setStreaming(null);
              }
              break;
            case "error":
              failed = ev.code;
              break;
            case "done":
              break;
          }
        },
      );
      if (runSeq.current === runId) {
        flushNow();
        setStreaming(null);
      }
      const code = errorCode ?? failed;
      if (code) {
        setError(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.internal_error);
        if (tempId) {
          // Give the text back so it can be resent.
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          if (text) setDraft(text);
        }
      }
    },
    [session.id, queueText, flushNow],
  );

  // The coach owes a reply when the transcript is empty (its opening) or
  // ends with the member (the intake form, or a turn whose reply never
  // arrived). Deferred a tick so the guarded kickoff survives React's
  // double-invoked effects in development.
  const lastRole = messages.length ? messages[messages.length - 1].role : null;
  const owed =
    session.stage !== "STOP" && !streaming && (messages.length === 0 || lastRole === "user");
  useEffect(() => {
    if (!owed) return;
    const t = setTimeout(() => {
      if (kickoffRef.current) return;
      kickoffRef.current = true;
      runCoach(null);
    }, 0);
    return () => clearTimeout(t);
  }, [owed, runCoach]);

  const send = (text: string) => {
    setDraft("");
    runCoach(text);
  };

  const skipStep = () => {
    setConfirmSkip(false);
    runCoach(null, true);
  };

  const build = async (kind: DocumentKind) => {
    setError(null);
    setStreaming({ kind: "build", docKind: kind, text: "" });
    setMobileTab("product");
    let failed: string | null = null;
    const { errorCode } = await streamApi(`${API}/build`, { session_id: session.id, kind }, (ev) => {
      switch (ev.type) {
        case "text":
          queueText(ev.text);
          break;
        case "document":
          flushNow();
          setDocuments((prev) => [...prev, ev.document]);
          setView(ev.document.id);
          setStreaming(null);
          break;
        case "error":
          failed = ev.code;
          break;
      }
    });
    flushNow();
    setStreaming(null);
    const code = errorCode ?? failed;
    if (code) setError(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.internal_error);
  };

  const built = documents.some((d) => d.kind === "guide");
  const atGate = session.stage === "GATE" || session.stage === "READY";
  const closed = session.stage === "STOP";
  const coachBusy = streaming?.kind === "coach";
  const buildBusy = streaming?.kind === "build";
  const canSkip = SKIPPABLE_STAGES.includes(session.stage) && !streaming && !closed;
  const activeDoc = documents.find((d) => d.id === view) ?? null;

  const openSkip = () => {
    if (!canSkip) return;
    setConfirmSkip(true);
  };

  const productPane = (
    <div className="flex h-full min-h-0 flex-col">
      {/* View switch: the shape, plus one chip per built document */}
      {!buildBusy && documents.length > 0 && (
        <div className="scroll-thin flex shrink-0 gap-1.5 overflow-x-auto pb-3">
          <ViewChip active={view === SHAPE_VIEW} onClick={() => setView(SHAPE_VIEW)}>
            The shape
          </ViewChip>
          {documents.map((d) => (
            <ViewChip key={d.id} active={view === d.id} onClick={() => setView(d.id)}>
              {d.title}
            </ViewChip>
          ))}
        </div>
      )}

      {buildBusy ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-3 pb-3">
            <span className="spinner h-4 w-4 rounded-full border-2 border-navy/20 border-t-primary" />
            <p className="text-sm text-fg/70">
              Writing {DOCUMENT_TITLES[streaming.docKind].toLowerCase()}. A full guide takes
              several minutes. Keep this tab open.
            </p>
          </div>
          <article className="scroll-thin min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-surface px-6 py-8 shadow-sm sm:px-10 sm:py-12">
            {streaming.text ? (
              <GuideMarkdown markdown={streaming.text} />
            ) : (
              <p className="text-muted">Thinking through the whole shape before writing.</p>
            )}
          </article>
        </div>
      ) : activeDoc ? (
        <DocumentReader document={activeDoc} fallbackName={session.title} />
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <ShapePanel shape={session.shape} stage={session.stage} canSkip={canSkip} onSkip={openSkip} />
        </div>
      )}

      {/* Build controls */}
      {!buildBusy && atGate && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          {!built ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-navy">
                  {session.stage === "READY" ? "The shape is locked." : "The shape is on the screen."}
                </p>
                <p className="text-sm text-muted">
                  {session.stage === "READY"
                    ? "Build the full guide, or keep talking to change something first."
                    : "You can build now, or tell the coach what to change first."}
                </p>
              </div>
              <button
                onClick={() => build("guide")}
                disabled={coachBusy}
                className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                Build the full guide
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-navy">Your guide is built.</p>
                <p className="text-sm text-muted">
                  Pull the worksheets into their own printable pack, or rebuild the guide after
                  changing the shape with the coach.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => build("pack")}
                  disabled={coachBusy}
                  className="rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:opacity-50"
                >
                  Make the worksheet pack
                </button>
                <button
                  onClick={() => build("guide")}
                  disabled={coachBusy}
                  className="rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-navy hover:text-white disabled:opacity-50"
                >
                  Rebuild the guide
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <main className="print:hidden mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 pb-4 pt-3 sm:px-5">
        {/* Where we are: the session, and a chip when it is a quick one. */}
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted">
          <Link href={appRoute} className="shrink-0 hover:text-fg">
            Sessions
          </Link>
          <span aria-hidden className="text-border">
            /
          </span>
          <span className="truncate text-fg">{session.title}</span>
          {session.quick && (
            <span className="shrink-0 rounded-full bg-navy/10 px-2 py-0.5 text-[11px] font-medium text-navy">
              Quick
            </span>
          )}
        </div>

        {closed && (
          <div className="mt-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
            This session is closed. Start a new session from your sessions page when you have a
            case to build on.
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {/* Mobile: tab switch plus the one line the panel would show */}
        <div className="mt-3 lg:hidden">
          <div className="flex gap-1 rounded-full bg-surface p-1">
            {(["chat", "product"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setMobileTab(t)}
                className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
                  mobileTab === t ? "bg-navy text-white" : "text-muted"
                }`}
              >
                {t === "chat" ? "Coach" : "Product"}
              </button>
            ))}
          </div>
          {!closed && (
            <p className="mt-2 px-1 text-xs text-muted">
              Now: {STAGE_LABELS[session.stage].toLowerCase()}
            </p>
          )}
        </div>

        <div className="mt-3 grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* A bounded height only at lg, where the two panes stand side by
              side and each scrolls inside itself. On a phone that height was
              taller than the screen — 855px of page on an 812px viewport — so
              the composer sat below the fold. Now the page flows and the
              composer sticks to the bottom (see Chat). */}
          <section
            className={`min-h-0 flex-col lg:h-[calc(100dvh-150px)] lg:min-h-[420px] ${
              mobileTab === "chat" ? "flex" : "hidden lg:flex"
            }`}
          >
            <Chat
              messages={messages}
              streamingText={coachBusy ? streaming.text : null}
              disabled={!!streaming || closed}
              disabledReason={
                closed
                  ? "This session is closed."
                  : buildBusy
                    ? "Building. The coach is back when it is done."
                    : undefined
              }
              draft={draft}
              onDraftChange={setDraft}
              onSend={send}
              canSkip={canSkip}
              onSkip={openSkip}
            />
          </section>
          <section
            className={`min-h-0 lg:h-[calc(100dvh-150px)] lg:min-h-[420px] ${
              mobileTab === "product" ? "block" : "hidden lg:block"
            }`}
          >
            {productPane}
          </section>
        </div>
      </main>

      {confirmSkip && (
        <SkipDialog
          stageLabel={STAGE_LABELS[session.stage]}
          onCancel={() => setConfirmSkip(false)}
          onConfirm={skipStep}
        />
      )}

      {/* Print copy: only the active document, unclipped by the app layout. */}
      {activeDoc && typeof document !== "undefined"
        ? createPortal(
            <div className="hidden print:block">
              <GuideMarkdown markdown={activeDoc.content} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function ViewChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-navy text-white" : "bg-surface text-fg/70 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function SkipDialog({
  stageLabel,
  onCancel,
  onConfirm,
}: {
  stageLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-navy/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="skip-title"
      onClick={onCancel}
    >
      <div
        className="modal-card w-full max-w-md rounded-3xl bg-surface p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="skip-title" className="font-display text-2xl font-semibold text-navy">
          Skip this step?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-fg/75">
          You are at <span className="font-medium text-fg">{stageLabel.toLowerCase()}</span>. The
          coach will fill in what is missing with its best guess from what you have said so far,
          then move on.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-fg/75">
          This is the one place the &ldquo;nothing invented&rdquo; rule bends. Every guess is
          marked, and the finished guide flags each one for you to confirm or replace. The more
          you skip, the more you will have to fix at the end.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-surface-2"
          >
            Keep going
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Fill it in and move on
          </button>
        </div>
      </div>
    </div>
  );
}
