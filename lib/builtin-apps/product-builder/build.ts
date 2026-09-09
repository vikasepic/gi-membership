import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { BUILD_MODEL, anthropic, anthropicConfigured, anthropicErrorCode } from "@/lib/anthropic";
import { sseResponse, type Emit } from "./sse";
import { stripDashes } from "./text";
import { shapeText, transcriptText } from "./format";
import { loadLatestGuide, loadMessages, loadOwnedSession, saveDocument } from "./sessions";
import { BUILD_SYSTEM_PROMPT, FOLLOWUP_INSTRUCTIONS } from "./prompts";
import { DOCUMENT_TITLES, type FollowupKind } from "./stages";
import type { DocumentKind } from "./types";

// The build: the whole guide (or the worksheet pack pulled from it) written
// in one streaming call from the transcript and the confirmed shape. A full
// guide is 7,000 to 10,000 words and streams for several minutes; the store
// runs as a long-lived Node process, so nothing here has a time limit but
// the proxy in front of it.

const KINDS: DocumentKind[] = ["guide", "pack"];
const MAX_CONTINUATIONS = 2;

export function isDocumentKind(v: unknown): v is DocumentKind {
  return typeof v === "string" && (KINDS as string[]).includes(v);
}

const json = (error: string, status: number) => Response.json({ error }, { status });

export async function buildDocument(input: {
  userId: string;
  sessionId: string;
  kind: DocumentKind;
}): Promise<Response> {
  const { userId, sessionId, kind } = input;
  if (!sessionId) return json("bad_request", 400);
  if (!anthropicConfigured()) return json("server_misconfigured", 500);

  const session = await loadOwnedSession(sessionId, userId);
  if (!session) return json("not_found", 404);
  if (session.stage !== "GATE" && session.stage !== "READY") return json("not_ready", 409);

  const history = await loadMessages(sessionId);
  const guide = kind === "guide" ? null : await loadLatestGuide(sessionId);
  if (kind !== "guide" && !guide) return json("no_guide_yet", 409);

  const parts: string[] = [
    "Here is the whole coaching conversation. Everything in the product must come from it.",
    `<transcript>\n${transcriptText(history)}\n</transcript>`,
    "Here is the shape I confirmed at the GATE step.",
    `<shape>\n${shapeText(session.shape)}\n</shape>`,
  ];
  if (guide) {
    parts.push("Here is the current guide.");
    parts.push(`<guide>\n${guide.content}\n</guide>`);
  }
  parts.push(kind === "guide" ? "Write the whole product now." : FOLLOWUP_INSTRUCTIONS[kind as FollowupKind]);

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: parts.join("\n\n") }];

  return sseResponse(async (emit: Emit) => {
    let content = "";
    let truncated = false;

    try {
      for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
        const stream = anthropic().messages.stream({
          model: BUILD_MODEL,
          max_tokens: 96000,
          output_config: { effort: "high" },
          system: [{ type: "text", text: BUILD_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages,
        });

        let roundText = "";
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = stripDashes(event.delta.text);
            roundText += text;
            emit({ type: "text", text });
          }
        }
        const final = await stream.finalMessage();
        content += roundText;

        if (final.stop_reason === "refusal") {
          emit({ type: "error", code: "ai_declined" });
          return;
        }
        if (final.stop_reason !== "max_tokens") break;

        truncated = true;
        if (round === MAX_CONTINUATIONS) break;
        truncated = false;
        messages.push({ role: "assistant", content: roundText });
        messages.push({
          role: "user",
          content:
            "You were cut off. Continue from exactly where you stopped, mid sentence if needed. No recap, no preamble.",
        });
      }
    } catch (err) {
      console.error("[product-builder] build stream failed", err);
      emit({ type: "error", code: anthropicErrorCode(err) });
      return;
    }

    const trimmed = content.trim();
    if (!trimmed) {
      emit({ type: "error", code: "generation_failed" });
      return;
    }

    const document = await saveDocument({
      sessionId,
      userId,
      kind,
      title: DOCUMENT_TITLES[kind],
      content: trimmed,
      model: BUILD_MODEL,
      truncated,
    });
    if (!document) {
      emit({ type: "error", code: "save_failed" });
      return;
    }

    emit({ type: "document", document });
    emit({ type: "done" });
  });
}
