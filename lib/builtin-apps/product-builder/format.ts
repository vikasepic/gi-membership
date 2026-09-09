import type { MessageRecord, Shape } from "./types";

// Pure text shaping for the prompts and the session list. No server imports,
// so every line here is testable without a database.

/** The coaching conversation as plain text, for the build prompts. */
export function transcriptText(messages: MessageRecord[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "ME" : "COACH"}: ${m.content.trim()}`)
    .join("\n\n");
}

function list(items: string[] | undefined, indent = "  "): string[] {
  return (items ?? []).map((s, i) => `${indent}${i + 1}. ${s}`);
}

/** The shape as plain text, for the build prompts. */
export function shapeText(shape: Shape | null): string {
  if (!shape) return "(the coach did not produce a structured shape)";
  const lines: string[] = [];
  if (shape.narrow) {
    lines.push(
      "The problem",
      `  Who: ${shape.narrow.who}`,
      `  When: ${shape.narrow.when}`,
      `  Stuck: ${shape.narrow.stuck}`,
      `  Want: ${shape.narrow.want}`,
      `  In one sentence: ${shape.narrow.sentence}`,
    );
  }
  if (shape.replay) {
    lines.push(
      "The replayed case",
      `  Client: ${shape.replay.client}`,
      "  What happened, in order:",
      ...list(shape.replay.sequence, "    "),
      "  Earned insights:",
      ...list(shape.replay.earned, "    "),
    );
  }
  if (shape.framework) {
    lines.push(`The framework: ${shape.framework.name}`, ...list(shape.framework.steps));
  }
  if (shape.story) {
    lines.push(
      "The proof story",
      `  Stuck: ${shape.story.stuck}`,
      `  Turn: ${shape.story.turn}`,
      `  Result: ${shape.story.result}`,
      `  Tell: ${shape.story.tell}`,
    );
  }
  if (shape.equip) {
    lines.push(
      "The equip list",
      "  Mistakes:",
      ...list(shape.equip.mistakes, "    "),
      "  Questions clients ask:",
      ...list(shape.equip.questions, "    "),
      "  Things to fill in:",
      ...list(shape.equip.fill_ins, "    "),
      `  What the reader finishes with: ${shape.equip.finished}`,
    );
  }
  if (shape.gate) {
    lines.push(
      "The gate",
      `  Buyer: ${shape.gate.buyer}`,
      `  Problem: ${shape.gate.problem}`,
      `  Promise: ${shape.gate.promise}`,
      `  Tools: ${shape.gate.tools.join("; ")}`,
      `  Title options: ${shape.gate.titles.join(" | ")}`,
      `  Chosen title: ${shape.gate.chosen_title ?? "(not chosen; use the first option)"}`,
    );
  }
  return lines.length ? lines.join("\n") : "(nothing extracted yet)";
}

/** Short, single-line label for the session list. */
export function titleFromText(text: string, max = 72): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  return line.slice(0, max - 1).trimEnd() + "…";
}

/** The intake form's answers as the first user message, so the coach skips its opening question. */
export function intakeMessage(who: string, what: string, last: string): string {
  if (!who || !what) return "";
  return [
    `I help: ${who}`,
    `With: ${what}`,
    last ? `The last person I helped with this: ${last}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
