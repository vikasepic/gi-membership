import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { COACH_MODEL, anthropic } from "@/lib/anthropic";
import { transcriptText } from "./format";
import type { Stage } from "./stages";
import type { MessageRecord, Shape } from "./types";

// The product taking shape, read out of the transcript by a structured model
// call. Not on every turn: when a step locks, at the gate, after a skip, or
// when the coach forgot its stage marker, in which case the extraction's
// reading of the current step stands in for it.

const Str = z.string();
const ShapeSchema = z.object({
  narrow: z
    .object({
      who: Str,
      when: Str,
      stuck: Str,
      want: Str,
      sentence: Str.describe("The one sentence the coach locked the problem in."),
    })
    .nullable()
    .describe("Filled once the coach has locked WHO, WHEN, STUCK and WANT."),
  replay: z
    .object({
      client: Str.describe("Who the replayed case was, as the user described them."),
      sequence: z.array(Str).describe("What the user did, in order, as they replayed it."),
      earned: z
        .array(Str)
        .describe("Earned insights: what most people get wrong, what the user believed that turned out false."),
    })
    .nullable()
    .describe("Filled once the user has replayed one real case."),
  framework: z
    .object({
      name: Str,
      steps: z.array(Str).describe("The steps in order, each a short name."),
    })
    .nullable()
    .describe("Filled once the framework name and steps are locked."),
  story: z
    .object({ stuck: Str, turn: Str, result: Str, tell: Str })
    .nullable()
    .describe("Filled once the proof story has its four beats."),
  equip: z
    .object({
      mistakes: z.array(Str),
      questions: z.array(Str).describe("The questions clients always ask."),
      fill_ins: z.array(Str).describe("What the user would hand someone to fill in."),
      finished: Str.describe("What the reader has finished or in hand at the end."),
    })
    .nullable()
    .describe("Filled once the equip rounds are done."),
  gate: z
    .object({
      buyer: Str,
      problem: Str,
      promise: Str,
      tools: z.array(Str),
      titles: z.array(Str).describe("The title options the coach offered, verbatim."),
      chosen_title: Str.nullable().describe(
        "The title the user picked or wrote, verbatim; null if not chosen yet.",
      ),
    })
    .nullable()
    .describe("Filled once the coach has shown the whole shape on one screen."),
  current_stage: z
    .enum(["NARROW", "REPLAY", "NAME", "PROVE", "EQUIP", "GATE", "READY"])
    .describe(
      "The step the coach is in after its latest reply: the step its last question or statement belongs to. READY only once the user has confirmed the shape and the coach told them to build.",
    ),
});

const EXTRACT_SYSTEM =
  "You read a coaching transcript in which a coach is helping someone shape a short sellable guide, step by step: NARROW (who, when, stuck, want), REPLAY (one real client replayed), NAME (framework name and steps), PROVE (the proof story in four beats), EQUIP (mistakes, questions, fill-ins, what the reader finishes with), GATE (the whole shape and title options). Extract what has actually been covered so far. Fill a section only when the transcript contains that material; leave a section null if the coach has not got there yet. When the user skipped a step, the coach's guesses for it, marked \"(guess)\", are that section's material: copy them with their markers. Copy the user's and the coach's wording; do not improve it, do not add anything. If something was later changed, use the latest version. Also report which step the coach is in after its latest reply.";

export async function extractShape(
  messages: MessageRecord[],
): Promise<{ shape: Shape; currentStage: Stage } | null> {
  try {
    const response = await anthropic().messages.parse({
      model: COACH_MODEL,
      max_tokens: 8000,
      output_config: {
        effort: "low",
        format: zodOutputFormat(ShapeSchema),
      },
      system: EXTRACT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `<transcript>\n${transcriptText(messages)}\n</transcript>\n\nExtract what has been covered so far.`,
        },
      ],
    });
    const parsed = response.parsed_output;
    if (!parsed) return null;
    const { current_stage, ...shape } = parsed;
    return { shape: shape as Shape, currentStage: current_stage as Stage };
  } catch (err) {
    // Best effort: the reply already reached the member. A missed extraction
    // costs a panel update, not a turn.
    console.error("[product-builder] shape extraction failed", err);
    return null;
  }
}
