import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { COACH_MODEL, anthropic, anthropicConfigured, anthropicErrorCode } from "@/lib/anthropic";
import { sseResponse, type Emit } from "./sse";
import { stripDashes } from "./text";
import { extractShape } from "./shape";
import { titleFromText } from "./format";
import {
  deleteMessage,
  loadMessages,
  loadOwnedSession,
  saveMessage,
  updateSession,
} from "./sessions";
import { COACH_SYSTEM_PROMPT, QUICK_MODE_PROMPT } from "./prompts";
import {
  MAX_MESSAGE_CHARS,
  SKIPPABLE_STAGES,
  SKIP_MESSAGE,
  STAGES,
  STAGE_BUDGETS,
  STAGE_BUDGETS_QUICK,
  type Stage,
} from "./stages";
import type { MessageRecord } from "./types";

// One coaching turn: the member's reply (or a skip, or nothing when the coach
// owes the next line) goes to the model, the reply streams back, and the
// transcript, stage and shape are written as they become known.

// The API requires the first message to come from the user. The coach's
// opening line is produced in response to this synthetic kickoff, which is
// never stored or shown.
export const KICKOFF =
  '(The session has just started. Give me your opening, exactly as described under "To start".)';

const STAGE_MARKER = /^\s*<<\s*stage\s*:\s*([A-Z]+)\s*>>[ \t]*\r?\n?/;

/**
 * Pulls the stage marker off the front of a streamed reply.
 *
 * The first line of every coach reply is `<<stage:NAME>>`. It arrives in
 * pieces, so text is held back until the marker is either read or ruled out,
 * and only then shown. Pure, so the one piece of parsing that decides which
 * step the app is in can be tested without a model.
 */
export class MarkerResolver {
  stage: Stage | null = null;
  /** Whether a valid marker was read. Without one the shape extraction decides the step. */
  found = false;
  private pending = "";
  private resolved = false;

  /** Feed a chunk; returns the text that may be shown now. */
  push(chunk: string): string {
    if (this.resolved) return chunk;
    this.pending += chunk;
    return this.resolve(false);
  }

  /** The stream ended; whatever is still held is text. */
  finish(): string {
    return this.resolved ? "" : this.resolve(true);
  }

  private resolve(force: boolean): string {
    const match = this.pending.match(STAGE_MARKER);
    if (match) {
      const candidate = match[1] as Stage;
      if ((STAGES as readonly string[]).includes(candidate)) {
        this.stage = candidate;
        this.found = true;
      }
      this.resolved = true;
      const rest = this.pending.slice(match[0].length);
      this.pending = "";
      return rest;
    }
    // Still possibly inside a marker: wait for a newline or enough text to
    // know there is none.
    if (force || this.pending.includes("\n") || this.pending.length > 40) {
      this.resolved = true;
      const rest = this.pending;
      this.pending = "";
      return rest;
    }
    return "";
  }
}

/**
 * The note appended to the model's copy of the member's last turn once a
 * step's budget of exchanges is spent. The member never sees it; it is what
 * keeps a thorough coach from drilling past the point the app promised.
 */
export function paceNote(history: MessageRecord[], stage: Stage, quick: boolean): string {
  const budget = (quick ? STAGE_BUDGETS_QUICK : STAGE_BUDGETS)[stage];
  if (!budget) return "";
  const exchanges = history.filter(
    (m) => m.role === "user" && m.kind === "chat" && m.stage === stage,
  ).length;
  if (exchanges < budget) return "";
  return `\n\n(App note: this is exchange ${exchanges} in ${stage}. The budget for this step is ${budget}. Take what you have, lock it, and move to the next step in this reply.)`;
}

/** The stored transcript as the API conversation, with the last user turn replaced by its annotated copy. */
export function apiMessagesFrom(
  history: MessageRecord[],
  lastContent: string,
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  // If the stored history starts with the coach's opening, re-insert the
  // synthetic kickoff in front of it.
  if (history.length === 0 || history[0].role === "assistant") {
    out.push({ role: "user", content: KICKOFF });
  }
  history.forEach((m, i) => {
    const isLast = i === history.length - 1;
    out.push({
      role: m.role,
      content: isLast && m.role === "user" ? lastContent : m.content,
    });
  });
  return out;
}

export type CoachInput = {
  userId: string;
  sessionId: string;
  /** What the member typed. Empty with a skip, or when the coach owes a reply. */
  message: string;
  skip: boolean;
};

const json = (error: string, status: number) => Response.json({ error }, { status });

export async function coachTurn(input: CoachInput): Promise<Response> {
  const { userId, sessionId, skip } = input;
  const typed = input.message.trim();

  if (!sessionId) return json("session_id is required", 400);
  if (typed.length > MAX_MESSAGE_CHARS) return json("message_too_long", 400);
  if (!anthropicConfigured()) return json("server_misconfigured", 500);

  const session = await loadOwnedSession(sessionId, userId);
  if (!session) return json("not_found", 404);
  if (session.stage === "STOP") return json("session_closed", 409);
  if (skip && !SKIPPABLE_STAGES.includes(session.stage)) return json("cannot_skip", 409);

  const userText = skip ? SKIP_MESSAGE : typed;
  const history = await loadMessages(sessionId);
  const lastIsUser = history.length > 0 && history[history.length - 1].role === "user";
  // No message and the transcript ends with the member: answer that turn.
  // That is the intake form's message on a new session, or a turn whose
  // reply never arrived.
  const resume = !userText && lastIsUser;
  const isKickoff = history.length === 0 && !userText;
  if (!isKickoff && !resume && !userText) return json("message is required", 400);
  if (userText && lastIsUser) {
    // A previous turn died before the coach answered; drop that user turn so
    // the transcript stays alternating.
    await deleteMessage(history[history.length - 1].id);
    history.pop();
  }

  let userRecord: MessageRecord | null = null;
  if (userText) {
    userRecord = await saveMessage({
      sessionId,
      userId,
      role: "user",
      kind: skip ? "skip" : "chat",
      content: userText,
      stage: session.stage,
    });
    if (!userRecord) return json("internal_error", 500);
    history.push(userRecord);
    if (!skip && history.filter((m) => m.role === "user" && m.kind === "chat").length === 1) {
      await updateSession(sessionId, { title: titleFromText(userText) });
    }
  }

  const lastMessage = history[history.length - 1];
  let lastContent = lastMessage?.role === "user" ? lastMessage.content : "";
  if (!skip && userText) lastContent += paceNote(history, session.stage, session.quick);
  const apiMessages = apiMessagesFrom(history, lastContent);

  return sseResponse(async (emit: Emit) => {
    if (userRecord) emit({ type: "message", message: userRecord });

    let stage: Stage = session.stage;
    const marker = new MarkerResolver();
    let visible = "";

    const pushText = (raw: string) => {
      const text = stripDashes(raw);
      if (!text) return;
      visible += text;
      emit({ type: "text", text });
    };
    // Announced once, the moment the marker is read, even when the step has
    // not changed: the panel's "you are here" is driven by this event.
    let stageAnnounced = false;
    const announceStage = () => {
      if (stageAnnounced || !marker.stage) return;
      stageAnnounced = true;
      stage = marker.stage;
      emit({ type: "stage", stage });
    };

    let stopReason: string | null = null;
    try {
      const stream = anthropic().messages.stream({
        model: COACH_MODEL,
        max_tokens: 8000,
        output_config: { effort: "medium" },
        system: [
          {
            type: "text",
            text: session.quick ? `${COACH_SYSTEM_PROMPT}\n\n${QUICK_MODE_PROMPT}` : COACH_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: apiMessages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const shown = marker.push(event.delta.text);
          announceStage();
          pushText(shown);
        }
      }
      pushText(marker.finish());
      announceStage();
      const final = await stream.finalMessage();
      stopReason = final.stop_reason;
    } catch (err) {
      console.error("[product-builder] coach stream failed", err);
      emit({ type: "error", code: anthropicErrorCode(err) });
      return;
    }

    if (stopReason === "refusal") {
      emit({ type: "error", code: "ai_declined" });
      return;
    }

    const content = visible.trim();
    if (!content) {
      emit({ type: "error", code: "generation_failed" });
      return;
    }

    const assistantRecord = await saveMessage({
      sessionId,
      userId,
      role: "assistant",
      kind: "chat",
      content,
      stage,
    });
    if (!assistantRecord) {
      emit({ type: "error", code: "save_failed" });
      return;
    }
    history.push(assistantRecord);

    // Write the stage, then hand the reply over so the member can keep typing
    // while the shape is extracted below.
    await updateSession(sessionId, { stage });
    emit({ type: "message", message: assistantRecord });

    // Extract the shape when a step locks, at the gate, after a skip, or when
    // the coach forgot its marker. Not on every turn: it is a model call.
    const stageMoved = stage !== session.stage;
    const extracted =
      stageMoved || skip || !marker.found || stage === "GATE" || stage === "READY"
        ? await extractShape(history)
        : null;
    if (extracted) {
      const { shape, currentStage } = extracted;
      if (!marker.found && currentStage !== stage) {
        // Only if no newer turn has moved the stage meanwhile.
        const moved = await updateSession(sessionId, { stage: currentStage }, stage);
        if (moved) {
          stage = currentStage;
          emit({ type: "stage", stage });
        }
      }
      const patch: { shape: typeof shape; title?: string } = { shape };
      if (stage === "GATE" || stage === "READY") {
        const title =
          shape.gate?.chosen_title?.trim() ||
          shape.gate?.titles?.[0]?.trim() ||
          shape.framework?.name?.trim();
        if (title) patch.title = titleFromText(title);
      }
      await updateSession(sessionId, patch);
      emit({ type: "shape", shape });
    }

    emit({ type: "done" });
  });
}
