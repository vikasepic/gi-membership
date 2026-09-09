import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { COACH_MODEL, anthropic, anthropicConfigured, anthropicErrorCode } from "@/lib/anthropic";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { HOOK_SYSTEM_PROMPT } from "./prompt";
import type { GenerationRecord, GenerationResult, HookFormat } from "./types";

// One generation: the post idea goes to the model with a structured output
// schema, six hooks come back, and the result is kept as history.

export const POST_IDEA_MAX = 1500;
const FIELD_MAX = 200;

const HookSchema = z.object({
  style: z.string(),
  hook: z.string(),
  on_screen: z
    .string()
    .nullable()
    .describe("Reel format only: on-screen text version, 8 words or fewer. Null for carousels."),
  why_it_stops_the_scroll: z
    .string()
    .describe("One sentence: which shareability trigger it hits and for whom."),
});

const HooksOutput = z.object({
  assumed_audience: z
    .string()
    .nullable()
    .describe("One line, only if audience had to be inferred; else null."),
  hooks: z.array(HookSchema),
});

export type GenerateInput = {
  postIdea: string;
  niche: string;
  audience: string;
  tone: string;
  format: HookFormat;
};

/**
 * The request body, trimmed and capped. Pure, so the shape a browser may send
 * is pinned by a test rather than by whatever the form happens to post.
 */
export function parseGenerateInput(
  body: unknown,
): { ok: true; input: GenerateInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const postIdea = typeof b.post_idea === "string" ? b.post_idea.trim() : "";
  if (!postIdea) return { ok: false, error: "post_idea is required" };
  if (postIdea.length > POST_IDEA_MAX) return { ok: false, error: "post_idea_too_long" };
  return {
    ok: true,
    input: {
      postIdea,
      niche: str(b.niche, FIELD_MAX),
      audience: str(b.audience, FIELD_MAX),
      tone: str(b.tone, FIELD_MAX),
      format: b.format === "reel" ? "reel" : "carousel",
    },
  };
}

/** What the model is asked, as the standalone app asked it. Pure. */
export function userMessageFor(input: GenerateInput, year = new Date().getFullYear()): string {
  return [
    `POST_IDEA: ${input.postIdea}`,
    `NICHE: ${input.niche || "(not provided — infer from the post idea)"}`,
    `AUDIENCE: ${input.audience || "(not provided — infer from the post idea)"}`,
    `FORMAT: ${input.format}`,
    `TONE: ${input.tone || "(not provided — match the niche's dominant winning tone)"}`,
    `CURRENT_YEAR: ${year}`,
  ].join("\n");
}

export type GenerateOutcome =
  | { ok: true; result: GenerationResult; record: GenerationRecord | null }
  | { ok: false; error: string; status: number };

export async function generateHooks(userId: string, input: GenerateInput): Promise<GenerateOutcome> {
  if (!anthropicConfigured()) return { ok: false, error: "server_misconfigured", status: 500 };

  let result: GenerationResult | null = null;
  try {
    const response = await anthropic().messages.parse({
      model: COACH_MODEL,
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(HooksOutput) },
      system: HOOK_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessageFor(input) }],
    });
    result = response.parsed_output ?? null;
  } catch (err) {
    console.error("[hook-generator] model call failed", err);
    const code = anthropicErrorCode(err);
    return { ok: false, error: code, status: code === "busy_try_again" ? 503 : 502 };
  }
  if (!result || !result.hooks?.length) {
    return { ok: false, error: "generation_failed", status: 502 };
  }

  // History is a convenience; the member already has their hooks. A failed
  // write is logged, not surfaced.
  const record = await saveGeneration(userId, input, result);
  return { ok: true, result, record };
}

const COLUMNS = "id, post_idea, niche, audience, format, tone, hooks, created_at";

async function saveGeneration(
  userId: string,
  input: GenerateInput,
  result: GenerationResult,
): Promise<GenerationRecord | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("hook_generations")
    .insert({
      store_id: await getStoreId(),
      user_id: userId,
      post_idea: input.postIdea,
      niche: input.niche || null,
      audience: input.audience || null,
      format: input.format,
      tone: input.tone || null,
      hooks: result,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    console.error("[hook-generator] failed to save generation", error);
    return null;
  }
  return data as unknown as GenerationRecord;
}

export async function listGenerations(userId: string, limit = 20): Promise<GenerationRecord[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("hook_generations")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as unknown as GenerationRecord[]) ?? [];
}
